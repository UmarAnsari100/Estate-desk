import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { env } from "./config/env.js";
import { api } from "./routes/api.js";
import {
  receiveWebhook,
  verifyWebhook,
} from "./controllers/webhook.controller.js";
import { AppError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";
import { db } from "./repositories/db.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
app.get("/api/health", async (_req, res) => {
  try {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "database unavailable" });
  }
});
app.get("/api/whatsapp/webhook", verifyWebhook);
app.post(
  "/api/whatsapp/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  receiveWebhook,
);
app.use(
  express.json({ limit: "100kb" }),
  cookieParser(),
  rateLimit({ windowMs: 60000, limit: 300 }),
);
app.use("/api", api);
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: "Invalid input",
        fields: error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
      return;
    }
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        res.status(404).json({ error: "Record not found" });
        return;
      }
      if (error.code === "P2002") {
        res.status(409).json({ error: "Record already exists" });
        return;
      }
    }
    logger.error(
      { errorType: error instanceof Error ? error.name : "Unknown" },
      "Request failed",
    );
    res.status(500).json({
      error: "Request failed. Please try again or contact your administrator.",
    });
  },
);
