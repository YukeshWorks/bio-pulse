import type { SourceId } from '../../shared/schema';
import type { RawRecord } from '../types';
import { validateRecordDate } from './dates';
import type { HttpClient } from './http';

/** Hosts that each source is allowed to link to. Links elsewhere are rejected as unverifiable. */
export const ALLOWED_HOSTS: Record<SourceId, string[]> = {
  pubmed: ['pubmed.ncbi.nlm.nih.gov'],
  europepmc: ['europepmc.org'],
  biorxiv: ['www.biorxiv.org', 'biorxiv.org'],
  medrxiv: ['www.medrxiv.org', 'medrxiv.org'],
  clinicaltrials: ['clinicaltrials.gov'],
  fda: ['www.fda.gov', 'fda.gov'],
  ema: ['www.ema.europa.eu', 'ema.europa.eu'],
  epo: ['worldwide.espacenet.com'],
  company: [],
};

export interface ValidationOk {
  ok: true;
  checks: string[];
}
export interface ValidationFail {
  ok: false;
  reason: string;
}

export function validateUrl(url: string, sourceId: SourceId, allowedHost?: string): ValidationOk | ValidationFail {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'non-https-url' };
  if (u.username || u.password) return { ok: false, reason: 'invalid-url' };
  const hosts = sourceId === 'company' ? (allowedHost ? [allowedHost] : []) : ALLOWED_HOSTS[sourceId];
  const host = u.host.toLowerCase();
  const allowed = hosts.some((h) => host === h || (sourceId === 'company' && host.endsWith(`.${h.replace(/^www\./, '')}`)));
  if (!allowed) return { ok: false, reason: 'url-host-not-allowed' };
  return { ok: true, checks: ['url-format', 'url-host'] };
}

/** The record's identifiers must agree with its source URL (citation verification). */
export function validateIdentifierConsistency(r: RawRecord): ValidationOk | ValidationFail {
  const url = r.url;
  switch (r.sourceId) {
    case 'pubmed':
      if (!r.identifiers.pmid || !url.includes(`/${r.identifiers.pmid}`)) return { ok: false, reason: 'identifier-mismatch' };
      break;
    case 'clinicaltrials':
      if (!r.identifiers.nct || !url.endsWith(r.identifiers.nct)) return { ok: false, reason: 'identifier-mismatch' };
      break;
    case 'biorxiv':
    case 'medrxiv':
      if (!r.identifiers.doi || !url.toLowerCase().includes(r.identifiers.doi)) return { ok: false, reason: 'identifier-mismatch' };
      break;
    case 'epo':
      if (!r.identifiers.patentNumber || !url.includes(r.identifiers.patentNumber)) return { ok: false, reason: 'identifier-mismatch' };
      break;
    default:
      break;
  }
  return { ok: true, checks: ['identifier-consistency'] };
}

/** Static validation of a raw record: everything that can be checked without network access. */
export function validateRaw(r: RawRecord, runDate: string): ValidationOk | ValidationFail {
  if (!r.title || r.title.length < 10) return { ok: false, reason: 'missing-title' };
  if (/^(untitled|no title|\[?not available\]?)$/i.test(r.title)) return { ok: false, reason: 'missing-title' };
  if (!r.url) return { ok: false, reason: 'missing-url' };
  const u = validateUrl(r.url, r.sourceId, r.allowedHost);
  if (!u.ok) return u;
  if (!r.date) return { ok: false, reason: 'missing-date' };
  const d = validateRecordDate(r.date, runDate);
  if (!d.ok) return { ok: false, reason: d.reason ?? 'invalid-date' };
  const idc = validateIdentifierConsistency(r);
  if (!idc.ok) return idc;
  // Defensive integrity rule: preprint servers can never yield peer-reviewed records.
  if ((r.sourceId === 'biorxiv' || r.sourceId === 'medrxiv') && r.evidence !== 'PREPRINT') return { ok: false, reason: 'evidence-misclassified' };
  if (r.sourceId === 'epo' && r.evidence !== 'PATENT APPLICATION') return { ok: false, reason: 'evidence-misclassified' };
  return { ok: true, checks: [...u.checks, 'date', ...idc.checks] };
}

export type LiveCheck = { result: 'ok' | 'restricted' | 'failed'; status?: number };

/**
 * Live URL check. 2xx/3xx → ok. 404/410 → failed (record is dropped). Other statuses (401/403/405/429/5xx)
 * mean the server exists but refused an automated check → restricted. Network errors → failed.
 */
export async function checkUrlLive(http: HttpClient, url: string): Promise<LiveCheck> {
  try {
    let res = await http.request(url, { method: 'HEAD', allowErrorStatus: true, retries: 1, timeoutMs: 15_000 });
    if (res.status === 405 || res.status === 501) {
      res = await http.request(url, { method: 'GET', allowErrorStatus: true, retries: 1, timeoutMs: 20_000 });
    }
    if (res.status >= 200 && res.status < 400) return { result: 'ok', status: res.status };
    if (res.status === 404 || res.status === 410) return { result: 'failed', status: res.status };
    return { result: 'restricted', status: res.status };
  } catch {
    return { result: 'failed' };
  }
}
