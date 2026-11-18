/** Date helpers. All "run dates" are calendar dates in Asia/Kolkata (IST, UTC+05:30, no DST). */

export const TIMEZONE = 'Asia/Kolkata' as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA timezone. */
export function dateInZone(instant: Date, timeZone: string = TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function istDate(instant: Date): string {
  return dateInZone(instant, TIMEZONE);
}

export function isValidIsoDate(s: string): boolean {
  const m = ISO_DATE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Add (or subtract) whole days to a YYYY-MM-DD calendar date. */
export function addDays(date: string, days: number): string {
  if (!isValidIsoDate(date)) throw new Error(`invalid date: ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Inclusive difference in days (b - a). */
export function diffDays(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / 86_400_000);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Parse the date formats used by the monitored sources into YYYY-MM-DD.
 * Returns null when the value is missing or ambiguous — callers must then reject the record
 * rather than guess a date.
 *
 * Supported: 2026-11-17, 2026-11-17T10:00:00Z, 2026/11/17, 2026/11/17 06:22, 20261117,
 * "2026 Nov 17", RFC 822 dates used by RSS ("Tue, 17 Nov 2026 14:00:00 EST").
 * Instants with a time zone are converted to the IST calendar date.
 */
export function parseSourceDate(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).trim();
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return isValidIsoDate(s) ? s : null;

  m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  m = /^(\d{4})\s+([A-Za-z]{3,4})\s+(\d{1,2})$/.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    if (!mo) return null;
    const iso = `${m[1]}-${pad(mo)}-${pad(Number(m[3]))}`;
    return isValidIsoDate(iso) ? iso : null;
  }

  // Date-time with explicit zone (ISO 8601 or RFC 822). Require a time component so that
  // partial dates like "2026 Nov" are rejected instead of being silently expanded.
  if (/\d{1,2}:\d{2}/.test(s)) {
    const t = Date.parse(s.replace(/\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/, (z) => ZONE_OFFSETS[z]));
    if (!Number.isNaN(t)) return istDate(new Date(t));
  }
  return null;
}

const ZONE_OFFSETS: Record<string, string> = {
  EST: '-0500', EDT: '-0400', CST: '-0600', CDT: '-0500', MST: '-0700', MDT: '-0600', PST: '-0800', PDT: '-0700',
};

export interface DateValidation {
  ok: boolean;
  reason?: string;
}

/**
 * A record date is valid when it is a real calendar date, not in the future relative to the run
 * (one day of slack for time-zone differences between the source and IST) and not absurdly old.
 */
export function validateRecordDate(date: string, runDate: string, oldest = '1990-01-01'): DateValidation {
  if (!isValidIsoDate(date)) return { ok: false, reason: 'invalid-date' };
  if (diffDays(runDate, date) > 1) return { ok: false, reason: 'future-date' };
  if (date < oldest) return { ok: false, reason: 'date-too-old' };
  return { ok: true };
}

/** Human-readable age of a timestamp, used for stale-data detection. */
export function hoursBetween(fromIso: string, to: Date): number {
  return (to.getTime() - Date.parse(fromIso)) / 3_600_000;
}
