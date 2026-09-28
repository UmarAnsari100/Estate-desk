import { config } from "dotenv";
import { z } from "zod";
config({ path: "../.env", quiet: true });
config({ quiet: true });
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3001),
    DATABASE_URL: z.string().min(1),
    CLIENT_URL: z.url(),
    JWT_SECRET: z.string().min(32),
    MOCK_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    GEMINI_API_KEY: z.string().default(""),
    GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
    WHATSAPP_ACCESS_TOKEN: z.string().default(""),
    WHATSAPP_PHONE_NUMBER_ID: z.string().default(""),
    WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(""),
    WHATSAPP_VERIFY_TOKEN: z.string().default(""),
    WHATSAPP_APP_SECRET: z.string().default(""),
    WHATSAPP_GRAPH_VERSION: z
      .string()
      .regex(/^v\d+\.\d+$/)
      .default("v23.0"),
  })
  .parse(process.env);
if (env.NODE_ENV === "production") {
  if (env.MOCK_MODE) {
    throw new Error("MOCK_MODE must be false in production");
  }
  if (env.JWT_SECRET.startsWith("replace-") || env.JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET must be a secure random secret of at least 32 characters in production",
    );
  }
  if (!env.WHATSAPP_APP_SECRET) {
    throw new Error("WHATSAPP_APP_SECRET is required in production");
  }
  if (!env.WHATSAPP_ACCESS_TOKEN) {
    throw new Error("WHATSAPP_ACCESS_TOKEN is required in production");
  }
  if (!env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID is required in production");
  }
  if (!env.WHATSAPP_VERIFY_TOKEN) {
    throw new Error("WHATSAPP_VERIFY_TOKEN is required in production");
  }
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required in production");
  }
}
