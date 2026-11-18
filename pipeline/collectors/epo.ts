import { addDays, parseSourceDate } from '../lib/dates';
import { normalizePatentNumber } from '../lib/ids';
import { cleanText, cleanTitle } from '../lib/text';
import { asArray } from '../lib/xml';
import type { Collector, CollectorContext, RawRecord } from '../types';

/**
 * European Patent Office — Open Patent Services (OPS) v3.2.
 * Requires a free OPS developer account: set EPO_OPS_KEY and EPO_OPS_SECRET as GitHub Actions secrets.
 * Without credentials the collector is skipped (reported as "skipped", not as a failure).
 *
 * Patent documents are labelled PATENT APPLICATION; the kind code distinguishes applications (kind A)
 * from granted patents (kind B or C). Neither is evidence of efficacy or commercial success.
 */
const OPS = 'https://ops.epo.org/3.2';

export async function getOpsToken(ctx: CollectorContext): Promise<string> {
  const key = ctx.env.EPO_OPS_KEY!;
  const secret = ctx.env.EPO_OPS_SECRET!;
  const res = await ctx.http.request(`${OPS}/auth/accesstoken`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    retries: 1,
  });
  const body = await res.json<{ access_token?: string }>();
  if (!body.access_token) throw new Error('EPO OPS authentication returned no access token');
  return body.access_token;
}

/** Kind codes: A = published application; B or C = granted patent (EP/US conventions). */
export function patentStatusFromKind(country: string, kind: string): 'application' | 'granted' | 'unknown' {
  const k = kind.toUpperCase();
  if (country === 'WO') return 'application';
  if (/^A\d?$/.test(k)) return 'application';
  if (/^[BC]\d?$/.test(k)) return 'granted';
  return 'unknown';
}

const val = (v: any): string => (v === undefined || v === null ? '' : typeof v === 'object' ? String(v.$ ?? '') : String(v));

export function mapExchangeDocument(doc: any): RawRecord | null {
  const cc = val(doc?.['@country']);
  const num = val(doc?.['@doc-number']);
  const kind = val(doc?.['@kind']);
  const patentNumber = normalizePatentNumber(cc, num, kind);
  if (!patentNumber) return null;
  const biblio = doc?.['bibliographic-data'] ?? {};
  const titles = asArray(biblio['invention-title']);
  const title = val(titles.find((t: any) => t?.['@lang'] === 'en') ?? titles[0]);
  const pubRefs = asArray(biblio['publication-reference']?.['document-id']);
  const pubRef = pubRefs.find((d: any) => d?.['@document-id-type'] === 'docdb') ?? pubRefs[0];
  const applicants = asArray(biblio.parties?.applicants?.applicant)
    .filter((a: any) => a?.['@data-format'] === 'epodoc' || a?.['@data-format'] === 'original')
    .map((a: any) => cleanText(val(a?.['applicant-name']?.name)).replace(/\s*\[[A-Z]{2}\]$/, ''))
    .filter(Boolean);
  const inventors = asArray(biblio.parties?.inventors?.inventor)
    .filter((a: any) => a?.['@data-format'] === 'epodoc')
    .map((a: any) => cleanText(val(a?.['inventor-name']?.name)).replace(/\s*\[[A-Z]{2}\]$/, ''))
    .filter(Boolean);
  const abstracts = asArray(doc?.abstract);
  const abs = abstracts.find((a: any) => a?.['@lang'] === 'en') ?? abstracts[0];
  const abstract = asArray(abs?.p).map(val).join(' ');
  const cpc = asArray(biblio['patent-classifications']?.['patent-classification'])
    .map((c: any) => `${val(c?.section)}${val(c?.class)}${val(c?.subclass)}${val(c?.['main-group'])}`)
    .filter(Boolean);
  const uniqApplicants = [...new Set(applicants)];
  return {
    sourceId: 'epo',
    sourceName: 'EPO Open Patent Services',
    title: cleanTitle(title),
    authors: [...new Set(inventors)],
    organization: uniqApplicants[0],
    date: parseSourceDate(val(pubRef?.date)),
    dateType: 'published',
    url: `https://worldwide.espacenet.com/patent/search?q=pn%3D${patentNumber}`,
    venue: 'Espacenet / EPO OPS',
    identifiers: { patentNumber },
    abstract: abstract ? cleanText(abstract) : undefined,
    evidence: 'PATENT APPLICATION',
    patent: { kind: kind || undefined, status: patentStatusFromKind(cc, kind), applicants: uniqApplicants, cpc: [...new Set(cpc)] },
  };
}

export const epoCollector: Collector = {
  id: 'epo',
  name: 'EPO Open Patent Services',
  skipReason: (ctx) => (ctx.env.EPO_OPS_KEY && ctx.env.EPO_OPS_SECRET ? null : 'EPO OPS credentials not configured (EPO_OPS_KEY / EPO_OPS_SECRET)'),
  async collect(ctx) {
    const token = await getOpsToken(ctx);
    const from = addDays(ctx.runDate, -ctx.config.patentLookbackDays).replace(/-/g, '');
    const to = ctx.runDate.replace(/-/g, '');
    const q = `${ctx.config.epo.query} and pd within "${from} ${to}"`;
    const params = new URLSearchParams({ q, Range: `1-${Math.min(100, ctx.config.epo.maxResults)}` });
    const res = await ctx.http.request(`${OPS}/rest-services/published-data/search/biblio?${params}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      allowErrorStatus: true,
    });
    if (res.status === 404) return { records: [], warnings: ['EPO OPS: no documents matched the query window'] };
    if (!res.ok) throw new Error(`EPO OPS search failed with HTTP ${res.status}`);
    const body = await res.json<any>();
    const docs = asArray(body?.['ops:world-patent-data']?.['ops:biblio-search']?.['ops:search-result']?.['exchange-documents']).flatMap((d: any) =>
      asArray(d?.['exchange-document']),
    );
    const records = docs.map(mapExchangeDocument).filter((r): r is RawRecord => r !== null);
    return { records, warnings: [] };
  },
};
