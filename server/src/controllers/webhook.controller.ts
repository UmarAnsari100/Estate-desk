import { createHmac, timingSafeEqual } from "node:crypto";
import { RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { receiveMessage } from "../services/conversation.service.js";
import { db } from "../repositories/db.js";
import { logger } from "../utils/logger.js";
export function verifyChallenge(query: Record<string, unknown>, token: string) {
  return token &&
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === token &&
    typeof query["hub.challenge"] === "string"
    ? query["hub.challenge"]
    : null;
}
export function validSignature(
  raw: Buffer | unknown,
  signature: string | undefined,
  secret: string,
) {
  if (
    !Buffer.isBuffer(raw) ||
    !secret ||
    !signature ||
    !/^sha256=[a-f0-9]{64}$/.test(signature)
  )
    return false;
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`,
  );
  return timingSafeEqual(expected, Buffer.from(signature));
}
const payloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            contacts: z
              .array(
                z.object({
                  wa_id: z.string(),
                  profile: z.object({ name: z.string() }).optional(),
                }),
              )
              .optional(),
            messages: z
              .array(
                z.object({
                  id: z.string().min(1),
                  from: z
                    .string()
                    .regex(/^\+?\d{7,15}$/)
                    .transform((v) => v.replace(/^\+/, "")),
                  timestamp: z.coerce.string().regex(/^\d+$/),
                  type: z.string(),
                  text: z
                    .object({ body: z.string().max(10000).optional().default("") })
                    .optional(),
                }),
              )
              .max(100)
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  timestamp: z.string().optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});
export const verifyWebhook: RequestHandler = (req, res) => {
  const challenge = verifyChallenge(req.query, env.WHATSAPP_VERIFY_TOKEN);
  if (challenge === null) {
    res.sendStatus(403);
    return;
  }
  res.type("text/plain").send(challenge);
};
export const receiveWebhook: RequestHandler = async (req, res) => {
  if (
    !validSignature(
      req.body,
      req.header("x-hub-signature-256"),
      env.WHATSAPP_APP_SECRET,
    )
  ) {
    res.sendStatus(401);
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.body.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  const validation = payloadSchema.safeParse(parsed);
  if (!validation.success) {
    logger.info(
      { issues: validation.error.issues },
      "Ignoring unhandled or non-matching Meta webhook payload",
    );
    res.sendStatus(200);
    return;
  }
  const payload = validation.data;
  for (const entry of payload.entry)
    for (const change of entry.changes) {
      const v = change.value;
      if (
        env.WHATSAPP_PHONE_NUMBER_ID &&
        v.metadata?.phone_number_id &&
        v.metadata.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID
      )
        continue;
      for (const m of v.messages || []) {
        if (
          env.WHATSAPP_PHONE_NUMBER_ID &&
          m.from === env.WHATSAPP_PHONE_NUMBER_ID
        )
          continue;
        const tsNum = Number(m.timestamp);
        const timestamp =
          tsNum > 1e11 ? new Date(tsNum) : new Date(tsNum * 1000);
        await receiveMessage({
          id: m.id,
          phone: m.from,
          name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
          text: m.text?.body || `[${m.type} message requires an agent]`,
          type: m.type,
          timestamp,
          simulated: false,
        });
      }
      for (const s of v.statuses || []) {
        const statusUpper = s.status.toUpperCase();
        const allowed =
          statusUpper === "SENT"
            ? ["SENDING", "SENT"]
            : statusUpper === "DELIVERED"
              ? ["SENDING", "SENT", "DELIVERED"]
              : statusUpper === "READ"
                ? ["SENDING", "SENT", "DELIVERED", "READ"]
                : ["SENDING", "SENT", "UNKNOWN"];
        await db.message.updateMany({
          where: { whatsappMessageId: s.id, status: { in: allowed } },
          data: { status: statusUpper },
        });
        if (statusUpper === "FAILED") {
          const failedMsg = await db.message.findFirst({
            where: { whatsappMessageId: s.id },
            select: { conversationId: true },
          });
          if (failedMsg) {
            await db.conversation.update({
              where: { id: failedMsg.conversationId },
              data: { status: "WAITING", humanTakeover: true },
            });
          }
        }
      }
    }
  res.sendStatus(200);
};
