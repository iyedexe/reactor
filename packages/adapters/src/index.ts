import { env, type Env } from "@avis/core/env";
import { createLogger } from "@avis/core/logger";
import { LiveGoogleBusinessAdapter } from "./google/live.ts";
import { MockGoogleBusinessAdapter } from "./google/mock.ts";
import type { GoogleBusinessAdapter } from "./google/types.ts";
import { MockLlmAdapter } from "./llm/mock.ts";
import type { LlmAdapter } from "./llm/types.ts";
import { ConsoleMessagingAdapter } from "./messaging/console.ts";
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
  const messaging: MessagingAdapter = new ConsoleMessagingAdapter(log); // Brevo/Twilio arrive in phase 5
  const storage: StorageAdapter = new LocalStorageAdapter(e.STORAGE_LOCAL_PATH); // S3 arrives in phase 8
  return { google, places, llm, messaging, storage };
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
