import { env, type Env } from "@avis/core/env";
import { createLogger } from "@avis/core/logger";
import { LiveGoogleBusinessAdapter } from "./google/live.ts";
import { MockGoogleBusinessAdapter } from "./google/mock.ts";
import type { GoogleBusinessAdapter } from "./google/types.ts";
import { MockLlmAdapter } from "./llm/mock.ts";
import type { LlmAdapter } from "./llm/types.ts";
import { BrevoMessagingAdapter } from "./messaging/brevo.ts";
import { ConsoleMessagingAdapter } from "./messaging/console.ts";
import { CompositeMessagingAdapter, parseFrom, TwilioSmsAdapter } from "./messaging/twilio.ts";
import type { MessagingAdapter } from "./messaging/types.ts";
import { LivePlacesAdapter } from "./places/live.ts";
import { MockPlacesAdapter } from "./places/mock.ts";
import type { PlacesAdapter } from "./places/types.ts";
import { LocalStorageAdapter } from "./storage/local.ts";
import type { StorageAdapter } from "./storage/types.ts";

export * from "./google/types.ts";
export * from "./places/types.ts";
export * from "./llm/types.ts";
export * from "./messaging/types.ts";
export { ConsoleMessagingAdapter } from "./messaging/console.ts";
export * from "./storage/types.ts";

export interface Adapters {
  google: GoogleBusinessAdapter;
  places: PlacesAdapter;
  llm: LlmAdapter;
  messaging: MessagingAdapter;
  storage: StorageAdapter;
}

/** Builds adapters from configuration. Each has a mock so the app runs end to end with no external account. */
export function createAdapters(e: Env = env()): Adapters {
  const log = createLogger("adapters", e.LOG_LEVEL);
  const google: GoogleBusinessAdapter =
    e.GOOGLE_MODE === "live"
      ? new LiveGoogleBusinessAdapter({ clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET, refreshToken: e.GOOGLE_REFRESH_TOKEN })
      : new MockGoogleBusinessAdapter();
  const places: PlacesAdapter = e.PLACES_MODE === "live" ? new LivePlacesAdapter(e.GOOGLE_PLACES_API_KEY) : new MockPlacesAdapter();
  const llm: LlmAdapter = new MockLlmAdapter(); // Claude adapter arrives in phase 4
  const messaging = createMessaging(e, log);
  const storage: StorageAdapter = new LocalStorageAdapter(e.STORAGE_LOCAL_PATH); // S3 arrives in phase 8
  return { google, places, llm, messaging, storage };
}

function createMessaging(e: Env, log: ReturnType<typeof createLogger>): MessagingAdapter {
  const consoleAdapter = new ConsoleMessagingAdapter(log);
  const brevo = () => {
    if (!e.BREVO_API_KEY) throw new Error("BREVO_API_KEY is required for the brevo provider");
    return new BrevoMessagingAdapter({ apiKey: e.BREVO_API_KEY, from: parseFrom(e.EMAIL_FROM), smsSender: e.BREVO_SMS_SENDER, smsType: e.BREVO_SMS_TYPE });
  };
  const emailProvider = e.EMAIL_PROVIDER ?? (e.MESSAGING_MODE === "twilio" ? "console" : e.MESSAGING_MODE);
  const smsProvider = e.SMS_PROVIDER ?? e.MESSAGING_MODE;
  const email: MessagingAdapter = emailProvider === "brevo" ? brevo() : consoleAdapter;
  let sms: Pick<MessagingAdapter, "sendSms"> & { provider: string } = consoleAdapter;
  if (smsProvider === "brevo") sms = email.provider === "brevo" ? email : brevo();
  if (smsProvider === "twilio") {
    if (!e.TWILIO_ACCOUNT_SID || !e.TWILIO_AUTH_TOKEN || !e.TWILIO_FROM) throw new Error("TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM are required");
    sms = new TwilioSmsAdapter({ accountSid: e.TWILIO_ACCOUNT_SID, authToken: e.TWILIO_AUTH_TOKEN, from: e.TWILIO_FROM });
  }
  return email === sms ? email : new CompositeMessagingAdapter(email, sms);
}

let cached: Adapters | undefined;
export function adapters(): Adapters {
  cached ??= createAdapters();
  return cached;
}

/** Tests can swap in fakes. */
export function setAdapters(a: Partial<Adapters>): void {
  cached = { ...adapters(), ...a };
}
