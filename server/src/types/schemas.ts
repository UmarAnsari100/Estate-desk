import { z } from "zod";
const text = z.string().trim().min(1).max(200);
export const propertySchema = z.object({
  propertyCode: text,
  title: text,
  purpose: z.enum(["SALE", "RENT"]),
  propertyType: z.enum(["HOUSE", "APARTMENT", "PLOT", "COMMERCIAL"]),
  location: text,
  city: text,
  area: z.coerce.number().positive(),
  areaUnit: z.enum(["MARLA", "KANAL", "SQ_FT"]),
  bedrooms: z.number().int().min(0).max(100).nullable().optional(),
  bathrooms: z.number().int().min(0).max(100).nullable().optional(),
  price: z.coerce.number().positive().max(1e13),
  currency: z.literal("PKR").default("PKR"),
  description: z.string().max(5000).default(""),
  amenities: z.array(text).max(50).default([]),
  images: z
    .array(z.url().refine((v) => v.startsWith("https://")))
    .max(20)
    .default([]),
  status: z
    .enum(["AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE"])
    .default("AVAILABLE"),
  featured: z.boolean().default(false),
});
export const filtersSchema = z.object({
  q: text.optional(),
  purpose: z.enum(["SALE", "RENT"]).optional(),
  propertyType: text.optional(),
  city: text.optional(),
  location: text.optional(),
  minimumPrice: z.coerce.number().min(0).optional(),
  maximumPrice: z.coerce.number().min(0).optional(),
  area: z.coerce.number().positive().optional(),
  areaUnit: text.optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  status: z
    .enum(["AVAILABLE", "RESERVED", "SOLD", "RENTED", "INACTIVE"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
});
export const leadFields = z.object({
  name: text.nullish(),
  purpose: z.enum(["SALE", "RENT"]).nullish(),
  propertyType: z.enum(["HOUSE", "APARTMENT", "PLOT", "COMMERCIAL"]).nullish(),
  preferredLocation: text.nullish(),
  city: text.nullish(),
  minimumBudget: z.number().min(0).max(1e13).nullish(),
  maximumBudget: z.number().min(0).max(1e13).nullish(),
  preferredArea: z.number().positive().nullish(),
  areaUnit: z.enum(["MARLA", "KANAL", "SQ_FT"]).nullish(),
  bedrooms: z.number().int().min(0).max(100).nullish(),
  preferredVisitDate: text.nullish(),
});
export const intents = [
  "GREETING",
  "BUY_PROPERTY",
  "RENT_PROPERTY",
  "SELL_PROPERTY",
  "PROPERTY_SEARCH",
  "PROPERTY_DETAILS",
  "PRICE_INQUIRY",
  "LOCATION_INQUIRY",
  "SCHEDULE_VIEWING",
  "TALK_TO_AGENT",
  "GENERAL_FAQ",
  "UNKNOWN",
] as const;
export const analysisSchema = z.object({
  intent: z.enum(intents),
  language: z.enum(["English", "Urdu", "Roman Urdu"]),
  escalate: z.boolean(),
  lead: leadFields,
  propertyCode: z.string().nullable(),
  preferredTime: z.string().nullable(),
});
export type Analysis = z.infer<typeof analysisSchema>;
export const leadStatus = z.enum([
  "NEW",
  "QUALIFYING",
  "QUALIFIED",
  "VIEWING_REQUESTED",
  "FOLLOW_UP",
  "WON",
  "LOST",
]);
