import pino, { type Logger } from "pino";

/** Structured JSON logs to stdout (one object per line), ready for any log collector. */
export function createLogger(service: string, level = process.env.LOG_LEVEL ?? "info"): Logger {
  return pino({
    level,
    base: { service },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: {
      paths: ["*.password", "*.token", "*.apiKey", "*.authorization", "req.headers.authorization", "req.headers.cookie"],
      censor: "[redacted]",
    },
  });
}

export type { Logger };
