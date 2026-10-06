import { Lead, Property } from "@prisma/client";
const phrases = {
  English: {
    welcome: "Hello 👋 I'd be happy to help you find a property.",
    qualify: "Got it 👍",
    matches: "I found these options for you:",
    preview: "I found this published option for you:",
    alternatives:
      "Here are more published options. Some may be above your current budget; availability must be confirmed:",
    none: "No exact match is currently available. Would you like to explore similar options?",
    escalate:
      "Bilkul 👍 Main aapki requirement agent ke liye note kar deta hoon so they can assist you further.",
    viewing:
      "Your viewing request has been recorded, but is not confirmed. Our property consultant will contact you to confirm the date and time.",
    budget: "Approx budget kitna rakh rahe hain?",
    location: "Kis area ya sector mein dekh rahe hain?",
    type: "What are you looking for — house, plot, apartment, or commercial property?",
    area: "What property size do you prefer — 5, 8, 10 marla, kanal, or something else?",
    name: "May I have your name?",
    time: "What date and time would work best for a visit?",
    follow: "What else can I help you find?",
    farewell: "Goodbye! 👋 Feel free to message us whenever you need help with a property.",
    thanks: "You're welcome 😊 Message me anytime you need help with a property.",
  },
  "Roman Urdu": {
    welcome: "Wa Alaikum Assalam 👋 Bilkul, main property search mein aapki help karunga.",
    qualify: "Got it 👍",
    matches: "Aapki requirement ke mutabiq ye options mile hain:",
    preview: "Aapke liye ye published option mila hai:",
    alternatives:
      "Ji, yeh mazeed published options hain. Kuch current budget se above ho sakte hain; availability consultant se confirm hogi:",
    none: "Filhal exact match available nahi hai. Kya similar options dekhna chahenge?",
    escalate:
      "Bilkul 👍 Main aapki requirement agent ke liye note kar deta hoon so they can assist you further.",
    viewing:
      "Aap ki visit request note kar li hai. Consultant exact timing confirm karne ke liye aapse rabta karega.",
    budget: "Approx budget kitna rakh rahe hain?",
    location: "Kis area ya sector mein dekh rahe hain?",
    type: "Kis type ki property dekh rahe hain — house, plot, apartment ya commercial?",
    area: "Size preference kya hai — 5, 8, 10 marla ya koi aur?",
    name: "Aap ka naam?",
    time: "Kis din aur time visit karna chahenge?",
    follow: "Aur kis cheez mein help chahiye?",
    farewell: "Allah Hafiz 👋 Property ke hawale se jab bhi help chahiye ho, message kar dein.",
    thanks: "Khushi hui 😊 Property ke hawale se jab bhi help chahiye ho, message kar dein.",
  },
  Urdu: {
    welcome: "وعلیکم السلام 👋 بالکل، میں پراپرٹی تلاش کرنے میں آپ کی مدد کروں گا۔",
    qualify: "ٹھیک ہے 👍",
    matches: "آپ کی ضروریات کے مطابق یہ آپشنز موجود ہیں:",
    preview:
      "شائع شدہ پیش منظر (دستیابی کی تصدیق کنسلٹنٹ سے ہوگی):",
    alternatives:
      "یہ مزید شائع شدہ آپشنز ہیں۔ کچھ موجودہ بجٹ سے زیادہ ہو سکتے ہیں؛ دستیابی کی تصدیق کنسلٹنٹ کرے گا:",
    none: "فی الحال عین مطابق پراپرٹی دستیاب نہیں۔ کیا آپ ملتے جلتے آپشنز دیکھنا چاہیں گے؟",
    escalate:
      "بالکل 👍 میں آپ کی تفصیلات ایجنٹ کے لیے نوٹ کر دیتا ہوں تاکہ وہ آپ سے رابطہ کر سکے۔",
    viewing:
      "آپ کی وزٹ کی درخواست نوٹ کر لی ہے۔ کنسلٹنٹ وقت کی تصدیق کے لیے رابطہ کرے گا۔",
    budget: "تقریباً بجٹ کتنا ہے؟",
    location: "کس علاقے یا سیکٹر میں دیکھ رہے ہیں؟",
    type: "کس قسم کی پراپرٹی چاہیے — گھر، پلاٹ، اپارٹمنٹ یا کمرشل؟",
    area: "کتنے رقبے کی پراپرٹی چاہیے — 5، 10 مرلہ یا کچھ اور؟",
    name: "آپ کا نام کیا ہے؟",
    time: "کس تاریخ اور وقت وزٹ کرنا چاہیں گے؟",
    follow: "پراپرٹی تلاش میں مزید کیا مدد چاہیے؟",
    farewell: "اللہ حافظ 👋 پراپرٹی کے بارے میں جب بھی مدد چاہیے ہو، ہمیں پیغام کر دیں۔",
    thanks: "خوشی ہوئی 😊 پراپرٹی کے بارے میں جب بھی مدد چاہیے ہو، پیغام کر دیں۔",
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
  if (kind === "FAREWELL") return p.farewell;
  if (kind === "THANKS") return p.thanks;
  const start =
    kind === "SEARCH"
      ? safe.length
        ? hasPreview
          ? p.preview
          : p.matches
        : p.none
      : kind === "ALTERNATIVES"
        ? p.alternatives
        : kind === "WELCOME"
        ? p.welcome
        : kind === "QUALIFY"
          ? p.qualify
          : p.follow;
  const cards =
    kind === "SEARCH" || kind === "ALTERNATIVES"
      ? safe.map(
          (x, index) => {
            const areaUnit =
              x.areaUnit === "SQ_FT" ? "sq ft" : x.areaUnit.toLowerCase();
            const rooms = [
              x.bedrooms && x.bedrooms > 0 ? `${x.bedrooms} bed` : null,
              x.bathrooms && x.bathrooms > 0 ? `${x.bathrooms} bath` : null,
            ].filter(Boolean);
            const details = [
              `${x.area} ${areaUnit}`,
              ...rooms,
              `PKR ${Number(x.price).toLocaleString("en-PK")}${x.purpose === "RENT" ? "/month" : ""}`,
            ].join(" · ");
            const prefix = safe.length > 1 ? `${index + 1}. ` : "";
            const amenities = x.amenities?.slice(0, 3).join(", ");
            const availability =
              x.status === "INACTIVE" && x.requiresReview
                ? language === "Urdu"
                  ? "دستیابی کی تصدیق کنسلٹنٹ کرے گا۔"
                  : language === "Roman Urdu"
                    ? "Availability consultant se confirm hogi."
                    : "Availability will be confirmed by our consultant."
                : null;
            return [
              `${prefix}*${x.title}*`,
              details,
              `${x.location}, ${x.city}`,
              amenities || null,
              `Code: ${x.propertyCode}`,
              availability,
            ]
              .filter(Boolean)
              .join("\n");
          },
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
