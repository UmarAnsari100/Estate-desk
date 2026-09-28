import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import {
  verifyChallenge,
  validSignature,
} from "../src/controllers/webhook.controller.js";
import { propertyWhere } from "../src/services/property.service.js";
import { nonNullLead } from "../src/services/lead.service.js";
import {
  aiAllowed,
  receiveMessage,
} from "../src/services/conversation.service.js";
import {
  mockAnalysis,
  mockConversationAnalysis,
  greetingAnalysis,
} from "../src/services/gemini.service.js";
import {
  renderNoMatchResponse,
  renderPaymentPlan,
  renderResponse,
} from "../src/services/response.service.js";
import { WhatsAppService } from "../src/services/whatsapp.service.js";
import { db } from "../src/repositories/db.js";
import {
  asksForPaymentPlan,
  startsNewSearch,
} from "../src/services/ai-orchestrator.service.js";
describe("Webhook verification", () => {
  it("returns the challenge only for a matching subscribe token", () => {
    expect(
      verifyChallenge(
        {
          "hub.mode": "subscribe",
          "hub.verify_token": "abc",
          "hub.challenge": "123",
        },
        "abc",
      ),
    ).toBe("123");
    expect(
      verifyChallenge(
        {
          "hub.mode": "subscribe",
          "hub.verify_token": "wrong",
          "hub.challenge": "123",
        },
        "abc",
      ),
    ).toBeNull();
    expect(
      verifyChallenge(
        {
          "hub.mode": "other",
          "hub.verify_token": "abc",
          "hub.challenge": "123",
        },
        "abc",
      ),
    ).toBeNull();
  });
  it("validates raw bytes and rejects tampering", () => {
    const raw = Buffer.from('{"entry":[]}');
    const signature =
      "sha256=" + createHmac("sha256", "secret").update(raw).digest("hex");
    expect(validSignature(raw, signature, "secret")).toBe(true);
    expect(validSignature(Buffer.from("{}"), signature, "secret")).toBe(false);
    expect(validSignature(raw, "bad", "secret")).toBe(false);
  });
  it("serves the verification HTTP route", async () => {
    await request(app)
      .get(
        "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=789",
      )
      .expect(200, "789");
    await request(app)
      .get("/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=no")
      .expect(403);
  });
  it("rejects unsigned webhook bodies", async () => {
    await request(app)
      .post("/api/whatsapp/webhook")
      .send({ object: "whatsapp_business_account", entry: [] })
      .expect(401);
  });
});
describe("Critical business rules", () => {
  it.each([
    "hi",
    " Hi! ",
    "Hi ! How are you ?",
    "hello 👋",
    "hey",
    "Assalam o alaikum",
    "السلام علیکم",
  ])(
    "recognizes standalone greeting %s without extracting inventory requirements",
    (text) => {
      const result = greetingAnalysis(text);
      expect(result?.intent).toBe("GREETING");
      expect(result?.lead).toEqual({});
      expect(
        renderResponse(result!.language, "WELCOME", [], "TYPE"),
      ).not.toMatch(/PKR|DEMO-|match your requirements/);
    },
  );
  it("does not discard a search that starts with hello", () => {
    expect(greetingAnalysis("hi I need a 5 marla house in Bahria")).toBeNull();
    expect(mockAnalysis("hi I need a 5 marla house in Bahria").intent).toBe(
      "PROPERTY_SEARCH",
    );
  });
  it("distinguishes a complete new search from a short follow-up", () => {
    expect(
      startsNewSearch("I need a 2-bedroom apartment in B-17 under 2 crore"),
    ).toBe(true);
    expect(startsNewSearch("1cr")).toBe(false);
  });
  it("extracts Pakistani shorthand and keeps sector and city distinct", () => {
    expect(mockAnalysis("5 marla plot in B-17 Islamabad").lead).toMatchObject({
      purpose: "SALE",
      propertyType: "PLOT",
      preferredLocation: "B-17",
      city: "Islamabad",
      preferredArea: 5,
      areaUnit: "MARLA",
    });
    expect(mockAnalysis("1cr").lead.maximumBudget).toBe(10_000_000);
    expect(mockAnalysis("85 lac").lead.maximumBudget).toBe(8_500_000);
    expect(mockAnalysis("10000000").lead.maximumBudget).toBe(10_000_000);
    expect(mockAnalysis("PKR10,000,000").lead.maximumBudget).toBe(10_000_000);
    expect(
      mockConversationAnalysis([
        "Hi! How are you?",
        "5 marla plot in B-17 Islamabad",
        "1cr",
      ]).lead,
    ).toMatchObject({
      propertyType: "PLOT",
      preferredLocation: "B-17",
      city: "Islamabad",
      preferredArea: 5,
      maximumBudget: 10_000_000,
    });
  });
  it("recognizes follow-up payment-plan requests", () => {
    expect(asksForPaymentPlan("Send me complete plan of it")).toBe(true);
    expect(asksForPaymentPlan("What are the monthly installments? ")).toBe(
      true,
    );
    expect(asksForPaymentPlan("Show me plots in B-17")).toBe(false);
  });
  it("explains a real no-match and labels the nearest published option", () => {
    const alternative = {
      status: "INACTIVE",
      requiresReview: true,
      title: "IDEAS Tower B 1 Bed Type C — 750 sq ft",
      price: 12_000_000,
    } as any;
    const response = renderNoMatchResponse(
      "English",
      {
        propertyType: "PLOT",
        preferredLocation: "B-17",
        city: null,
        maximumBudget: 10_000_000 as any,
        preferredArea: 5 as any,
        areaUnit: "MARLA",
        bedrooms: null,
      },
      [alternative],
    );
    expect(response).toContain("5 marla plot in B-17");
    expect(response).toContain("PKR 10,000,000");
    expect(response).toContain("IDEAS Tower B 1 Bed");
    expect(response).toContain("availability must be confirmed");
  });
  it("renders stored payment-plan figures without inventing terms", () => {
    const response = renderPaymentPlan("English", {
      propertyCode: "IG-TOWER-B-C-750",
      title: "IDEAS Tower B 1 Bed Type C — 750 sq ft",
      price: 12_000_000,
      pricingDetails: {
        booking: 3_000_000,
        monthlyInstallment: 140_000,
        monthlyInstallments: 30,
        possession: 600_000,
      },
    } as any);
    expect(response).toContain("Booking: PKR 3,000,000");
    expect(response).toContain("Monthly: PKR 140,000 × 30 installments");
    expect(response).toContain("Current unit availability");
  });
  it("constrains inventory to available even if callers request sold", () => {
    const where = propertyWhere(
      { status: "SOLD", location: "Bahria", maximumPrice: 20000000, area: 5 },
      true,
    );
    expect(where.status).toBe("AVAILABLE");
    expect(where.price).toEqual({ gte: undefined, lte: 20000000 });
    expect(where.area).toBe(5);
  });
  it("rejects invalid numeric filters", () =>
    expect(() => propertyWhere({ maximumPrice: "oops" })).toThrow());
  it("preserves known lead fields when extraction returns null", () => {
    const merged = {
      name: "Ayesha",
      maximumBudget: 20000000,
      ...nonNullLead({ name: null, maximumBudget: null, city: "Lahore" }),
    };
    expect(merged).toEqual({
      name: "Ayesha",
      maximumBudget: 20000000,
      city: "Lahore",
    });
  });
  it("extracts local currency units and area in mock mode", () => {
    expect(
      mockAnalysis("5 marla house in Bahria under 2 crore").lead,
    ).toMatchObject({
      maximumBudget: 20000000,
      preferredArea: 5,
      areaUnit: "MARLA",
      preferredLocation: "Bahria",
    });
    expect(
      mockAnalysis("10 marla house under 4.5 crore").lead.maximumBudget,
    ).toBe(45000000);
  });
  it("blocks AI for takeover, disabled settings, disabled conversation and closed state", () => {
    const c = { aiEnabled: true, humanTakeover: false, status: "ACTIVE" };
    expect(aiAllowed(c, true)).toBe(true);
    expect(aiAllowed({ ...c, humanTakeover: true }, true)).toBe(false);
    expect(aiAllowed(c, false)).toBe(false);
    expect(aiAllowed({ ...c, aiEnabled: false }, true)).toBe(false);
    expect(aiAllowed({ ...c, status: "CLOSED" }, true)).toBe(false);
  });
  it("cannot recommend sold property cards", () => {
    const text = renderResponse("English", "SEARCH", [
      { status: "SOLD", title: "Secret sold home", propertyCode: "P-1" } as any,
    ]);
    expect(text).not.toContain("Secret sold home");
    expect(text).toContain("No exact match");
  });
  it("labels review-required inventory as an unconfirmed simulator preview", () => {
    const property = {
      status: "INACTIVE",
      requiresReview: true,
      title: "IDEAS Tower apartment",
      propertyCode: "IG-TOWER-B-B-1250",
      location: "B-17",
      city: "Islamabad",
      area: 1250,
      areaUnit: "SQ_FT",
      price: 20_000_000,
      purpose: "SALE",
      bedrooms: 2,
      bathrooms: null,
      amenities: [],
      demo: false,
    } as any;
    expect(renderResponse("English", "SEARCH", [property])).toContain(
      "No exact match",
    );
    const preview = renderResponse(
      "English",
      "SEARCH",
      [property],
      "NONE",
      true,
    );
    expect(preview).toContain("AVAILABILITY UNCONFIRMED");
    expect(preview).toContain("IG-TOWER-B-B-1250");
  });
  it("viewing response never confirms an appointment", () =>
    expect(renderResponse("English", "VIEWING", [])).toContain(
      "not confirmed",
    ));
  it("does not queue duplicate webhook IDs", async () => {
    const create = vi.fn();
    const tx = {
      $executeRaw: vi.fn(),
      message: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing" }),
        create,
      },
    };
    const spy = vi
      .spyOn(db, "$transaction")
      .mockImplementation(async (fn: any) => fn(tx));
    expect(
      await receiveMessage({
        id: "wamid.1",
        phone: "923001234567",
        text: "Hi",
        timestamp: new Date(),
        simulated: false,
      }),
    ).toEqual({ duplicate: true });
    expect(create).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
describe("Provider errors and access control", () => {
  it.each([401, 429, 500])(
    "reports Meta HTTP %s without leaking provider body",
    async (status) => {
      const service = new WhatsAppService(
        vi
          .fn()
          .mockResolvedValue(new Response("secret provider body", { status })),
      );
      await expect(
        service.sendTextMessage("923001234567", "Hello"),
      ).rejects.toThrow(`HTTP ${status}`);
    },
  );
  it("stores a successful Meta identifier", async () => {
    const service = new WhatsAppService(
      vi
        .fn()
        .mockResolvedValue(Response.json({ messages: [{ id: "wamid.123" }] })),
    );
    expect(await service.sendTextMessage("923001234567", "Hello")).toBe(
      "wamid.123",
    );
  });
  it("protects inventory and admin settings", async () => {
    await request(app).get("/api/properties").expect(401);
    await request(app).get("/api/settings/ai").expect(401);
  });
  it("rejects cross-origin mutations", async () => {
    await request(app)
      .post("/api/auth/login")
      .set("Origin", "https://evil.example")
      .send({ email: "x@y.com", password: "x" })
      .expect(403);
  });
});
