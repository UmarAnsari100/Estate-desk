import { createHmac, timingSafeEqual } from "node:crypto";
import { RequestHandler } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { receiveMessage } from "../services/conversation.service.js";
import { db } from "../repositories/db.js";
export function verifyChallenge(query: Record<string, unknown>, token: string) {
  return token &&
    query["hub.mode"] === "subscribe" &&
    query["hub.verify_token"] === token &&
    typeof query["hub.challenge"] === "string"
    ? query["hub.challenge"]
    : null;
}
export function validSignature(
  raw: Buffer,
  signature: string | undefined,
  secret: string,
) {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
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
                  from: z.string().regex(/^\d{7,15}$/),
                  timestamp: z.string().regex(/^\d+$/),
                  type: z.string(),
                  text: z.object({ body: z.string().max(10000) }).optional(),
                }),
              )
              .max(100)
              .optional(),
            statuses: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.enum(["sent", "delivered", "read", "failed"]),
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
  const payload = payloadSchema.parse(parsed);
  for (const entry of payload.entry)
    for (const change of entry.changes) {
      const v = change.value;
      if (v.metadata?.phone_number_id !== env.WHATSAPP_PHONE_NUMBER_ID)
        continue;
      for (const m of v.messages || [])
        await receiveMessage({
          id: m.id,
          phone: m.from,
          name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
          text: m.text?.body || `[${m.type} message requires an agent]`,
          type: m.type,
          timestamp: new Date(Number(m.timestamp) * 1000),
          simulated: false,
        });
      for (const s of v.statuses || []) {
        const allowed =
          s.status === "sent"
            ? ["SENDING", "SENT"]
            : s.status === "delivered"
              ? ["SENDING", "SENT", "DELIVERED"]
              : s.status === "read"
                ? ["SENDING", "SENT", "DELIVERED", "READ"]
                : ["SENDING", "SENT", "UNKNOWN"];
        await db.message.updateMany({
          where: { whatsappMessageId: s.id, status: { in: allowed } },
          data: { status: s.status.toUpperCase() },
        });
      }
    }
  res.sendStatus(200);
};
