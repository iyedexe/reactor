import { randomUUID } from "node:crypto";
import type { Logger } from "@avis/core/logger";
import type { EmailMessage, MessagingAdapter, SendResult, SmsMessage } from "./types.ts";

/** Development adapter: logs messages instead of sending them, and keeps the last ones in memory. */
export class ConsoleMessagingAdapter implements MessagingAdapter {
  readonly provider = "console";
  readonly outbox: ({ kind: "email" } & EmailMessage | { kind: "sms" } & SmsMessage)[] = [];

  constructor(private readonly log?: Logger) {}

  async sendEmail(msg: EmailMessage): Promise<SendResult> {
    this.outbox.push({ kind: "email", ...msg });
    this.outbox.splice(0, Math.max(0, this.outbox.length - 100));
    this.log?.info({ to: msg.to, subject: msg.subject, text: msg.text }, "email (console)");
    return { provider: this.provider, providerMessageId: randomUUID() };
  }

  async sendSms(msg: SmsMessage): Promise<SendResult> {
    this.outbox.push({ kind: "sms", ...msg });
    this.outbox.splice(0, Math.max(0, this.outbox.length - 100));
    this.log?.info({ to: msg.to, body: msg.body }, "sms (console)");
    return { provider: this.provider, providerMessageId: randomUUID() };
  }
}
