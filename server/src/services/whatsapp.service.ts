import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

type EvolutionResponse = {
  message?: string;
  error?: string;
  data?: {
    Info?: { ID?: string };
    info?: { id?: string };
    qrcode?: string;
    code?: string;
    connected?: boolean;
    loggedIn?: boolean;
    name?: string;
    myJid?: string;
  };
};

export class WhatsAppService {
  constructor(private request: typeof fetch = fetch) {}

  private configured() {
    if (!env.EVOLUTION_API_URL || !env.EVOLUTION_INSTANCE_TOKEN)
      throw new AppError(503, "Evolution Go is not configured");
  }

  private async call(path: string, init: RequestInit = {}, timeoutMs = 15000) {
    this.configured();
    let response: Response;
    try {
      response = await this.request(
        `${env.EVOLUTION_API_URL.replace(/\/$/, "")}${path}`,
        {
          ...init,
          headers: {
            apikey: env.EVOLUTION_INSTANCE_TOKEN,
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...init.headers,
          },
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new AppError(
        503,
        timedOut
          ? `Evolution Go at ${env.EVOLUTION_API_URL} did not respond in time. Start the service and try again.`
          : `Cannot connect to Evolution Go at ${env.EVOLUTION_API_URL}. Start or install Evolution Go, then try again.`,
      );
    }
    let body: EvolutionResponse = {};
    try {
      body = (await response.json()) as EvolutionResponse;
    } catch {
      if (!response.ok)
        throw new AppError(
          502,
          `Evolution Go request failed (HTTP ${response.status}); review provider state before retrying`,
        );
      throw new AppError(502, "Evolution Go returned a non-JSON response");
    }
    if (!response.ok) {
      const detail = body.error || body.message;
      throw new AppError(
        502,
        `Evolution Go request failed (HTTP ${response.status}${detail ? `: ${detail}` : ""}); review provider state before retrying`,
      );
    }
    return body;
  }

  async sendTextMessage(phoneNumber: string, message: string) {
    const body = await this.call("/send/text", {
      method: "POST",
      body: JSON.stringify({
        number: phoneNumber.replace(/^\+/, "").replace(/[\s()-]/g, ""),
        text: message,
        formatJid: true,
      }),
    });
    const id = body.data?.Info?.ID || body.data?.info?.id;
    if (!id)
      throw new AppError(502, "Evolution Go returned no message identifier");
    return id;
  }

  async sendImageMessage(
    phoneNumber: string,
    imageUrl: string,
    caption: string,
  ) {
    if (!imageUrl.startsWith("https://"))
      throw new AppError(400, "Property image must use a public HTTPS URL");
    const body = await this.call(
      "/send/media",
      {
        method: "POST",
        body: JSON.stringify({
          number: phoneNumber.replace(/^\+/, "").replace(/[\s()-]/g, ""),
          type: "image",
          url: imageUrl,
          caption,
          filename: "property.jpg",
          formatJid: true,
        }),
      },
      60000,
    );
    const id = body.data?.Info?.ID || body.data?.info?.id;
    if (!id)
      throw new AppError(502, "Evolution Go returned no media message identifier");
    return id;
  }

  async getConnectionStatus() {
    return (await this.call("/instance/status")).data || {};
  }

  async connect(webhookUrl: string) {
    return this.call("/instance/connect", {
      method: "POST",
      body: JSON.stringify({
        webhookUrl,
        subscribe: ["MESSAGE", "READ_RECEIPT", "CONNECTION"],
      }),
    });
  }

  async getQrCode() {
    return (await this.call("/instance/qr")).data || {};
  }
}

export const whatsappService = new WhatsAppService();
