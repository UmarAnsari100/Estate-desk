import { app } from "./app.js";
import { env } from "./config/env.js";
import { db } from "./repositories/db.js";
import { logger } from "./utils/logger.js";
import { runWorker, stopWorker } from "./services/worker.service.js";
await db.$connect();
await db.businessSettings.upsert({
  where: { id: "singleton" },
  create: {},
  update: {},
});
await db.aISettings.upsert({
  where: { id: "singleton" },
  create: {},
  update: {},
});
const server = app.listen(
  env.PORT,
  env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  () =>
    logger.info(
      { port: env.PORT, mockMode: env.MOCK_MODE },
      "Estate Desk started",
    ),
);
const worker = runWorker();
let shutdownHook: () => Promise<void> = async () => {};
export function setShutdownHook(hook: () => Promise<void>) {
  shutdownHook = hook;
}
let shuttingDown = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopWorker();
    server.close(async () => {
      await worker;
      await db.$disconnect();
      await shutdownHook();
      process.exit(0);
    });
  });
