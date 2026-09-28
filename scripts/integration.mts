import EmbeddedPostgres from "embedded-postgres";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHmac } from "node:crypto";
import assert from "node:assert/strict";
import request from "supertest";
import bcrypt from "bcryptjs";
const port = 55439;
const password = randomUUID();
const directory = resolve(".test-postgres", randomUUID());
await mkdir(directory, { recursive: true });
const pg = new EmbeddedPostgres({
  databaseDir: directory,
  user: "estate_test",
  password,
  port,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let started = false;
try {
  await pg.initialise();
  await pg.start();
  started = true;
  await pg.createDatabase("estate_test");
  const client = pg.getPgClient("estate_test");
  await client.connect();
  for (const migration of [
    "202609260001_initial",
    "202609260002_property_sources",
  ])
    await client.query(
      await readFile(`prisma/migrations/${migration}/migration.sql`, "utf8"),
    );
  await client.end();
  // Credentials belong only to this disposable local database.
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = `postgresql://estate_test:${password}@127.0.0.1:${port}/estate_test`;
  process.env.JWT_SECRET = randomUUID() + randomUUID();
  process.env.CLIENT_URL = process.argv.includes("--preview")
    ? "http://127.0.0.1:5174"
    : "http://localhost:5173";
  process.env.MOCK_MODE = "true";
  process.env.GEMINI_API_KEY = "";
  process.env.WHATSAPP_APP_SECRET = "integration-signature-secret";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "integration-phone-id";
  process.env.WHATSAPP_ACCESS_TOKEN = "";
  const { db } = await import("../server/src/repositories/db.js");
  const { receiveMessage, takeover } =
    await import("../server/src/services/conversation.service.js");
  const { processMessage } =
    await import("../server/src/services/ai-orchestrator.service.js");
  const { sendReply } =
    await import("../server/src/services/message.service.js");
  const { app } = await import("../server/src/app.js");
  try {
    const setupStatus = await request(app)
      .get("/api/auth/setup-status")
      .expect(200);
    assert.equal(setupStatus.body.setupRequired, true);
    const setupAccount = {
      name: "Test Admin",
      email: "integration@example.com",
      password: "a-test-password-only",
    };
    const setups = await Promise.all([
      request(app)
        .post("/api/auth/setup")
        .set("Origin", process.env.CLIENT_URL)
        .send(setupAccount),
      request(app)
        .post("/api/auth/setup")
        .set("Origin", process.env.CLIENT_URL)
        .send({ ...setupAccount, email: "second@example.com" }),
    ]);
    assert.deepEqual(setups.map((r) => r.status).sort(), [201, 409]);
    const admin = await db.admin.findFirstOrThrow();
    // Use the same fixture address below regardless of which concurrent request won.
    await db.admin.update({
      where: { id: admin.id },
      data: { email: setupAccount.email },
    });
    assert.equal(
      (await request(app).get("/api/auth/setup-status")).body.setupRequired,
      false,
    );
    await db.aISettings.create({ data: {} });
    await db.businessSettings.create({ data: {} });
    const common = {
      title: "Test home",
      purpose: "SALE" as const,
      propertyType: "HOUSE",
      city: "Rawalpindi",
      location: "Bahria Town",
      area: 5,
      areaUnit: "MARLA",
      price: 18500000,
      description: "Integration fixture",
      amenities: [],
      images: [],
      demo: true,
    };
    await db.property.create({ data: { ...common, propertyCode: "DEMO-101" } });
    await db.property.create({
      data: {
        ...common,
        propertyCode: "DEMO-102",
        title: "Sold house",
        status: "SOLD",
      },
    });
    const input = {
      id: "wamid.integration.1",
      phone: "923001111111",
      text: "5 marla house in Bahria under 2 crore",
      timestamp: new Date(),
      simulated: true,
    };
    const receipts = await Promise.all([
      receiveMessage(input),
      receiveMessage(input),
      receiveMessage(input),
    ]);
    assert.equal(receipts.filter((r) => !r.duplicate).length, 1);
    assert.equal(await db.message.count(), 1);
    assert.equal(await db.processingJob.count(), 1);
    const c = await db.conversation.findFirstOrThrow();
    const incoming = await db.message.findFirstOrThrow();
    await processMessage(incoming.id);
    await processMessage(incoming.id);
    const replies = await db.message.findMany({
      where: { direction: "OUTGOING" },
    });
    assert.equal(replies.length, 1);
    assert.equal(replies[0].status, "SIMULATED");
    assert.match(replies[0].content, /DEMO-101/);
    assert.doesNotMatch(replies[0].content, /DEMO-102|Sold house/);
    const hello = await receiveMessage({
      ...input,
      id: "wamid.greeting",
      phone: "923001111112",
      text: "hi",
    });
    await processMessage(hello.messageId!);
    const welcome = await db.message.findUniqueOrThrow({
      where: { replyToId: hello.messageId! },
    });
    assert.match(welcome.content, /Hello!/);
    assert.doesNotMatch(welcome.content, /PKR|DEMO-|match your requirements/);
    const plotPhone = "923001111113";
    const plotRequest = await receiveMessage({
      ...input,
      id: "wamid.plot-search",
      phone: plotPhone,
      text: "5 marla plot in B-17 Islamabad",
    });
    await processMessage(plotRequest.messageId!);
    const plotConversation = await db.conversation.findUniqueOrThrow({
      where: { id: plotRequest.conversationId! },
      include: { lead: true },
    });
    assert.deepEqual(
      {
        type: plotConversation.lead?.propertyType,
        location: plotConversation.lead?.preferredLocation,
        city: plotConversation.lead?.city,
        area: Number(plotConversation.lead?.preferredArea),
      },
      { type: "PLOT", location: "B-17", city: "Islamabad", area: 5 },
    );
    const firstPlotReply = await db.message.findUniqueOrThrow({
      where: { replyToId: plotRequest.messageId! },
    });
    assert.match(firstPlotReply.content, /approximate budget/i);
    assert.doesNotMatch(firstPlotReply.content, /No exact match/i);
    const budgetReply = await receiveMessage({
      ...input,
      id: "wamid.plot-budget",
      phone: plotPhone,
      text: "1cr",
    });
    await processMessage(budgetReply.messageId!);
    const updatedPlotLead = await db.lead.findUniqueOrThrow({
      where: { conversationId: plotRequest.conversationId! },
    });
    assert.equal(Number(updatedPlotLead.maximumBudget), 10_000_000);
    const secondPlotReply = await db.message.findUniqueOrThrow({
      where: { replyToId: budgetReply.messageId! },
    });
    assert.match(
      secondPlotReply.content,
      /couldn't find a published exact listing|no exact match/i,
    );
    assert.doesNotMatch(secondPlotReply.content, /approximate budget/i);
    assert.equal(
      Number(
        (await db.lead.findUniqueOrThrow({ where: { conversationId: c.id } }))
          .maximumBudget,
      ),
      20000000,
    );
    await takeover(c.id, admin.id);
    assert.equal(
      await sendReply(c.id, "Late AI response", "AI", "late-response"),
      null,
    );
    const next = await receiveMessage({ ...input, id: "wamid.integration.2" });
    await processMessage(next.messageId!);
    assert.equal(
      await db.message.count({ where: { sender: "AI", conversationId: c.id } }),
      1,
    );
    await sendReply(c.id, "An agent is here to help.", "ADMIN");
    assert.equal(
      await db.message.count({
        where: { sender: "ADMIN", status: "SIMULATED" },
      }),
      1,
    );
    const automaticallyResumed = await db.conversation.findUniqueOrThrow({
      where: { id: c.id },
    });
    assert.equal(automaticallyResumed.humanTakeover, false);
    assert.equal(automaticallyResumed.aiEnabled, true);
    assert.equal(automaticallyResumed.status, "ACTIVE");
    assert.equal(automaticallyResumed.assignedAdminId, null);
    await db.aISettings.update({
      where: { id: "singleton" },
      data: { enabled: false },
    });
    const disabled = await receiveMessage({
      ...input,
      id: "wamid.integration.3",
    });
    await processMessage(disabled.messageId!);
    assert.equal(
      await db.message.count({ where: { sender: "AI", conversationId: c.id } }),
      1,
    );
    const agent = request.agent(app);
    await agent
      .post("/api/auth/login")
      .set("Origin", process.env.CLIENT_URL)
      .send({
        email: "integration@example.com",
        password: "a-test-password-only",
      })
      .expect(200);
    await agent.get("/api/properties").expect(200);
    await agent
      .post("/api/properties")
      .set("Origin", process.env.CLIENT_URL)
      .send({ ...common, propertyCode: "LIVE-1", price: 21000000, area: 10 })
      .expect(201);
    await agent.get("/api/dashboard").expect(200);
    await agent
      .post("/api/ai/test")
      .set("Origin", process.env.CLIENT_URL)
      .send({ phone: "923002222222", text: "Hello" })
      .expect(202);
    await agent
      .post("/api/auth/logout")
      .set("Origin", process.env.CLIENT_URL)
      .expect(204);
    await agent.get("/api/properties").expect(401);
    const webhook = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "integration-phone-id" },
                messages: [
                  {
                    id: "wamid.signed-integration",
                    from: "923009999999",
                    timestamp: String(Math.floor(Date.now() / 1000) - 90000),
                    type: "text",
                    text: { body: "Hello" },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const raw = JSON.stringify(webhook);
    const signature =
      "sha256=" +
      createHmac("sha256", process.env.WHATSAPP_APP_SECRET)
        .update(raw)
        .digest("hex");
    for (let i = 0; i < 2; i++)
      await request(app)
        .post("/api/whatsapp/webhook")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", signature)
        .send(raw)
        .expect(200);
    assert.equal(
      await db.message.count({
        where: { whatsappMessageId: "wamid.signed-integration" },
      }),
      1,
    );
    const live = await db.message.findUniqueOrThrow({
      where: { whatsappMessageId: "wamid.signed-integration" },
    });
    await takeover(live.conversationId, admin.id);
    await assert.rejects(
      () => sendReply(live.conversationId, "Outside window", "ADMIN"),
      /24-hour/,
    );
    const { propertyService } =
      await import("../server/src/services/property.service.js");
    await db.property.create({
      data: { ...common, propertyCode: "REAL-INVENTORY", demo: false },
    });
    for (let i = 0; i < 4; i++)
      await db.property.create({
        data: { ...common, propertyCode: `DEMO-RECENT-${i}` },
      });
    const liveMatches = await propertyService.search(
      { location: "Bahria" },
      true,
      false,
    );
    assert.ok(liveMatches.some((p) => p.propertyCode === "REAL-INVENTORY"));
    assert.ok(liveMatches.every((p) => !p.demo && p.status === "AVAILABLE"));
    console.log(
      "PASS: real PostgreSQL migration, concurrent deduplication, single reply, property grounding, lead extraction, takeover, disabled AI, manual simulation, authentication, CRUD and simulator API.",
    );
    if (process.argv.includes("--preview")) {
      await db.aISettings.update({
        where: { id: "singleton" },
        data: { enabled: true },
      });
      const { runWorker, stopWorker } =
        await import("../server/src/services/worker.service.js");
      const server = app.listen(3001, "127.0.0.1");
      const worker = runWorker();
      console.log("Local isolated preview API ready on port 3001.");
      await new Promise<void>((resolve) => {
        process.once("SIGINT", resolve);
        process.once("SIGTERM", resolve);
      });
      stopWorker();
      await worker;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  } finally {
    await db.$disconnect();
  }
} finally {
  if (started) await pg.stop();
}
