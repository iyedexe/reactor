import type { EmailMessage, MessagingAdapter, SendResult, SmsMessage } from "./types.ts";

/**
 * Brevo (ex-Sendinblue) transactional e-mail + SMS.
 *   POST https://api.brevo.com/v3/smtp/email
 *   POST https://api.brevo.com/v3/transactionalSMS/send   (replaces the deprecated /transactionalSMS/sms)
 * Both return { messageId }, which delivery webhooks reference.
 */
export interface BrevoConfig {
  apiKey: string;
  from: { name: string; email: string };
  smsSender?: string; // alphanumeric, max 11 chars
  smsType?: "transactional" | "marketing";
  baseUrl?: string;
}

export class BrevoMessagingAdapter implements MessagingAdapter {
  readonly provider = "brevo";
  constructor(private readonly cfg: BrevoConfig) {}

  private async post(path: string, body: unknown): Promise<{ messageId?: string | number; reference?: string }> {
    const res = await fetch(`${this.cfg.baseUrl ?? "https://api.brevo.com"}${path}`, {
      method: "POST",
      headers: { "api-key": this.cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Brevo ${path} failed: ${res.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : {};
  }

  async sendEmail(msg: EmailMessage): Promise<SendResult> {
    const json = await this.post("/v3/smtp/email", {
      sender: this.cfg.from,
      to: [{ email: msg.to }],
      subject: msg.subject,
      htmlContent: msg.html,
      textContent: msg.text,
      headers: msg.headers,
      tags: msg.tags,
    });
    return { provider: this.provider, providerMessageId: String(json.messageId ?? "") };
  }

  async sendSms(msg: SmsMessage): Promise<SendResult> {
    if (!this.cfg.smsSender) throw new Error("BREVO_SMS_SENDER is not set");
    const json = await this.post("/v3/transactionalSMS/send", {
      sender: this.cfg.smsSender,
      recipient: msg.to.replace(/^\+/, ""),
      content: msg.body,
      type: this.cfg.smsType ?? "transactional",
      tag: "review-request",
      unicodeEnabled: true,
    });
    return { provider: this.provider, providerMessageId: String(json.messageId ?? json.reference ?? "") };
  }
}
