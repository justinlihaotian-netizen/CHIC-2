import { TIME_ZONE } from "@/config/salon";

// All date maths for the salon's time zone, without extra libraries.

type Parts = { year: number; month: number; day: number; hour: number; minute: number };

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Wall-clock parts of a moment, as seen in the salon's time zone. */
export function zonedParts(ms: number): Parts {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(new Date(ms))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute };
}

/** How far the salon's clock is ahead of UTC at a given moment (ms; negative in Toronto). */
export function offsetAt(ms: number): number {
  const p = zonedParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(ms / 60000) * 60000;
}

/** The moment (epoch ms) when the salon's clock reads the given wall time. */
export function zonedTimeToMs(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(guess);
  // Re-check once so daylight-saving changes land correctly.
  return guess - offsetAt(first);
}

export function isValidDateString(s: string | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Start and end (epoch ms) of a whole salon day, e.g. "2026-10-20". */
export function dayRange(date: string): { start: number; end: number } {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: zonedTimeToMs(y, m, d),
    end: zonedTimeToMs(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()) - 1,
  };
}

/** Today's date in the salon, as "YYYY-MM-DD". */
export function todayString(now = Date.now()): string {
  const p = zonedParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Move a "YYYY-MM-DD" date by a number of days. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** "Tuesday, October 20, 2026" */
export function longDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Minutes since the salon's midnight for `date` (can be <0 or >1440 for other days). */
export function minutesIntoDay(ms: number, date: string): number {
  return Math.round((ms - dayRange(date).start) / 60000);
}

/** "2:41 PM" in the salon's time zone. */
export function clockLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "9 AM", "12 PM", "8 PM" for an hour 0–24. */
export function hourLabel(hour: number): string {
  const h = hour % 24;
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

/** "2026-10-20T10:00:00-04:00" — the format GHL expects when we change a booking. */
export function toZonedIso(ms: number): string {
  const p = zonedParts(ms);
  const off = Math.round(offsetAt(ms) / 60000);
  const sign = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** The moment a salon date ("YYYY-MM-DD") plus minutes after midnight happens. */
export function dateAndMinutesToMs(date: string, minutes: number): number {
  const [y, m, d] = date.split("-").map(Number);
  return zonedTimeToMs(y, m, d, Math.floor(minutes / 60), minutes % 60);
}

/** "10:15 AM" for minutes after midnight. */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Tue, Oct 20" */
export function shortDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole days from a to b ("YYYY-MM-DD"). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/** "2026-10" → "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** "2026-10" moved by n months */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
