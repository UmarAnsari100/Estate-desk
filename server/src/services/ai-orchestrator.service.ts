import { db } from "../repositories/db.js";
import { aiAllowed } from "./conversation.service.js";
import {
  geminiService,
  mockAnalysis,
  mockConversationAnalysis,
  greetingAnalysis,
  farewellAnalysis,
  courtesyAnalysis,
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
    /\b(property|house|home|plot|apartment|flat|commercial|shop|office)\b/i,
    /\b(?:sector\s+[a-z]\s*[- ]?\s*\d{1,2}|[b-i]\s*-\s*\d{1,2}|[b-i]\d{1,2})\b|\b(bahria|dha|islamabad|rawalpindi|lahore|karachi)\b/i,
    /\b\d+(?:\.\d+)?\s*(crore|cr|lakh|lac|million)\b/i,
    /\b\d+\s*[- ]?(bed|bedroom)|\b\d+(?:\.\d+)?\s*(marla|kanal|sq\.?\s*ft)\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return (
    signals >= 2 &&
    /\b(i need|i want|i am looking|i'm looking|looking for|find me|mujhe|chahiye|chahye|chahie)\b/i.test(
      text,
    )
  );
}

export function asksForPropertyDetails(text: string) {
  return /\b(yes|yeah|yep|sure|ok|okay|please|show|details|g|ji|bilkul|haan|ha|batao|dikhao|want to see|dekhna|send|share)\b/i.test(
    text,
  );
}

export function asksForPaymentPlan(text: string) {
  return /\b(?:complete\s+)?(?:payment|installments?|instalments?|pricing)\s+plan\b|\b(?:monthly|quarterly|half[- ]?yearly)?\s*(?:installments?|instalments?)\b|\b(?:complete\s+)?plan\s+(?:of|for)\s+(?:it|this|that)\b/i.test(
    text,
  );
}

export function asksForAnotherOption(text: string) {
  return /\b(any\s+other|other|another|different|more)\s+(?:property|properties|listing|listings|option|options)\b|\b(?:koi|koe)\s+(?:aur|or)\s+(?:property|listing|option)\b|\b(?:aur|or)\s+(?:koi\s+)?(?:kon\s+kon\s+se\s+)?(?:properties|listings|options?)\b|\bdoosr[ai]\s+(?:property|listing|option)\b/i.test(
    text,
  );
}

export function paymentPlanImageUrl(property: { images: string[] }) {
  return (
    property.images.find((imageUrl) =>
      /(?:payment[_-]?plan|installment)/i.test(imageUrl),
    ) ?? property.images[0]
  );
}

export function projectInventoryQuery(
  ...values: Array<string | null | undefined>
) {
  const text = values.filter(Boolean).join(" ").toLowerCase();
  if (/\bideas\s*(?:one|1)\b|\bideasone\b/.test(text)) return "IG-ONE";
  if (/\bideas\s*tower\s*a\b/.test(text)) return "IG-TOWER-A";
  if (/\bideas\s*tower\s*b\b/.test(text)) return "IG-TOWER-B";
  if (/\bideas\s*tower\b/.test(text)) return "IG-TOWER";
  return null;
}

export function clearsBudget(text: string) {
  return /\b(?:i\s+(?:didn'?t|did not|never)\s+(?:tell|told|give|gave|mention(?:ed)?|set)(?:\s+you)?(?:\s+my)?\s+budget|no\s+budget(?:\s+limit)?|budget\s+(?:is\s+)?not\s+(?:decided|fixed)|budget\s+nahi\s+(?:bataya|diya|hai)|maine\s+budget\s+nahi\s+bataya)\b/i.test(
    text,
  );
}

export function standalonePropertyType(text: string) {
  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/[.!?؟،]/g, "")
    .replace(/\s+/g, " ");
  if (/^(?:a |an )?(?:plot|plots)$/.test(normalized)) return "PLOT";
  if (/^(?:a |an )?(?:apartment|apartments|flat|flats)$/.test(normalized))
    return "APARTMENT";
  if (/^(?:a |an )?(?:house|houses|home|homes|ghar)$/.test(normalized))
    return "HOUSE";
  if (/^(?:a |an )?(?:commercial|shop|shops|office|offices)$/.test(normalized))
    return "COMMERCIAL";
  return null;
}

