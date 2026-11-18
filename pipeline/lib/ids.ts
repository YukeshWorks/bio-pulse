import { createHash } from 'node:crypto';
import type { Identifiers } from '../../shared/schema';

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

/** Normalise a DOI to its bare, lower-case form (DOIs are case-insensitive). Returns undefined if invalid. */
export function normalizeDoi(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '')
    .replace(/[.,;]+$/, '')
    .toLowerCase();
  return DOI_RE.test(s) ? s : undefined;
}

export function normalizePmid(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined;
  const s = String(input).trim();
  return /^\d{1,9}$/.test(s) && s !== '0' ? s : undefined;
}

export function normalizePmcid(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim().toUpperCase();
  return /^PMC\d+$/.test(s) ? s : undefined;
}

export function normalizeNct(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim().toUpperCase();
  return /^NCT\d{8}$/.test(s) ? s : undefined;
}

/** Patent publication number in DOCDB-like compact form, e.g. EP4123456A1, WO2026123456A1. */
export function normalizePatentNumber(country: unknown, number: unknown, kind: unknown): string | undefined {
  if (typeof country !== 'string' || (typeof number !== 'string' && typeof number !== 'number')) return undefined;
  const cc = country.trim().toUpperCase();
  const num = String(number).trim().replace(/[\s/,.-]/g, '');
  const k = typeof kind === 'string' ? kind.trim().toUpperCase() : '';
  const out = `${cc}${num}${k}`;
  return /^[A-Z]{2}\d{3,}[A-Z]\d?$/.test(out) ? out : undefined;
}

export function normalizeUrlForKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    for (const p of [...u.searchParams.keys()]) if (/^utm_/i.test(p)) u.searchParams.delete(p);
    return `${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url;
  }
}

export function normalizeTitleForKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * All keys under which two records are considered the same item.
 * Title keys are scoped by evidence class so that a preprint and its later journal version (which often
 * share a title but are distinct publications) are not collapsed into one record.
 */
export function dedupeKeys(ids: Identifiers, url: string, title: string, evidence = ''): string[] {
  const keys: string[] = [];
  if (ids.doi) keys.push(`doi:${ids.doi}`);
  if (ids.pmid) keys.push(`pmid:${ids.pmid}`);
  if (ids.pmcid) keys.push(`pmcid:${ids.pmcid}`);
  if (ids.nct) keys.push(`nct:${ids.nct}`);
  if (ids.patentNumber) keys.push(`pat:${ids.patentNumber}`);
  keys.push(`url:${normalizeUrlForKey(url)}`);
  const t = normalizeTitleForKey(title);
  if (t.length >= 40) keys.push(`title:${evidence}:${t}`);
  return keys;
}

const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

/** Stable record id derived from the strongest identifier available. */
export function recordId(ids: Identifiers, url: string): string {
  if (ids.doi) return `doi-${hash(ids.doi)}`;
  if (ids.pmid) return `pmid-${ids.pmid}`;
  if (ids.nct) return `nct-${ids.nct.slice(3)}`;
  if (ids.patentNumber) return `pat-${ids.patentNumber.toLowerCase()}`;
  return `url-${hash(normalizeUrlForKey(url))}`;
}
