import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://estate:estate@localhost:5432/estate_test",
      CLIENT_URL: "http://localhost:5173",
      JWT_SECRET: "test-only-secret-with-at-least-32-characters",
      MOCK_MODE: "true",
      WHATSAPP_VERIFY_TOKEN: "test-verify",
      WHATSAPP_APP_SECRET: "test-secret",
      WHATSAPP_ACCESS_TOKEN: "test-token",
      WHATSAPP_PHONE_NUMBER_ID: "test-phone",
    },
  },
});
