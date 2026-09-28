import { randomUUID } from "node:crypto";
import { db } from "../repositories/db.js";
import { lockConversation, aiAllowed } from "./conversation.service.js";
import { whatsappService } from "./whatsapp.service.js";
import { AppError } from "../utils/errors.js";
import { Prisma } from "@prisma/client";
export async function sendReply(
  id: string,
  content: string | ((tx: Prisma.TransactionClient) => Promise<string>),
  sender: "AI" | "ADMIN",
  replyToId?: string,
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
      const message = await tx.message.create({
        data: {
          conversationId: id,
          replyToId,
          content: body,
          sender,
          direction: "OUTGOING",
          status: "SENDING",
          metadata: { simulated: c.simulated },
        },
      });
      try {
        const externalId = c.simulated
          ? `mock-out-${randomUUID()}`
          : await whatsappService.sendTextMessage(
              c.customer.whatsappNumber,
              body,
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
      } catch {
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
              error:
                "Delivery failed or uncertain. Check Meta before retrying.",
            },
          },
        });
      }
    },
    { timeout: 25000, maxWait: 30000 },
  );
}
