import { randomUUID } from "node:crypto";
import { db } from "../repositories/db.js";
import { lockConversation, aiAllowed } from "./conversation.service.js";
import { whatsappService } from "./whatsapp.service.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { Prisma } from "@prisma/client";
import { databaseSafeText } from "../utils/text.js";

type ReplyDelivery = {
  imageUrl?: string;
  media?: Array<{ imageUrl: string; caption: string }>;
};

export async function sendReply(
  id: string,
  content: string | ((tx: Prisma.TransactionClient) => Promise<string>),
  sender: "AI" | "ADMIN",
  replyToId?: string,
  delivery: ReplyDelivery = {},
) {
  return db.$transaction(
    async (tx) => {
      await lockConversation(tx, id);
      const c = await tx.conversation.findUniqueOrThrow({
        where: { id },
        include: { customer: true },
      });
      const settings = await tx.aISettings.findUnique({
        where: { id: "singleton" },
      });
      if (sender === "AI" && !aiAllowed(c, settings?.enabled ?? false))
        return null;
      if (sender === "ADMIN" && !c.humanTakeover)
        throw new AppError(409, "Take over the conversation before sending");
      if (
        !c.simulated &&
        (!c.lastInboundAt || Date.now() - c.lastInboundAt.getTime() > 86400000)
      )
        throw new AppError(
          409,
          "The 24-hour customer service window is closed; an approved template is required",
        );
      if (replyToId && (await tx.message.findUnique({ where: { replyToId } })))
        return null;
      const body = typeof content === "string" ? content : await content(tx);
      const safeBody = databaseSafeText(body);
      const media = (delivery.media || []).filter(
        (item) => item.imageUrl && item.caption,
      );
      const sendsImage = Boolean(delivery.imageUrl || media.length);
      const message = await tx.message.create({
        data: {
          conversationId: id,
          replyToId,
          content: safeBody,
          sender,
          direction: "OUTGOING",
          type: sendsImage ? "image" : "text",
          status: "SENDING",
          metadata: {
            simulated: c.simulated,
            ...(delivery.imageUrl ? { imageUrl: delivery.imageUrl } : {}),
            ...(media.length
              ? { imageUrls: media.map((item) => item.imageUrl) }
              : {}),
          },
        },
      });
      try {
        let externalId: string;
        if (c.simulated) externalId = `mock-out-${randomUUID()}`;
        else if (media.length) {
          const externalIds = await Promise.all(
            media.map((item) =>
              whatsappService.sendImageMessage(
                c.customer.whatsappNumber,
                item.imageUrl,
                databaseSafeText(item.caption),
              ),
            ),
          );
          externalId = externalIds[0];
        } else if (delivery.imageUrl)
          externalId = await whatsappService.sendImageMessage(
            c.customer.whatsappNumber,
            delivery.imageUrl,
            safeBody,
          );
        else
          externalId = await whatsappService.sendTextMessage(
            c.customer.whatsappNumber,
            safeBody,
          );
        await tx.conversation.update({
          where: { id },
          data: {
            lastMessageAt: new Date(),
            ...(sender === "ADMIN"
              ? {
                  humanTakeover: false,
                  aiEnabled: true,
                  assignedAdminId: null,
                  status: "ACTIVE" as const,
                }
              : {}),
          },
        });
        return await tx.message.update({
          where: { id: message.id },
          data: {
            status: c.simulated ? "SIMULATED" : "SENT",
            whatsappMessageId: externalId,
          },
        });
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : "Delivery failed or uncertain. Check Evolution Go before retrying.";
        logger.error(
          {
            err,
            conversationId: id,
            phone: c.customer.whatsappNumber,
            simulated: c.simulated,
          },
          "WhatsApp delivery failed; triggering human takeover",
        );
        await tx.conversation.update({
          where: { id },
          data: { status: "WAITING", humanTakeover: true },
        });
        return await tx.message.update({
          where: { id: message.id },
          data: {
            status: "UNKNOWN",
            metadata: {
              simulated: c.simulated,
              error: errorMsg,
            },
          },
        });
      }
    },
    {
      timeout: delivery.imageUrl || delivery.media?.length ? 75000 : 25000,
      maxWait: 30000,
    },
  );
}