export function normalizePropertyReference(value: string) {
  return value
    .toUpperCase()
    .replace(/[—–]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/[^A-Z0-9-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function resolvePropertyReference<
  T extends {
    propertyCode: string;
    title: string;
    area: unknown;
    areaUnit: string;
  },
>(text: string, candidates: T[]) {
  const normalized = normalizePropertyReference(text);
  const byCodeOrTitle = candidates.find((property) => {
    const code = normalizePropertyReference(property.propertyCode);
    const title = normalizePropertyReference(property.title);
    return normalized.includes(code) || normalized.includes(title);
  });
  if (byCodeOrTitle) return byCodeOrTitle;
  if (
    !/\b(details?|show|send|want|interested|select|choose|dikhao|batao)\b/i.test(
      text,
    )
  )
    return null;
  const area = text.match(
    /\b(\d+(?:\.\d+)?)\s*(sq\.?\s*ft|square\s*feet|marla|kanal)\b/i,
  );
  if (!area) return null;
  const unit = /sq|square/i.test(area[2]) ? "SQ_FT" : area[2].toUpperCase();
  const sizeMatches = candidates.filter(
    (property) =>
      Number(property.area) === Number(area[1]) && property.areaUnit === unit,
  );
  return sizeMatches.length === 1 ? sizeMatches[0] : null;
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
    await sendReply(
      c.id,
      "Thank you for your message. Currently our automated assistant can best help with text messages. A property consultant has been notified and will assist you shortly.",
      "AI",
      message.id,
    );
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
  // A standalone farewell closes the exchange and must not repeat the last property.
  const farewell = farewellAnalysis(message.content);
  if (farewell) {
    await sendReply(
      c.id,
      renderResponse(farewell.language, "FAREWELL", []),
      "AI",
      message.id,
    );
    return;
  }
  const courtesy = courtesyAnalysis(message.content);
  if (courtesy) {
    await sendReply(
      c.id,
      renderResponse(courtesy.language, "THANKS", []),
      "AI",
      message.id,
    );
    return;
  }
  if (clearsBudget(message.content)) {
    await db.lead.update({
      where: { conversationId: c.id },
      data: { minimumBudget: null, maximumBudget: null },
    });
    const language = mockAnalysis(message.content).language;
    const reply =
      language === "Urdu"
        ? "ٹھیک ہے، میں نے پچھلا بجٹ ہٹا دیا ہے۔ تقریباً بجٹ کتنا رکھنا چاہیں گے؟"
        : language === "Roman Urdu"
          ? "Theek hai, previous budget remove kar diya hai. Approx budget kitna rakhna chahenge?"
          : "No problem, I've removed the previous budget. What approximate budget would you like to use?";
    await sendReply(c.id, reply, "AI", message.id);
    return;
  }
  const referenceCandidates = await db.property.findMany({
    where: {
      ...(c.simulated ? {} : { demo: false }),
      OR: [
        { status: "AVAILABLE" as const },
        { status: "INACTIVE" as const, requiresReview: true },
      ],
    },
    take: 200,
  });
  const referencedProperty = resolvePropertyReference(
    message.content,
    referenceCandidates,
  );
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
        true,
      ),
      "AI",
      message.id,
      { imageUrl: referencedProperty.images[0] },
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
        { imageUrl: paymentPlanImageUrl(property) },
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
  const lastAiMessage = history.find(
    (item) => item.sender === "AI" && item.id !== message.id,
  );
  const offeredAlternativeInLastReply =
    lastAiMessage &&
    /details dekhna chahenge|would you like its details|would you like to see|تفصیل دیکھنا چاہیں/i.test(
      lastAiMessage.content,
    );
  if (
    offeredAlternativeInLastReply &&
    asksForPropertyDetails(message.content)
  ) {
    const candidates = await db.property.findMany({
      where: {
        demo: false,
        OR: [
          { status: "AVAILABLE" },
          { status: "INACTIVE", requiresReview: true },
        ],
      },
    });
    const offered = candidates.find(
      (property) =>
        lastAiMessage.content.includes(property.title) ||
        lastAiMessage.content.includes(property.propertyCode),
    );
    if (offered) {
      await db.lead.update({
        where: { conversationId: c.id },
        data: {
          interestedPropertyId: offered.id,
          propertyType: offered.propertyType,
          preferredLocation: offered.location,
          city: offered.city,
        },
      });
      const language = mockAnalysis(message.content).language;
      await sendReply(
        c.id,
        renderResponse(language, "SEARCH", [offered], "NONE", true),
        "AI",
        message.id,
        { imageUrl: offered.images[0] },
      );
      return;
    }
  }
  if (
    offeredAlternativeInLastReply &&
    /\b(no|nah|nope|nahi|nahin|mat|don'?t)\b/i.test(message.content)
  ) {
    const language = mockAnalysis(message.content).language;
    const declineReply =
      language === "Urdu"
        ? "ٹھیک ہے، کوئی بات نہیں۔ آپ کس علاقے، بجٹ یا پراپرٹی کی قسم میں تلاش کرنا چاہیں گے؟"
        : language === "Roman Urdu"
          ? "Theek hai, koi baat nahi. Aap kis location, budget ya property type mein search karna chahenge?"
          : "Understood. What location, budget, or property type would you prefer to explore instead?";
    await sendReply(c.id, declineReply, "AI", message.id);
    return;
  }
  if (asksForAnotherOption(message.content)) {
    const seen = history
      .filter((item) => item.sender === "AI")
      .map((item) => item.content.toLowerCase())
      .join("\n");
    const exactCandidates = (
      await db.property.findMany({
        where: {
          demo: false,
          purpose: c.lead?.purpose ?? undefined,
          propertyType: c.lead?.propertyType ?? undefined,
          city: c.lead?.city
            ? { contains: c.lead.city, mode: "insensitive" }
            : undefined,
          location: c.lead?.preferredLocation
            ? { contains: c.lead.preferredLocation, mode: "insensitive" }
            : undefined,
          OR: [
            { status: "AVAILABLE" },
            { status: "INACTIVE", requiresReview: true },
          ],
        },
        orderBy: { price: "asc" },
        take: 20,
      })
    ).filter(
      (property) =>
        !seen.includes(property.propertyCode.toLowerCase()) &&
        !seen.includes(property.title.toLowerCase()),
    );
    let candidates = exactCandidates;
    let showingNearby = false;
    if (!candidates.length && c.lead?.preferredLocation) {
      candidates = (
        await db.property.findMany({
          where: {
            demo: false,
            purpose: c.lead.purpose ?? undefined,
            propertyType: c.lead.propertyType ?? undefined,
            city: c.lead.city
              ? { contains: c.lead.city, mode: "insensitive" }
              : undefined,
            OR: [
              { status: "AVAILABLE" },
              { status: "INACTIVE", requiresReview: true },
            ],
          },
          orderBy: { price: "asc" },
          take: 30,
        })
      ).filter(
        (property) =>
          !seen.includes(property.propertyCode.toLowerCase()) &&
          !seen.includes(property.title.toLowerCase()),
      );
      showingNearby = candidates.length > 0;
    }
    const language = mockAnalysis(message.content).language;
    const noMore =
      language === "Urdu"
        ? "موجودہ لوکیشن، بجٹ اور پراپرٹی کی قسم میں کوئی اور شائع شدہ آپشن نہیں ہے۔ آپ لوکیشن، سائز، قسم یا بجٹ میں سے کس چیز میں تبدیلی کر سکتے ہیں؟"
        : language === "Roman Urdu"
          ? "Current location, budget aur property type mein koi aur published option nahi hai. Aap location, size, type ya budget mein se kis cheez mein flexibility rakh sakte hain?"
          : "There isn't another published option within the current location, budget, and property type. Which can be flexible: location, size, type, or budget?";
    const nearbyIntro =
      language === "Urdu"
        ? "اس جگہ پر مزید نئے آپشن نہیں ہیں، اس لیے یہ اسی شہر کے قریبی آپشنز ہیں:"
        : language === "Roman Urdu"
          ? "Is exact location par mazeed new option nahi hai, is liye ye nearby options hain:"
          : "There are no more new options at that exact location, so here are nearby options:";
    const selectedOptions = candidates.slice(0, 3);
    const optionsReply = candidates.length
      ? renderResponse(language, "ALTERNATIVES", selectedOptions, "NONE", true)
      : noMore;
    await sendReply(
      c.id,
      showingNearby ? `${nearbyIntro}\n\n${optionsReply}` : optionsReply,
      "AI",
      message.id,
      {
        media: selectedOptions
          .filter((property) => property.images[0])
          .map((property, index) => ({
            imageUrl: property.images[0],
            caption: `${showingNearby && index === 0 ? `${nearbyIntro}\n\n` : ""}${renderResponse(
              language,
              "SEARCH",
              [property],
              "NONE",
              true,
            )}`,
          })),
      },
    );
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
  const selectedType = standalonePropertyType(message.content);
  if (selectedType) {
    analysis.intent = "PROPERTY_SEARCH";
    analysis.escalate = false;
    analysis.lead.propertyType = selectedType;
    await db.lead.update({
      where: { conversationId: c.id },
      data: {
        propertyType: selectedType,
        interestedPropertyId: null,
        bedrooms: null,
        ...(selectedType === "APARTMENT" || selectedType === "COMMERCIAL"
          ? { preferredArea: null, areaUnit: null }
          : {}),
      },
    });
    delete analysis.lead.bedrooms;
    if (selectedType === "APARTMENT" || selectedType === "COMMERCIAL") {
      delete analysis.lead.preferredArea;
      delete analysis.lead.areaUnit;
    }
  }
  if (analysis.intent === "GREETING" && !analysis.escalate) {
    await sendReply(
      c.id,
      renderResponse(analysis.language, "WELCOME", [], "TYPE"),
      "AI",
      message.id,
    );
    return;
  }
  if (
    ["GENERAL_FAQ", "UNKNOWN"].includes(analysis.intent) &&
    !analysis.escalate &&
    !hasDeterministicLead
  ) {
    const answer = await geminiService.answerGeneralQuestion(
      {
        question: message.content,
        business: context.business,
        recentConversation: context.history.slice(-8),
      },
      settings.temperature,
    );
    await sendReply(c.id, answer.answer, "AI", message.id);
    return;
  }
  const lead = await leadService.update(c.id, analysis.lead, resetSearch);
  const projectQuery = projectInventoryQuery(
    message.content,
    lead.preferredLocation,
  );
  const inventoryLocation = projectQuery
    ? undefined
    : (lead.preferredLocation ?? undefined);
  const searchFilters = {
    purpose: lead.purpose ?? undefined,
    propertyType: lead.propertyType ?? undefined,
    location: inventoryLocation,
    q: projectQuery ?? undefined,
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
          location: inventoryLocation,
          q: projectQuery ?? undefined,
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
          location: inventoryLocation
            ? { contains: inventoryLocation, mode: "insensitive" }
            : undefined,
          OR: projectQuery
            ? [
                { title: { contains: projectQuery, mode: "insensitive" } },
                {
                  propertyCode: {
                    contains: projectQuery,
                    mode: "insensitive",
                  },
                },
              ]
            : [
                { status: "AVAILABLE" },
                { status: "INACTIVE", requiresReview: true },
              ],
          AND: projectQuery
            ? [
                {
                  OR: [
                    { status: "AVAILABLE" },
                    { status: "INACTIVE", requiresReview: true },
                  ],
                },
              ]
            : undefined,
        },
        orderBy: { price: "asc" },
        take: 3,
      });
  const viewing = analysis.intent === "SCHEDULE_VIEWING";
  const escalation = analysis.escalate || analysis.intent === "TALK_TO_AGENT";
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
