import type { EmailMessage, MessagingAdapter, SendResult, SmsMessage } from "./types.ts";

/** Twilio Programmable Messaging (SMS only; e-mail stays on the e-mail provider). */
export class TwilioSmsAdapter implements Pick<MessagingAdapter, "sendSms"> {
  readonly provider = "twilio";
  constructor(private readonly cfg: { accountSid: string; authToken: string; from: string; statusCallback?: string }) {}

  async sendSms(msg: SmsMessage): Promise<SendResult> {
    const body = new URLSearchParams({ To: msg.to, From: this.cfg.from, Body: msg.body });
    if (this.cfg.statusCallback) body.set("StatusCallback", this.cfg.statusCallback);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.cfg.accountSid}/Messages.json`, {
      method: "POST",
      headers: { authorization: `Basic ${Buffer.from(`${this.cfg.accountSid}:${this.cfg.authToken}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(`Twilio send failed: ${res.status} ${json.message ?? ""}`);
    return { provider: this.provider, providerMessageId: json.sid ?? "" };
  }

  async sendEmail(_msg: EmailMessage): Promise<SendResult> {
    throw new Error("Twilio adapter does not send e-mail");
  }
}

/** Routes e-mail and SMS to (possibly) different providers. */
export class CompositeMessagingAdapter implements MessagingAdapter {
  readonly provider: string;
  constructor(private readonly email: MessagingAdapter, private readonly sms: Pick<MessagingAdapter, "sendSms"> & { provider: string }) {
    this.provider = email.provider === sms.provider ? email.provider : `${email.provider}+${sms.provider}`;
  }
  sendEmail(msg: EmailMessage) {
    return this.email.sendEmail(msg);
  }
  sendSms(msg: SmsMessage) {
    return this.sms.sendSms(msg);
  }
}

export function parseFrom(from: string): { name: string; email: string } {
  const m = from.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1]!.trim(), email: m[2]!.trim() } : { name: "AvisBoost", email: from.trim() };
}
