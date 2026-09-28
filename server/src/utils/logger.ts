import pino from "pino";
export const logger = pino({
  redact: [
    "password",
    "passwordHash",
    "token",
    "headers",
    "apiKey",
    "accessToken",
  ],
});
