import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
export class WhatsAppService {
  constructor(private request: typeof fetch = fetch) {}
  async sendTextMessage(phoneNumber: string, message: string) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID)
      throw new AppError(503, "WhatsApp credentials are not configured");
    const response = await this.request(
      `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phoneNumber,
          type: "text",
          text: { preview_url: false, body: message },
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!response.ok)
      throw new AppError(
        502,
        `WhatsApp send failed (HTTP ${response.status}); review delivery before retrying`,
      );
    const body = (await response.json()) as { messages?: { id: string }[] };
    if (!body.messages?.[0]?.id)
      throw new AppError(502, "WhatsApp returned no message identifier");
    return body.messages[0].id;
  }
}
export const whatsappService = new WhatsAppService();
