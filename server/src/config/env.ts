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
    GEMINI_MODEL: z.string().default("gemini-3.1-flash-lite"),
    EVOLUTION_API_URL: z.string().url().default("http://localhost:8080"),
    EVOLUTION_GLOBAL_API_KEY: z.string().default(""),
    EVOLUTION_INSTANCE_TOKEN: z.string().default(""),
    EVOLUTION_INSTANCE_NAME: z.string().default(""),
    EVOLUTION_WEBHOOK_SECRET: z.string().default(""),
    PUBLIC_API_URL: z.string().url().default("http://localhost:3001"),
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
  if (!env.EVOLUTION_INSTANCE_TOKEN)
    throw new Error("EVOLUTION_INSTANCE_TOKEN is required in production");
  if (env.EVOLUTION_WEBHOOK_SECRET.length < 24)
    throw new Error(
      "EVOLUTION_WEBHOOK_SECRET must be at least 24 characters in production",
    );
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required in production");
  }
}
