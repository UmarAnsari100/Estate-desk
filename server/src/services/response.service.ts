import { Lead, Property } from "@prisma/client";
const phrases = {
  English: {
    welcome:
      "Hello! I'm doing well, thank you. How can I help with your property search?",
    qualify: "Got it — let me narrow that down.",
    matches: "These properties match your requirements:",
    preview:
      "Preview from published pricing — current availability must be confirmed by a property consultant:",
    none: "No exact match is currently available. Would you like to explore similar options?",
    escalate: "A property consultant will need to confirm that for you.",
    viewing:
      "Your viewing request has been recorded, but is not confirmed. Please share the property code, your name, preferred date and time.",
    budget: "What is your approximate budget?",
    location: "Which location do you prefer?",
    type: "What type of property are you looking for?",
    area: "What property size do you prefer?",
    name: "May I have your name?",
    time: "What date and time would you prefer?",
    follow: "How else can I help with your property search?",
  },
  "Roman Urdu": {
    welcome:
      "Walaikum assalam! Main theek hoon, shukriya. Aap ko kis tarah ki property chahiye?",
    qualify: "Theek hai — isay thora aur narrow kar lete hain.",
    matches: "Aap ki requirements ke mutabiq ye options hain:",
    preview:
      "Published pricing ka preview — current availability property consultant se confirm karna zaroori hai:",
    none: "Filhal exact match available nahi hai. Kya aap similar options dekhna chahenge?",
    escalate: "Is ki tasdeeq ke liye property consultant aap ki madad karega.",
    viewing:
      "Aap ki visit request note kar li hai, abhi confirm nahi hui. Property code, apna naam, tareekh aur waqt bata dein.",
    budget: "Aap ka approx budget kitna hai?",
    location: "Aap kis location ko prefer karte hain?",
    type: "Aap ko kis qisam ki property chahiye?",
    area: "Kitni size ki property chahiye?",
    name: "Aap ka naam?",
    time: "Kis din aur waqt visit karna chahenge?",
    follow: "Property search mein aur kya madad chahiye?",
  },
  Urdu: {
    welcome:
      "وعلیکم السلام! میں خیریت سے ہوں، شکریہ۔ آپ کو کس قسم کی پراپرٹی چاہیے؟",
    qualify: "ٹھیک ہے، اسے مزید واضح کر لیتے ہیں۔",
    matches: "آپ کی ضروریات کے مطابق یہ پراپرٹیز موجود ہیں:",
    preview:
      "شائع شدہ قیمتوں کا پیش منظر — موجودہ دستیابی کی تصدیق پراپرٹی کنسلٹنٹ سے ضروری ہے:",
    none: "فی الحال عین مطابق پراپرٹی دستیاب نہیں۔ کیا آپ ملتے جلتے آپشنز دیکھنا چاہیں گے؟",
    escalate: "اس کی تصدیق کے لیے پراپرٹی کنسلٹنٹ آپ کی مدد کرے گا۔",
    viewing:
      "آپ کی وزٹ کی درخواست درج کر لی ہے، ابھی تصدیق نہیں ہوئی۔ پراپرٹی کوڈ، نام، تاریخ اور وقت بتا دیں۔",
    budget: "آپ کا بجٹ کتنا ہے؟",
    location: "آپ کون سا علاقہ پسند کریں گے؟",
    type: "کس قسم کی پراپرٹی چاہیے؟",
    area: "کتنے رقبے کی پراپرٹی چاہیے؟",
    name: "آپ کا نام کیا ہے؟",
    time: "کس تاریخ اور وقت وزٹ کرنا چاہیں گے؟",
    follow: "پراپرٹی کی تلاش میں مزید کیا مدد چاہیے؟",
  },
};
export function renderResponse(
  language: keyof typeof phrases,
  kind: string,
  properties: Property[],
  question = "NONE",
  allowReviewPreview = false,
) {
  const p = phrases[language];
  const safe = properties.filter(
    (x) =>
      x.status === "AVAILABLE" ||
      (allowReviewPreview && x.status === "INACTIVE" && x.requiresReview),
  );
  const hasPreview = safe.some(
    (x) => x.status === "INACTIVE" && x.requiresReview,
  );
  if (kind === "ESCALATE") return p.escalate;
  if (kind === "VIEWING") return p.viewing;
  const start =
    kind === "SEARCH"
      ? safe.length
        ? hasPreview
          ? p.preview
          : p.matches
        : p.none
      : kind === "WELCOME"
        ? p.welcome
        : kind === "QUALIFY"
          ? p.qualify
          : p.follow;
  const cards =
    kind === "SEARCH"
      ? safe.map(
          (x) =>
            `${x.status === "INACTIVE" && x.requiresReview ? "[PREVIEW · AVAILABILITY UNCONFIRMED] " : x.demo ? "[DEMO] " : ""}${x.propertyCode} · ${x.title}\n${x.location}, ${x.city} · ${x.area} ${x.areaUnit}\nPKR ${Number(x.price).toLocaleString("en-PK")}${x.purpose === "RENT" ? " / month" : ""}${x.bedrooms !== null ? ` · ${x.bedrooms} bedrooms` : ""}${x.bathrooms !== null ? ` · ${x.bathrooms} bathrooms` : ""}${x.amenities?.length ? `\n${x.amenities.join(", ")}` : ""}`,
        )
      : [];
  const q = (
    {
      BUDGET: p.budget,
      LOCATION: p.location,
      TYPE: p.type,
      AREA: p.area,
      NAME: p.name,
      VIEW_TIME: p.time,
    } as Record<string, string>
  )[question];
  return [start, ...cards, q].filter(Boolean).join("\n\n").slice(0, 4000);
}

