// Calendar-day helpers. A "day" is a local calendar date string "YYYY-MM-DD".
// Arithmetic is done in UTC on the date string itself, so it is immune to DST and server timezone.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateStr(v: string): boolean {
  if (!DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Today's date in the given IANA timezone (falls back to UTC for invalid zones). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Local date (YYYY-MM-DD) of an instant in a timezone. */
export const dateOf = (instant: Date, timeZone: string) => todayIn(timeZone, instant);

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Inclusive list of dates from start to end. */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const n = diffDays(start, end);
  for (let i = 0; i <= n && i < 3700; i++) out.push(addDays(start, i));
  return out;
}

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function formatDay(date: string, locale = "en", opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(locale, { ...opts, timeZone: "UTC" });
}

export type RangeKey = "day" | "week" | "month" | "year";

export function rangeFor(key: RangeKey, end: string): { start: string; end: string } {
  switch (key) {
    case "day":
      return { start: end, end };
    case "week":
      return { start: addDays(end, -6), end };
    case "month":
      return { start: addDays(end, -29), end };
    case "year":
      return { start: addDays(end, -364), end };
  }
}

/** Local date string for the browser's current timezone. */
export function localToday(): string {
  return todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}
