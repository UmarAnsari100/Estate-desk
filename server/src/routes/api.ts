import { Router } from "express";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../repositories/db.js";
import { env } from "../config/env.js";
import { auth, sameOrigin } from "../middleware/auth.js";
import { propertySchema, leadStatus } from "../types/schemas.js";
import { propertyService } from "../services/property.service.js";
import { receiveMessage, takeover } from "../services/conversation.service.js";
import { sendReply } from "../services/message.service.js";
import { whatsappService } from "../services/whatsapp.service.js";
import { AppError } from "../utils/errors.js";
export const api = Router();
api.use(sameOrigin);
const id = (v: unknown) => z.string().min(1).max(100).parse(v);
api.get("/auth/setup-status", async (_req, res) =>
  res.json({
    setupRequired:
      env.NODE_ENV !== "production" && (await db.admin.count()) === 0,
  }),
);
api.post(
  "/auth/setup",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }),
  async (req, res) => {
    if (env.NODE_ENV === "production")
      throw new AppError(
        403,
        "Provision your administrator using the server setup command",
      );
    const input = z
      .object({
        name: z.string().trim().min(1).max(100),
        email: z.email().transform((v) => v.toLowerCase()),
        password: z.string().min(14, "Use at least 14 characters").max(72),
      })
      .parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(73189243)`;
      if ((await tx.admin.count()) !== 0)
        throw new AppError(
          409,
          "An administrator already exists. Sign in with that account.",
        );
      await tx.admin.create({
        data: { name: input.name, email: input.email, passwordHash },
      });
    });
    res.status(201).json({ created: true });
  },
);
api.post(
  "/auth/login",
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 }),
  async (req, res) => {
    const input = z
      .object({ email: z.email(), password: z.string().min(1).max(200) })
      .parse(req.body);
    const admin = await db.admin.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    const hash =
      admin?.passwordHash ||
      "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYpQwFmBQKhGtPvLcGWmrH.YKWb.JK1S";
    const valid = await bcrypt.compare(input.password, hash);
    if (!admin || !valid) throw new AppError(401, "Invalid email or password");
    res
      .cookie(
        "session",
        jwt.sign({}, env.JWT_SECRET, {
          subject: admin.id,
          expiresIn: "8h",
          issuer: "estate-desk",
          audience: "admin",
        }),
        {
          httpOnly: true,
          secure: env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 8 * 3600000,
          path: "/api",
        },
      )
      .json({ name: admin.name, email: admin.email });
  },
);
api.post("/auth/logout", (_req, res) =>
  res
    .clearCookie("session", {
      path: "/api",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
    })
    .sendStatus(204),
);
api.use(auth);
api.get("/auth/me", async (_req, res) =>
  res.json(
    await db.admin.findUnique({
      where: { id: res.locals.adminId },
      select: { id: true, name: true, email: true },
    }),
  ),
);
api.get("/dashboard", async (_req, res) => {
  const [
    totalLeads,
    newLeads,
    qualifiedLeads,
    activeConversations,
    aiConversations,
    humanTakeovers,
    availableProperties,
    viewingRequests,
    recentLeads,
    failedJobs,
  ] = await Promise.all([
    db.lead.count(),
    db.lead.count({ where: { status: "NEW" } }),
    db.lead.count({ where: { status: "QUALIFIED" } }),
    db.conversation.count({ where: { status: "ACTIVE" } }),
    db.conversation.count({
      where: {
        aiEnabled: true,
        humanTakeover: false,
        status: { not: "CLOSED" },
      },
    }),
    db.conversation.count({ where: { humanTakeover: true } }),
    db.property.count({ where: { status: "AVAILABLE" } }),
    db.viewingRequest.count({ where: { status: "REQUESTED" } }),
    db.lead.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        conversation: { select: { simulated: true, lastMessageAt: true } },
      },
    }),
    db.processingJob.findMany({
      where: {
        status: "FAILED",
        message: { conversation: { humanTakeover: true } },
      },
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: { message: { select: { conversationId: true } } },
    }),
  ]);
  res.json({
    totalLeads,
    newLeads,
    qualifiedLeads,
    activeConversations,
    aiConversations,
    humanTakeovers,
    availableProperties,
    viewingRequests,
    recentLeads,
    failedJobs,
  });
});
api.get("/properties", async (req, res) =>
  res.json(await propertyService.search(req.query)),
);
api.post("/properties", async (req, res) =>
  res
    .status(201)
    .json(await db.property.create({ data: propertySchema.parse(req.body) })),
);
api.patch("/properties/:id", async (req, res) => {
  const data = propertySchema.partial().parse(req.body);
  res.json(
    await db.property.update({
      where: { id: id(req.params.id) },
      data: {
        ...data,
        ...(data.status === "AVAILABLE" ? { requiresReview: false } : {}),
      },
    }),
  );
});
api.delete("/properties/:id", async (req, res) =>
  res.json(
    await db.property.update({
      where: { id: id(req.params.id) },
      data: { status: "INACTIVE" },
    }),
  ),
);
api.get("/customers", async (_req, res) =>
  res.json(
    await db.customer.findMany({ take: 100, orderBy: { updatedAt: "desc" } }),
  ),
);
api.get("/conversations", async (_req, res) =>
  res.json(
    await db.conversation.findMany({
      take: 100,
      orderBy: { lastMessageAt: "desc" },
      include: {
        customer: true,
        lead: true,
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
    }),
  ),
);
api.get("/conversations/:id", async (req, res) => {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: id(req.params.id) },
    include: {
      customer: true,
      lead: true,
      messages: { take: 100, orderBy: { createdAt: "desc" } },
    },
  });
  res.json({ ...conversation, messages: conversation.messages.reverse() });
});
api.post("/conversations/:id/read", async (req, res) =>
  res.json(
    await db.conversation.update({
      where: { id: id(req.params.id) },
      data: { unread: 0 },
    }),
  ),
);
api.post("/conversations/:id/takeover", async (req, res) =>
  res.json(await takeover(id(req.params.id), res.locals.adminId)),
);
api.post("/conversations/:id/resume", async (req, res) =>
  res.json(await takeover(id(req.params.id), res.locals.adminId, true)),
);
api.patch("/conversations/:id", async (req, res) =>
  res.json(
    await db.conversation.update({
      where: { id: id(req.params.id) },
      data: z
        .object({
          status: z.enum(["ACTIVE", "WAITING", "CLOSED"]).optional(),
          aiEnabled: z.boolean().optional(),
        })
        .parse(req.body),
    }),
  ),
);
const manual = async (req: any, res: any) => {
  const input = z
    .object({
      conversationId: z.string(),
      content: z.string().trim().min(1).max(4000),
    })
    .parse(req.body);
  res.json(await sendReply(input.conversationId, input.content, "ADMIN"));
};
api.post("/messages", manual);
api.post("/whatsapp/send", manual);
api.get("/whatsapp/status", async (_req, res) =>
  res.json(await whatsappService.getConnectionStatus()),
);
api.get("/whatsapp/qr", async (_req, res) =>
  res.json(await whatsappService.getQrCode()),
);
api.post("/whatsapp/connect", async (_req, res) => {
  if (!env.EVOLUTION_WEBHOOK_SECRET)
    throw new AppError(503, "Evolution webhook secret is not configured");
  const webhook = new URL("/api/whatsapp/webhook", env.PUBLIC_API_URL);
  webhook.searchParams.set("token", env.EVOLUTION_WEBHOOK_SECRET);
  await whatsappService.connect(webhook.toString());
  res.json({ connected: true });
});
api.get("/leads", async (req, res) =>
  res.json(
    await db.lead.findMany({
      where: {
        status: req.query.status
          ? leadStatus.parse(req.query.status)
          : undefined,
      },
      take: 100,
      orderBy: { updatedAt: "desc" },
      include: {
        conversation: { select: { lastMessageAt: true, simulated: true } },
      },
    }),
  ),
);
api.patch("/leads/:id", async (req, res) =>
  res.json(
    await db.lead.update({
      where: { id: id(req.params.id) },
      data: z
        .object({
          status: leadStatus.optional(),
          notes: z.string().max(5000).optional(),
          interestedPropertyId: z.string().nullable().optional(),
        })
        .parse(req.body),
    }),
  ),
);
api.get("/viewings", async (_req, res) =>
  res.json(
    await db.viewingRequest.findMany({
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        property: true,
        conversation: { include: { customer: true } },
      },
    }),
  ),
);
api.patch("/viewings/:id", async (req, res) =>
  res.json(
    await db.viewingRequest.update({
      where: { id: id(req.params.id) },
      data: z
        .object({
          status: z.enum(["REQUESTED", "CONFIRMED", "CANCELLED", "COMPLETED"]),
          requestedDate: z.string().max(200).optional(),
          preferredTime: z.string().max(200).optional(),
          notes: z.string().max(3000).optional(),
        })
        .parse(req.body),
    }),
  ),
);
api.get("/settings/:type", async (req, res) => {
  if (req.params.type === "business")
    res.json(
      await db.businessSettings.findUnique({ where: { id: "singleton" } }),
    );
  else if (req.params.type === "ai")
    res.json(await db.aISettings.findUnique({ where: { id: "singleton" } }));
  else if (req.params.type === "whatsapp")
    res.json({
      provider: "Evolution Go",
      mockMode: env.MOCK_MODE,
      geminiConfigured: !!env.GEMINI_API_KEY,
      whatsappConfigured: !!(
        env.EVOLUTION_API_URL &&
        env.EVOLUTION_INSTANCE_TOKEN &&
        env.EVOLUTION_WEBHOOK_SECRET
      ),
      apiUrl: env.EVOLUTION_API_URL,
      instanceName: env.EVOLUTION_INSTANCE_NAME || "Instance token configured",
      model: env.GEMINI_MODEL,
      webhookPath: "/api/whatsapp/webhook",
    });
  else throw new AppError(404, "Not found");
});
api.put("/settings/business", async (req, res) => {
  const short = z.string().max(1000);
  res.json(
    await db.businessSettings.update({
      where: { id: "singleton" },
      data: z
        .object({
          companyName: short,
          description: short,
          phone: short,
          email: short,
          officeAddress: short,
          website: short,
          businessHours: short,
          defaultGreeting: short,
          supportedLanguages: z
            .array(z.enum(["English", "Urdu", "Roman Urdu"]))
            .min(1),
        })
        .parse(req.body),
    }),
  );
});
api.put("/settings/ai", async (req, res) =>
  res.json(
    await db.aISettings.update({
      where: { id: "singleton" },
      data: z
        .object({
          enabled: z.boolean(),
          personality: z.string().max(1000),
          instructions: z.string().max(3000),
          defaultLanguage: z.enum(["English", "Urdu", "Roman Urdu"]),
          humanEscalationRules: z.string().max(3000),
          maxConversationHistory: z.number().int().min(2).max(50),
          temperature: z.number().min(0).max(1),
        })
        .parse(req.body),
    }),
  ),
);
api.post(
  "/ai/test",
  rateLimit({ windowMs: 60000, limit: 20 }),
  async (req, res) => {
    if (!env.MOCK_MODE) throw new AppError(403, "Simulation is disabled");
    const input = z
      .object({
        phone: z.string().regex(/^\d{7,15}$/),
        name: z.string().max(100).optional(),
        text: z.string().trim().min(1).max(4000),
      })
      .parse(req.body);
    res.status(202).json(
      await receiveMessage({
        ...input,
        id: `mock-${randomUUID()}`,
        timestamp: new Date(),
        simulated: true,
      }),
    );
  },
);
