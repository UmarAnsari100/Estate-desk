import { timingSafeEqual } from "node:crypto";
import { RequestHandler } from "express";
import { env } from "../config/env.js";
import { receiveMessage } from "../services/conversation.service.js";
import { db } from "../repositories/db.js";
import { logger } from "../utils/logger.js";

type Json = Record<string, any>;

function sameSecret(actual: unknown, expected: string) {
  if (typeof actual !== "string" || !actual || !expected) return false;
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validEvolutionWebhookSecret(
  queryToken: unknown,
  headerToken: unknown,
  expected: string,
) {
  return sameSecret(queryToken, expected) || sameSecret(headerToken, expected);
}

function jidPhone(value: unknown) {
  if (typeof value !== "string") return null;
  if (
    value.endsWith("@g.us") ||
    value.endsWith("@broadcast") ||
    value.endsWith("@lid")
  )
    return null;
  const local = value.split("@")[0].split(":")[0].replace(/\D/g, "");
  return /^\d{7,15}$/.test(local) ? local : null;
}

function messageText(message: Json) {
  return (
    message.conversation ||
    message.Conversation ||
    message.extendedTextMessage?.text ||
    message.ExtendedTextMessage?.text ||
    message.ExtendedTextMessage?.Text ||
    message.imageMessage?.caption ||
    message.ImageMessage?.caption ||
    message.ImageMessage?.Caption ||
    message.videoMessage?.caption ||
    message.VideoMessage?.caption ||
    message.VideoMessage?.Caption ||
    message.documentMessage?.caption ||
    message.DocumentMessage?.caption ||
    message.DocumentMessage?.Caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    ""
  );
}

function messageType(message: Json, explicit: unknown) {
  const normalize = (value: string) =>
    ["text", "conversation", "extendedtextmessage"].includes(
      value.toLowerCase(),
    )
      ? "text"
      : value;
  if (typeof explicit === "string" && explicit) return normalize(explicit);
  const key = Object.keys(message).find((k) => k !== "messageContextInfo");
  return key ? normalize(key) : "text";
}

function eventTimestamp(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string" && !/^\d+$/.test(value)) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return new Date(n > 1e11 ? n : n * 1000);
  return new Date();
}

export function extractEvolutionMessages(payload: unknown) {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Json;
  const event = String(root.event || root.Event || "").toLowerCase();
  if (
    event &&
    !["message", "messages.upsert", "messages_upsert"].includes(event)
  )
    return [];
  const data = (root.data || root.Data || root) as Json;
  const rows = Array.isArray(data.messages)
    ? data.messages
    : Array.isArray(data.Messages)
      ? data.Messages
      : [data];
  return rows.flatMap((row: Json) => {
    const key = (row.key || row.Key || {}) as Json;
    const info = (row.Info || row.info || {}) as Json;
    const fromMe =
      key.fromMe ?? key.FromMe ?? info.IsFromMe ?? info.isFromMe ?? false;
    if (fromMe) return [];
    const remote = [
      key.remoteJid,
      key.RemoteJid,
      info.Sender,
      info.sender,
      info.Chat,
      info.chat,
      info.SenderAlt,
      info.senderAlt,
      info.ChatAlt,
      info.chatAlt,
    ].find((candidate) => jidPhone(candidate));
    const phone = jidPhone(remote);
    const id = key.id || key.ID || info.ID || info.id;
    if (!phone || typeof id !== "string" || !id) return [];
    const message = (row.message || row.Message || {}) as Json;
    const type = messageType(message, row.messageType || row.MessageType);
    const text = messageText(message);
    return [
      {
        id,
        phone,
        name:
          row.pushName ||
          row.PushName ||
          info.PushName ||
          info.pushName ||
          undefined,
        text: text || `[${type} message requires an agent]`,
        type,
        timestamp: eventTimestamp(
          row.messageTimestamp ||
            row.MessageTimestamp ||
            info.Timestamp ||
            info.timestamp,
        ),
      },
    ];
  });
}

function extractReceipt(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Json;
  const event = String(root.event || root.Event || "").toLowerCase();
  if (!["read_receipt", "messages.update", "messages_update"].includes(event))
    return null;
  const data = (root.data || root.Data || root) as Json;
  const rawIds =
    data.MessageIDs || data.messageIds || data.messages || data.ids || [];
  const ids = Array.isArray(rawIds)
    ? rawIds
        .map((value) =>
          typeof value === "string" ? value : value?.id || value?.ID,
        )
        .filter((value): value is string => typeof value === "string")
    : [];
  const rawStatus = String(
    data.Type || data.type || data.status || "",
  ).toUpperCase();
  const status = rawStatus.includes("READ")
    ? "READ"
    : rawStatus.includes("DELIVER")
      ? "DELIVERED"
      : rawStatus.includes("SENT") || rawStatus.includes("SERVER")
        ? "SENT"
        : null;
  return status && ids.length ? { ids, status } : null;
}

export const receiveWebhook: RequestHandler = async (req, res) => {
  if (!env.EVOLUTION_WEBHOOK_SECRET) {
    res
      .status(503)
      .json({ error: "Evolution webhook secret is not configured" });
    return;
  }
  if (
    !validEvolutionWebhookSecret(
      req.query.token,
      req.header("x-evolution-webhook-secret"),
      env.EVOLUTION_WEBHOOK_SECRET,
    )
  ) {
    res.sendStatus(401);
    return;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const messages = extractEvolutionMessages(payload);
  for (const message of messages)
    await receiveMessage({ ...message, simulated: false });

  const receipt = extractReceipt(payload);
  if (receipt) {
    const allowed =
      receipt.status === "READ"
        ? ["SENDING", "SENT", "DELIVERED", "READ"]
        : receipt.status === "DELIVERED"
          ? ["SENDING", "SENT", "DELIVERED"]
          : ["SENDING", "SENT"];
    await db.message.updateMany({
      where: {
        whatsappMessageId: { in: receipt.ids },
        status: { in: allowed },
      },
      data: { status: receipt.status },
    });
  }
  if (!messages.length && !receipt)
    logger.debug("Ignored non-message Evolution Go webhook event");
  res.sendStatus(200);
};
