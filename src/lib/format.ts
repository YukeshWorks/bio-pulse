const TZ = 'Asia/Kolkata';

export function formatDate(date: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  // Calendar dates are rendered as-is (no zone shift) by anchoring them at UTC noon.
  const d = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
}

export function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} IST`;
}

export function todayInIst(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function relativeAge(iso: string, now = new Date()): string {
  const h = (now.getTime() - Date.parse(iso)) / 3_600_000;
  if (!Number.isFinite(h)) return '';
  if (h < 1) return 'less than an hour ago';
  if (h < 48) return `${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export type Freshness = 'fresh' | 'stale' | 'very-stale' | 'unknown';

/**
 * Stale-data detection. The pipeline runs daily at 07:00 IST, so data older than 30 hours means
 * at least one scheduled run did not publish; older than 72 hours is flagged prominently.
 */
export function freshness(lastSuccessfulIso: string | null | undefined, now = new Date()): Freshness {
  if (!lastSuccessfulIso) return 'unknown';
  const h = (now.getTime() - Date.parse(lastSuccessfulIso)) / 3_600_000;
  if (!Number.isFinite(h)) return 'unknown';
  if (h <= 30) return 'fresh';
  if (h <= 72) return 'stale';
  return 'very-stale';
}

export function authorsLine(authors: string[], organization?: string, max = 3): string {
  if (authors.length === 0) return organization ?? 'Authors not listed in source metadata';
  const a = authors.length > max ? `${authors.slice(0, max).join(', ')} et al.` : authors.join(', ');
  return a;
}
