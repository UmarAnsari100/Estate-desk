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
if (
  env.NODE_ENV === "production" &&
  (env.MOCK_MODE || env.JWT_SECRET.startsWith("replace-"))
)
  throw new Error("Unsafe production configuration");
