import { TZDate } from "@date-fns/tz";
import { DEFAULT_TZ } from "./dates.ts";

/**
 * When review requests may be sent.
 *  - SMS: Monday–Saturday, 9:00–20:00 (Paris time). E-mail: Monday–Saturday, 8:00–21:00.
 *  - Never on Sundays, and by default never on French public holidays.
 * A message due outside the window moves to the next allowed slot.
 */

export type SendChannel = "SMS" | "EMAIL";

export const SEND_WINDOWS: Record<SendChannel, { startHour: number; endHour: number }> = {
  SMS: { startHour: 9, endHour: 20 },
  EMAIL: { startHour: 8, endHour: 21 },
};

/** Easter Sunday (anonymous Gregorian algorithm). Returns [month (1-12), day]. */
export function easterSunday(year: number): [number, number] {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** French public holidays (metropolitan France) as "YYYY-MM-DD". */
export function frenchHolidays(year: number): string[] {
  const [em, ed] = easterSunday(year);
  const easter = Date.UTC(year, em - 1, ed);
  const plus = (days: number) => {
    const d = new Date(easter + days * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  return [
    `${year}-01-01`, // Jour de l'an
    plus(1), // Lundi de Pâques
    `${year}-05-01`, // Fête du Travail
    `${year}-05-08`, // Victoire 1945
    plus(39), // Ascension
    plus(50), // Lundi de Pentecôte
    `${year}-07-14`, // Fête nationale
    `${year}-08-15`, // Assomption
    `${year}-11-01`, // Toussaint
    `${year}-11-11`, // Armistice
    `${year}-12-25`, // Noël
  ].sort();
}

export interface QuietHoursOptions {
  tz?: string;
  skipHolidays?: boolean;
}

function local(d: Date, tz: string) {
  const z = new TZDate(d.getTime(), tz);
  return { y: z.getFullYear(), m: z.getMonth(), d: z.getDate(), h: z.getHours(), dow: z.getDay(), minutes: z.getHours() * 60 + z.getMinutes() };
}

function isClosedDay(y: number, m: number, d: number, dow: number, skipHolidays: boolean): boolean {
  if (dow === 0) return true;
  return skipHolidays && frenchHolidays(y).includes(`${y}-${pad(m + 1)}-${pad(d)}`);
}

export function isSendAllowed(at: Date, channel: SendChannel, opts: QuietHoursOptions = {}): boolean {
  const tz = opts.tz ?? DEFAULT_TZ;
  const w = SEND_WINDOWS[channel];
  const l = local(at, tz);
  if (isClosedDay(l.y, l.m, l.d, l.dow, opts.skipHolidays ?? true)) return false;
  return l.minutes >= w.startHour * 60 && l.minutes < w.endHour * 60;
}

/** Earliest instant ≥ `at` inside the send window. */
export function nextAllowedSendTime(at: Date, channel: SendChannel, opts: QuietHoursOptions = {}): Date {
  const tz = opts.tz ?? DEFAULT_TZ;
  if (isSendAllowed(at, channel, opts)) return at;
  const w = SEND_WINDOWS[channel];
  const l = local(at, tz);
  // Start from today if we're before the window opens, otherwise from tomorrow.
  let day = l.minutes < w.startHour * 60 ? 0 : 1;
  for (let i = 0; i < 14; i++, day++) {
    const candidate = new Date(new TZDate(l.y, l.m, l.d + day, w.startHour, 0, 0, tz).getTime());
    const c = local(candidate, tz);
    if (!isClosedDay(c.y, c.m, c.d, c.dow, opts.skipHolidays ?? true)) return candidate;
  }
  throw new Error("No send window found within 14 days");
}
