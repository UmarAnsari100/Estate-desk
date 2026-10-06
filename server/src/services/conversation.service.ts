import { Prisma } from "@prisma/client";
import { db } from "../repositories/db.js";
import { identifyCustomer } from "./customer.service.js";
import { databaseSafeText } from "../utils/text.js";
export async function lockConversation(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
}
export function aiAllowed(
  c: { aiEnabled: boolean; humanTakeover: boolean; status: string },
  enabled: boolean,
) {
  return enabled && c.aiEnabled && !c.humanTakeover && c.status !== "CLOSED";
}
export async function receiveMessage(input: {
  id: string;
  phone: string;
  name?: string;
  text: string;
  type?: string;
  timestamp: Date;
  simulated: boolean;
}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.phone}))`;
    if (await tx.message.findUnique({ where: { whatsappMessageId: input.id } }))
      return { duplicate: true };
    const customer = await identifyCustomer(tx, input.phone, input.name);
    const conversation = await tx.conversation.upsert({
      where: {
        customerId_simulated: {
          customerId: customer.id,
          simulated: input.simulated,
        },
      },
      create: { customerId: customer.id, simulated: input.simulated },
      update: {},
    });
    await lockConversation(tx, conversation.id);
    const receivedAt =
      input.timestamp > new Date() ? new Date() : input.timestamp;
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastInboundAt:
          !conversation.lastInboundAt || receivedAt > conversation.lastInboundAt
            ? receivedAt
            : conversation.lastInboundAt,
        unread: { increment: 1 },
      },
    });
    await tx.lead.upsert({
      where: { conversationId: conversation.id },
      create: {
        conversationId: conversation.id,
        customerId: customer.id,
        phone: input.phone,
        name: customer.name,
      },
      update: {},
    });
    const message = await tx.message.create({
      data: {
        conversationId: conversation.id,
        whatsappMessageId: input.id,
        direction: "INCOMING",
        sender: "CUSTOMER",
        type: input.type || "text",
        content: databaseSafeText(input.text),
        createdAt: receivedAt,
        metadata: { simulated: input.simulated },
        job: { create: {} },
      },
    });
    return {
      duplicate: false,
      conversationId: conversation.id,
      messageId: message.id,
    };
  });
}
export async function takeover(id: string, adminId: string, resume = false) {
  return db.$transaction(async (tx) => {
    await lockConversation(tx, id);
    return tx.conversation.update({
      where: { id },
      data: {
        humanTakeover: !resume,
        aiEnabled: resume,
        assignedAdminId: resume ? null : adminId,
        status: resume ? "ACTIVE" : "WAITING",
      },
    });
  });
}
