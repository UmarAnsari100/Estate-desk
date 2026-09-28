import { db } from "../repositories/db.js";
import { processMessage } from "./ai-orchestrator.service.js";
import { logger } from "../utils/logger.js";
let stopping = false;
export function stopWorker() {
  stopping = true;
}
export async function runWorker() {
  while (!stopping) {
    try {
      const job = await db.$transaction(async (tx) => {
        // A global advisory lock serializes claims. One active job per conversation.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(987654321)`;
        const active = await tx.processingJob.findMany({
          where: { status: "PROCESSING" },
          include: { message: { select: { conversationId: true } } },
        });
        const next = await tx.processingJob.findFirst({
          where: {
            status: "PENDING",
            message: {
              conversationId: {
                notIn: active.map((j) => j.message.conversationId),
              },
            },
          },
          orderBy: { createdAt: "asc" },
        });
        return next
          ? tx.processingJob.update({
              where: { id: next.id },
              data: { status: "PROCESSING" },
            })
          : null;
      });
      if (job) {
        try {
          await processMessage(job.messageId);
          await db.processingJob.update({
            where: { id: job.id },
            data: { status: "DONE" },
          });
          const completed = await db.message.findUniqueOrThrow({
            where: { id: job.messageId },
            select: { conversationId: true },
          });
          await db.processingJob.updateMany({
            where: {
              status: "FAILED",
              message: { conversationId: completed.conversationId },
            },
            data: { status: "RESOLVED", error: null },
          });
        } catch {
          logger.error(
            { jobId: job.id },
            "AI processing failed; human review required",
          );
          await db.processingJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              error:
                "Gemini processing failed. Check the API key, model access and quota, then resume AI.",
            },
          });
          const m = await db.message.findUniqueOrThrow({
            where: { id: job.messageId },
          });
          await db.conversation.update({
            where: { id: m.conversationId },
            data: { humanTakeover: true, status: "WAITING" },
          });
        }
      } else await new Promise((r) => setTimeout(r, 1000));
      // Stale jobs are deliberately not retried: a provider may have accepted a send.
      const stale = await db.processingJob.findMany({
        where: {
          status: "PROCESSING",
          updatedAt: { lt: new Date(Date.now() - 180000) },
        },
      });
      for (const j of stale) {
        await db.processingJob.update({
          where: { id: j.id },
          data: {
            status: "FAILED",
            error: "Worker interrupted; verify delivery before manual reply",
          },
        });
        const m = await db.message.findUniqueOrThrow({
          where: { id: j.messageId },
        });
        await db.conversation.update({
          where: { id: m.conversationId },
          data: { humanTakeover: true, status: "WAITING" },
        });
      }
    } catch {
      logger.error("Worker database operation failed");
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
