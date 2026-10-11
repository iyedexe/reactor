import { z } from "zod";

/**
 * Single source of truth for configuration. Every variable is documented in `.env.example`.
 * Adapters are selected by *_MODE variables so the whole app runs end to end with mocks.
 */
const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

  APP_URL: z.url().default("http://localhost:3000"),
  /** Public base URL for smart links (/r/{code}); can be a shorter domain than APP_URL. */
  LINKS_URL: z.url().optional(),
  DATABASE_URL: z.string().min(1),
  /** Used for auth cookies and keyed hashes (opt-out list, visitor hashes). 32+ random chars. */
  APP_SECRET: z.string().min(32),
  /** First platform admin, promoted automatically on first sign-in / by the seed. */
  ADMIN_EMAIL: z.email().optional(),
  /** Login rate limiting (3 attempts / 10 s / IP). Defaults to on in production; CI end-to-end runs turn it off. */
  AUTH_RATE_LIMIT: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),

  GOOGLE_MODE: z.enum(["mock", "live"]).default("mock"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REFRESH_TOKEN: z.string().optional(),
  PLACES_MODE: z.enum(["mock", "live"]).default("mock"),
  GOOGLE_PLACES_API_KEY: z.string().optional(),

  LLM_MODE: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL_REPLY: z.string().optional(),
  ANTHROPIC_MODEL_CLASSIFY: z.string().optional(),

  MESSAGING_MODE: z.enum(["console", "brevo", "twilio"]).default("console"),
  EMAIL_FROM: z.string().default("AvisBoost <no-reply@example.com>"),
  BREVO_API_KEY: z.string().optional(),
  BREVO_SMS_SENDER: z.string().max(11).optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM: z.string().optional(),

  STRIPE_MODE: z.enum(["mock", "live"]).default("mock"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ESSENTIEL: z.string().optional(),
  STRIPE_PRICE_PRO: z.string().optional(),
  STRIPE_PRICE_SETUP: z.string().optional(),
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).default(30),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./storage"),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  WORKER_HEALTH_PORT: z.coerce.number().int().default(3001),
  /** Mock mode only: worker periodically adds fake new reviews so syncing is visible in demos. */
  MOCK_REVIEW_GENERATOR: bool,
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** For tests. */
export function resetEnvCache() {
  cached = undefined;
}

export function linksBaseUrl(e: Env = env()): string {
  return (e.LINKS_URL ?? e.APP_URL).replace(/\/$/, "");
}
