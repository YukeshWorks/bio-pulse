import { CATEGORIES } from '../../shared/categories';
import { addDays, parseSourceDate } from '../lib/dates';
import { normalizeDoi, normalizePmcid, normalizePmid } from '../lib/ids';
import { cleanText, cleanTitle } from '../lib/text';
import type { Collector, RawRecord } from '../types';

/**
 * Europe PMC REST API (https://europepmc.org/RestfulWebService).
 * Journal articles (SRC:MED) and preprints from many servers (SRC:PPR). Preprints are always
 * labelled PREPRINT. Records overlapping PubMed/bioRxiv are merged by DOI/PMID during deduplication.
 */
const BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: { fullName?: string; collectiveName?: string; authorAffiliationDetailsList?: { authorAffiliation?: { affiliation?: string }[] } }[] };
  journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
  firstPublicationDate?: string;
  abstractText?: string;
  pubTypeList?: { pubType?: string[] };
  keywordList?: { keyword?: string[] };
}

export function buildEuropePmcQuery(from: string, to: string): string {
  const terms = [...new Set(CATEGORIES.flatMap((c) => c.pubmedTerms))].map((t) => `"${t}"`).join(' OR ');
  return `(${terms}) AND (SRC:MED OR SRC:PPR) AND (FIRST_PDATE:[${from} TO ${to}])`;
}

export function mapEuropePmcResult(r: EpmcResult): RawRecord | null {
  if (r.source !== 'MED' && r.source !== 'PPR') return null;
  const isPreprint = r.source === 'PPR';
  const pubTypes = r.pubTypeList?.pubType ?? [];
  if (pubTypes.some((t) => /erratum|editorial|comment|retraction/i.test(t))) return null;
  const pmid = normalizePmid(r.pmid);
  const doi = normalizeDoi(r.doi);
  const id = r.id ? encodeURIComponent(r.id) : undefined;
  if (!id) return null;
  const authorObjs = r.authorList?.author ?? [];
  const authors = authorObjs.length
    ? authorObjs.map((a) => a.fullName ?? a.collectiveName ?? '').filter(Boolean)
    : (r.authorString ?? '')
        .replace(/\.$/, '')
        .split(/,\s*/)
        .filter(Boolean);
  const affiliation = authorObjs[0]?.authorAffiliationDetailsList?.authorAffiliation?.[0]?.affiliation;
  return {
    sourceId: 'europepmc',
    sourceName: 'Europe PMC',
    title: cleanTitle(r.title),
    authors,
    organization: affiliation ? cleanText(affiliation).slice(0, 200) : undefined,
    date: parseSourceDate(r.firstPublicationDate),
    dateType: isPreprint ? 'posted' : 'published',
    url: `https://europepmc.org/article/${r.source}/${id}`,
    venue: isPreprint ? (r.bookOrReportDetails?.publisher ?? 'Preprint server') : r.journalInfo?.journal?.title,
    identifiers: { pmid: isPreprint ? undefined : pmid, doi, pmcid: normalizePmcid(r.pmcid) },
    abstract: r.abstractText ? cleanText(r.abstractText) : undefined,
    keywords: r.keywordList?.keyword ?? [],
    evidence: isPreprint ? 'PREPRINT' : 'PEER-REVIEWED',
    articleTypes: pubTypes,
  };
}

export const europePmcCollector: Collector = {
  id: 'europepmc',
  name: 'Europe PMC',
  skipReason: () => null,
  async collect(ctx) {
    const from = addDays(ctx.runDate, -ctx.config.lookbackDays);
    const query = buildEuropePmcQuery(from, ctx.runDate);
    const records: RawRecord[] = [];
    const warnings: string[] = [];
    let cursor = '*';
    const pageSize = Math.min(100, ctx.config.europePmcMax);
    while (records.length < ctx.config.europePmcMax) {
      const params = new URLSearchParams({ query, format: 'json', resultType: 'core', pageSize: String(pageSize), cursorMark: cursor, sort: 'FIRST_PDATE_D desc' });
      const res = await ctx.http.getJson<{ nextCursorMark?: string; resultList?: { result?: EpmcResult[] } }>(`${BASE}?${params}`, { timeoutMs: 60_000 });
      const page = res.resultList?.result ?? [];
      for (const r of page) {
        const m = mapEuropePmcResult(r);
        if (m) records.push(m);
      }
      if (page.length < pageSize || !res.nextCursorMark || res.nextCursorMark === cursor) break;
      cursor = res.nextCursorMark;
    }
    return { records: records.slice(0, ctx.config.europePmcMax), warnings };
  },
};
