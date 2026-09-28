import { db } from "../repositories/db.js";
import { aiAllowed } from "./conversation.service.js";
import {
  geminiService,
  mockAnalysis,
  mockConversationAnalysis,
  greetingAnalysis,
} from "./gemini.service.js";
import { leadService } from "./lead.service.js";
import { nonNullLead } from "./lead.service.js";
import { propertyService, propertyWhere } from "./property.service.js";
import {
  renderNoMatchResponse,
  renderPaymentPlan,
  renderPaymentPlanClarification,
  renderResponse,
} from "./response.service.js";
import { sendReply } from "./message.service.js";
import { env } from "../config/env.js";

export function startsNewSearch(text: string) {
  const signals = [
    /\b(house|home|plot|apartment|flat|commercial|shop|office)\b/i,
    /\b(?:sector\s*)?[a-z]\s*[- ]?\s*\d{1,2}\b|\b(bahria|dha|islamabad|rawalpindi|lahore|karachi)\b/i,
    /\b\d+(?:\.\d+)?\s*(crore|cr|lakh|lac|million)\b/i,
    /\b\d+\s*[- ]?(bed|bedroom)|\b\d+(?:\.\d+)?\s*(marla|kanal|sq\.?\s*ft)\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return (
    signals >= 2 &&
    /\b(i need|i want|i am looking|i'm looking|looking for|find me|mujhe|chahiye)\b/i.test(
      text,
    )
  );
}

export function asksForPaymentPlan(text: string) {
  return /\b(?:complete\s+)?(?:payment|installments?|instalments?|pricing)\s+plan\b|\b(?:monthly|quarterly|half[- ]?yearly)?\s*(?:installments?|instalments?)\b|\b(?:complete\s+)?plan\s+(?:of|for)\s+(?:it|this|that)\b/i.test(
    text,
  );
}

export async function processMessage(messageId: string) {
  const message = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: { include: { customer: true, lead: true } } },
  });
  const c = message.conversation;
  const settings = await db.aISettings.findUniqueOrThrow({
    where: { id: "singleton" },
  });
  if (!aiAllowed(c, settings.enabled)) return;
  if (message.type !== "text") {
    await db.conversation.update({
      where: { id: c.id },
      data: { status: "WAITING", humanTakeover: true },
    });
    return;
  }
  // A standalone greeting is conversational, even when earlier history contains a search.
  const greeting = greetingAnalysis(message.content);
  if (greeting) {
    await sendReply(
      c.id,
      renderResponse(greeting.language, "WELCOME", [], "TYPE"),
      "AI",
      message.id,
    );
    return;
  }
  const referencedProperty = await db.property.findFirst({
    where: {
      OR: [
        {
          propertyCode: { equals: message.content.trim(), mode: "insensitive" },
        },
        { title: { equals: message.content.trim(), mode: "insensitive" } },
      ],
      ...(c.simulated
        ? {
            AND: [
              {
                OR: [
                  { status: "AVAILABLE" as const },
                  { status: "INACTIVE" as const, requiresReview: true },
                ],
              },
            ],
          }
        : { status: "AVAILABLE" as const, demo: false }),
    },
  });
  if (referencedProperty) {
    await db.lead.update({
      where: { conversationId: c.id },
      data: { interestedPropertyId: referencedProperty.id },
    });
    await sendReply(
      c.id,
      renderResponse(
        mockAnalysis(message.content).language,
        "SEARCH",
        [referencedProperty],
        "NONE",
        c.simulated,
      ),
      "AI",
      message.id,
    );
    return;
  }
  const history = await db.message.findMany({
    where: { conversationId: c.id, createdAt: { lte: message.createdAt } },
    orderBy: { createdAt: "desc" },
    take: settings.maxConversationHistory,
  });
  if (asksForPaymentPlan(message.content)) {
    const candidates = await db.property.findMany({
      where: {
        demo: false,
        OR: [
          { status: "AVAILABLE" },
          { status: "INACTIVE", requiresReview: true },
        ],
      },
    });
    const currentText = message.content.toLowerCase();
    const mentionedNow = candidates.find(
      (property) =>
        currentText.includes(property.propertyCode.toLowerCase()) ||
        currentText.includes(property.title.toLowerCase()),
    );
    const interested = c.lead?.interestedPropertyId
      ? candidates.find(
          (property) => property.id === c.lead?.interestedPropertyId,
        )
      : undefined;
    const mentionedEarlier = history
      .filter((item) => item.id !== message.id)
      .map((item) =>
        candidates.find(
          (property) =>
            item.content
              .toLowerCase()
              .includes(property.propertyCode.toLowerCase()) ||
            item.content.toLowerCase().includes(property.title.toLowerCase()),
        ),
      )
      .find(Boolean);
    const property = mentionedNow || interested || mentionedEarlier;
    const language = mockAnalysis(message.content).language;
    if (property) {
      await db.lead.update({
        where: { conversationId: c.id },
        data: { interestedPropertyId: property.id },
      });
      await sendReply(
        c.id,
        renderPaymentPlan(language, property),
        "AI",
        message.id,
      );
    } else {
      await sendReply(
        c.id,
        renderPaymentPlanClarification(language),
        "AI",
        message.id,
      );
    }
    return;
  }
  const resetSearch = startsNewSearch(message.content);
  const context = {
    customer: { name: c.customer.name },
    lead:
      c.lead && !resetSearch
        ? {
            purpose: c.lead.purpose,
            propertyType: c.lead.propertyType,
            preferredLocation: c.lead.preferredLocation,
            maximumBudget: c.lead.maximumBudget,
            preferredArea: c.lead.preferredArea,
          }
        : null,
    history: history
      .reverse()
      .map((m) => ({ sender: m.sender, text: m.content })),
    business: await db.businessSettings.findUnique({
      where: { id: "singleton" },
    }),
    preferences: {
      personality: settings.personality,
      instructions: settings.instructions,
      escalation: settings.humanEscalationRules,
    },
  };
  const mock = c.simulated && !env.GEMINI_API_KEY;
  const providerAnalysis = mock
    ? mockConversationAnalysis(
        history
          .filter((item) => item.sender === "CUSTOMER")
          .map((item) => item.content),
      )
    : await geminiService.extractLeadInformation(context);
  const deterministic = mockAnalysis(message.content);
  const deterministicLead = nonNullLead(deterministic.lead);
  const hasDeterministicLead = Object.keys(deterministicLead).length > 0;
  const analysis = {
    ...providerAnalysis,
    intent:
      hasDeterministicLead &&
      ["UNKNOWN", "GENERAL_FAQ"].includes(providerAnalysis.intent)
        ? ("PROPERTY_SEARCH" as const)
        : providerAnalysis.intent,
    escalate: hasDeterministicLead ? false : providerAnalysis.escalate,
    propertyCode:
      deterministic.propertyCode || providerAnalysis.propertyCode || null,
    lead: {
      ...providerAnalysis.lead,
      ...deterministicLead,
    },
  };
  if (analysis.intent === "GREETING" && !analysis.escalate) {
    await sendReply(
      c.id,
      renderResponse(analysis.language, "WELCOME", [], "TYPE"),
      "AI",
      message.id,
    );
    return;
  }
  const lead = await leadService.update(c.id, analysis.lead, resetSearch);
  const searchFilters = {
    purpose: lead.purpose ?? undefined,
    propertyType: lead.propertyType ?? undefined,
    location: lead.preferredLocation ?? undefined,
    city: lead.city ?? undefined,
    minimumPrice: lead.minimumBudget ? Number(lead.minimumBudget) : undefined,
    maximumPrice: lead.maximumBudget ? Number(lead.maximumBudget) : undefined,
    area: lead.preferredArea ? Number(lead.preferredArea) : undefined,
    areaUnit: lead.areaUnit ?? undefined,
    bedrooms: lead.bedrooms ?? undefined,
  };
  const properties = analysis.propertyCode
    ? await db.property.findMany({
        where: {
          propertyCode: analysis.propertyCode,
          ...(c.simulated
            ? {
                OR: [
                  { status: "AVAILABLE" as const },
                  { status: "INACTIVE" as const, requiresReview: true },
                ],
              }
            : { status: "AVAILABLE" as const }),
        },
        take: 1,
      })
    : await propertyService.search(
        {
          purpose: lead.purpose ?? undefined,
          propertyType: lead.propertyType ?? undefined,
          location: lead.preferredLocation ?? undefined,
          city: lead.city ?? undefined,
          minimumPrice: lead.minimumBudget
            ? Number(lead.minimumBudget)
            : undefined,
          maximumPrice: lead.maximumBudget
            ? Number(lead.maximumBudget)
            : undefined,
          area: lead.preferredArea ? Number(lead.preferredArea) : undefined,
          areaUnit: lead.areaUnit ?? undefined,
          bedrooms: lead.bedrooms ?? undefined,
        },
        true,
        c.simulated,
        true,
      );
  // Demo inventory must never enter a live customer response.
  const verified = properties.filter((p) => c.simulated || !p.demo);
  let alternatives = verified.length
    ? []
    : await db.property.findMany({
        where: {
          demo: false,
          purpose: lead.purpose ?? undefined,
          propertyType: lead.propertyType ?? undefined,
          city: lead.city
            ? { contains: lead.city, mode: "insensitive" }
            : undefined,
          location: lead.preferredLocation
            ? { contains: lead.preferredLocation, mode: "insensitive" }
            : undefined,
          OR: [
            { status: "AVAILABLE" },
            { status: "INACTIVE", requiresReview: true },
          ],
        },
        orderBy: { price: "asc" },
        take: 3,
      });
  if (!verified.length && !alternatives.length)
    alternatives = await db.property.findMany({
      where: {
        demo: false,
        purpose: lead.purpose ?? undefined,
        city: lead.city
          ? { contains: lead.city, mode: "insensitive" }
          : undefined,
        location: lead.preferredLocation
          ? { contains: lead.preferredLocation, mode: "insensitive" }
          : undefined,
        OR: [
          { status: "AVAILABLE" },
          { status: "INACTIVE", requiresReview: true },
        ],
      },
      orderBy: { price: "asc" },
      take: 3,
    });
  const viewing = analysis.intent === "SCHEDULE_VIEWING";
  const escalation =
    analysis.escalate ||
    ["TALK_TO_AGENT", "UNKNOWN", "SELL_PROPERTY", "GENERAL_FAQ"].includes(
      analysis.intent,
    );
  const interested = analysis.propertyCode
    ? verified.find((p) => p.propertyCode === analysis.propertyCode)
    : undefined;
  if (interested)
    await db.lead.update({
      where: { id: lead.id },
      data: { interestedPropertyId: interested.id },
    });
  if (viewing) {
    const data = {
      propertyId: interested?.id,
      requestedDate: lead.preferredVisitDate ?? undefined,
      preferredTime: analysis.preferredTime ?? undefined,
      customerName: lead.name ?? undefined,
    };
    const existing = await db.viewingRequest.findFirst({
      where: { conversationId: c.id, status: "REQUESTED" },
      orderBy: { createdAt: "desc" },
    });
    if (existing)
      await db.viewingRequest.update({ where: { id: existing.id }, data });
    else
      await db.viewingRequest.create({
        data: { conversationId: c.id, ...data },
      });
  }
  const score =
    [
      lead.purpose,
      lead.propertyType,
      lead.preferredLocation,
      lead.maximumBudget,
      lead.preferredArea,
    ].filter(Boolean).length * 20;
  await db.lead.update({
    where: { id: lead.id },
    data: {
      score,
      ...(viewing
        ? { status: "VIEWING_REQUESTED" as const }
        : ["NEW", "QUALIFYING"].includes(lead.status)
          ? {
              status:
                score >= 80 ? ("QUALIFIED" as const) : ("QUALIFYING" as const),
            }
          : {}),
    },
  });
  const plan = mock
    ? {
        question: !lead.maximumBudget
          ? "BUDGET"
          : !lead.preferredLocation
            ? "LOCATION"
            : "NONE",
      }
    : await geminiService.generateResponse(
        {
          analysis,
          lead,
          properties: verified.map((p) => ({
            code: p.propertyCode,
            title: p.title,
          })),
          missing: {
            budget: !lead.maximumBudget,
            location: !lead.preferredLocation,
          },
        },
        settings.temperature,
      );
  const qualificationQuestion =
    plan.question === "BUDGET" && !lead.maximumBudget
      ? "BUDGET"
      : plan.question === "LOCATION" && !lead.preferredLocation && !lead.city
        ? "LOCATION"
        : plan.question === "TYPE" && !lead.propertyType
          ? "TYPE"
          : plan.question === "AREA" && !lead.preferredArea
            ? "AREA"
            : "NONE";
  const needsQualification =
    qualificationQuestion !== "NONE" && verified.length === 0;
  const kind = viewing
    ? "VIEWING"
    : escalation
      ? "ESCALATE"
      : analysis.intent === "GREETING"
        ? "WELCOME"
        : needsQualification
          ? "QUALIFY"
          : "SEARCH";
  await sendReply(
    c.id,
    async (tx) => {
      // Lock and reload selected rows so sold/edited inventory cannot race a send.
      const rowsToLock = [...verified, ...alternatives]
        .filter(
          (property, index, all) =>
            all.findIndex((candidate) => candidate.id === property.id) ===
            index,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      for (const p of rowsToLock)
        await tx.$queryRaw`SELECT id FROM "Property" WHERE id = ${p.id} FOR SHARE`;
      const current = await tx.property.findMany({
        where: {
          ...(analysis.propertyCode ? {} : propertyWhere(searchFilters, false)),
          id: { in: verified.map((p) => p.id) },
          OR: [
            { status: "AVAILABLE" as const },
            { status: "INACTIVE" as const, requiresReview: true },
          ],
          ...(c.simulated ? {} : { demo: false }),
        },
      });
      const currentAlternatives = await tx.property.findMany({
        where: {
          id: { in: alternatives.map((property) => property.id) },
          demo: false,
          OR: [
            { status: "AVAILABLE" as const },
            { status: "INACTIVE" as const, requiresReview: true },
          ],
        },
        orderBy: { price: "asc" },
        take: 3,
      });
      if (kind === "SEARCH" && current.length === 0 && !needsQualification)
        return renderNoMatchResponse(
          analysis.language,
          lead,
          currentAlternatives,
        );
      return renderResponse(
        analysis.language,
        kind,
        current,
        qualificationQuestion,
        true,
      );
    },
    "AI",
    message.id,
  );
  if (escalation || viewing)
    await db.$transaction(async (tx) => {
      const { lockConversation } = await import("./conversation.service.js");
      await lockConversation(tx, c.id);
      await tx.conversation.update({
        where: { id: c.id },
        data: { humanTakeover: true, status: "WAITING" },
      });
    });
}
