import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://estate:estate@localhost:5432/estate_test",
      CLIENT_URL: "http://localhost:5173",
      JWT_SECRET: "test-only-secret-with-at-least-32-characters",
      MOCK_MODE: "true",
      EVOLUTION_API_URL: "http://localhost:8080",
      EVOLUTION_INSTANCE_TOKEN: "test-instance-token",
      EVOLUTION_INSTANCE_NAME: "estate-desk-test",
      EVOLUTION_WEBHOOK_SECRET: "test-evolution-webhook-secret",
      PUBLIC_API_URL: "http://localhost:3001",
    },
  },
});