type SearchLead = Pick<
  Lead,
  | "propertyType"
  | "preferredLocation"
  | "city"
  | "maximumBudget"
  | "preferredArea"
  | "areaUnit"
  | "bedrooms"
>;

const propertyTypeLabel = (value: string | null) =>
  value ? value.toLowerCase() : "property";

const formatPkr = (value: unknown) =>
  `PKR ${Number(value).toLocaleString("en-PK")}`;

function requestSummary(lead: SearchLead) {
  return [
    lead.preferredArea && lead.areaUnit
      ? `${Number(lead.preferredArea)} ${lead.areaUnit.replace("_", " ").toLowerCase()}`
      : null,
    propertyTypeLabel(lead.propertyType),
    lead.preferredLocation || lead.city
      ? `in ${lead.preferredLocation || lead.city}`
      : null,
    lead.maximumBudget ? `within ${formatPkr(lead.maximumBudget)}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function renderNoMatchResponse(
  language: keyof typeof phrases,
  lead: SearchLead,
  alternatives: Property[],
) {
  const summary = requestSummary(lead);
  const safe = alternatives.filter(
    (property) =>
      property.status === "AVAILABLE" ||
      (property.status === "INACTIVE" && property.requiresReview),
  );
  if (language === "Urdu") {
    const intro = `مجھے ${summary || "آپ کی شرائط"} کے لیے کوئی شائع شدہ عین مطابق لسٹنگ نہیں ملی۔`;
    if (!safe.length)
      return `${intro} اگر آپ چاہیں تو میں بجٹ، سائز یا پراپرٹی کی قسم تبدیل کر کے دوبارہ تلاش کر سکتا ہوں۔`;
    const nearest = safe[0];
    return `${intro}\n\nقریب ترین شائع شدہ آپشن ${nearest.title} ہے، قیمت ${formatPkr(nearest.price)}۔ موجودہ دستیابی کی تصدیق ضروری ہے۔ کیا آپ اس کی تفصیل دیکھنا چاہیں گے؟`;
  }
  if (language === "Roman Urdu") {
    const intro = `Mujhe ${summary || "aap ki requirements"} ki koi published exact listing nahi mili.`;
    if (!safe.length)
      return `${intro} Agar aap chahein to budget, size ya property type flexible karke dobara search kar sakta hoon.`;
    const nearest = safe[0];
    return `${intro}\n\nSab se qareebi published option ${nearest.title} hai, price ${formatPkr(nearest.price)}. Current availability confirm karna zaroori hai. Kya aap is ki details dekhna chahenge?`;
  }
  const intro = `I couldn't find a published exact listing for ${summary || "those requirements"}.`;
  if (!safe.length)
    return `${intro} I can search again if you are flexible on budget, size, or property type.`;
  const nearest = safe[0];
  return `${intro}\n\nThe nearest published option is ${nearest.title} at ${formatPkr(nearest.price)}. Its current availability must be confirmed. Would you like its details?`;
}

export function renderPaymentPlanClarification(language: keyof typeof phrases) {
  if (language === "Urdu")
    return "میں نے ابھی کوئی مخصوص پراپرٹی منتخب نہیں کی۔ براہ کرم پراپرٹی کوڈ یا نام بھیجیں، پھر میں شائع شدہ مکمل ادائیگی پلان بتا دوں گا۔";
  if (language === "Roman Urdu")
    return "Abhi koi specific property select nahi hui. Property code ya naam bhej dein, phir main published complete payment plan share kar dunga.";
  return "I haven't identified a specific property yet. Send its property code or name, and I'll share the complete published payment plan.";
}

export function renderPaymentPlan(
  language: keyof typeof phrases,
  property: Property,
) {
  const details =
    property.pricingDetails && typeof property.pricingDetails === "object"
      ? (property.pricingDetails as Record<string, unknown>)
      : {};
  const lines = [
    `${property.propertyCode} · ${property.title}`,
    `Total price: ${formatPkr(property.price)}`,
    details.publishedRatePerSqFt
      ? `Published rate: ${formatPkr(details.publishedRatePerSqFt)} per sq ft`
      : null,
    details.booking ? `Booking: ${formatPkr(details.booking)}` : null,
    details.confirmation
      ? `Confirmation: ${formatPkr(details.confirmation)}`
      : null,
    details.downPayment
      ? `Down payment: ${formatPkr(details.downPayment)}`
      : null,
    details.monthlyInstallment && details.monthlyInstallments
      ? `Monthly: ${formatPkr(details.monthlyInstallment)} × ${Number(details.monthlyInstallments)} installments`
      : null,
    details.quarterlyBalloon && details.quarterlyInstallments
      ? `Quarterly balloon: ${formatPkr(details.quarterlyBalloon)} × ${Number(details.quarterlyInstallments)}`
      : null,
    details.halfYearlyInstallment && details.halfYearlyInstallments
      ? `Half-yearly: ${formatPkr(details.halfYearlyInstallment)} × ${Number(details.halfYearlyInstallments)}`
      : null,
    details.possession
      ? `On possession: ${formatPkr(details.possession)}`
      : null,
  ].filter(Boolean);
  const note =
    "This is the published payment plan. Current unit availability and final terms must be confirmed by a property consultant.";
  if (language === "Roman Urdu")
    return `${lines.join("\n")}\n\nYeh published payment plan hai. Current availability aur final terms property consultant se confirm honge.`.slice(
      0,
      4000,
    );
  if (language === "Urdu")
    return `${lines.join("\n")}\n\nیہ شائع شدہ ادائیگی پلان ہے۔ موجودہ دستیابی اور حتمی شرائط کی تصدیق پراپرٹی کنسلٹنٹ کرے گا۔`.slice(
      0,
      4000,
    );
  return `${lines.join("\n")}\n\n${note}`.slice(0, 4000);
}
