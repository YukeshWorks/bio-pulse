import { CATEGORIES } from '../../shared/categories';
import type { EvidenceClass } from '../../shared/schema';
import { addDays, parseSourceDate, validateRecordDate } from '../lib/dates';
import { normalizeDoi, normalizePmcid, normalizePmid } from '../lib/ids';
import { cleanText, cleanTitle } from '../lib/text';
import { asArray, nodeText, parseXml } from '../lib/xml';
import type { Collector, CollectorContext, RawRecord } from '../types';

/**
 * NCBI PubMed via E-utilities (https://www.ncbi.nlm.nih.gov/books/NBK25501/).
 * One esearch per coverage category (Entrez date window), then batched efetch for metadata + abstracts.
 * Rate limit: 3 requests/s without an API key, 10/s with NCBI_API_KEY.
 */
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

const EXCLUDED_TYPES = new Set(['Comment', 'Editorial', 'Published Erratum', 'News', 'Retraction of Publication', 'Expression of Concern', 'Newspaper Article', 'Biography', 'Portrait']);

export function buildPubmedTerm(terms: string[]): string {
  const or = terms.map((t) => `"${t}"[tiab]`).join(' OR ');
  return `(${or}) NOT (comment[pt] OR editorial[pt] OR published erratum[pt] OR news[pt])`;
}

function eutilsParams(ctx: CollectorContext, extra: Record<string, string>): string {
  const p = new URLSearchParams({ tool: 'biopulse', ...extra });
  if (ctx.env.NCBI_API_KEY) p.set('api_key', ctx.env.NCBI_API_KEY);
  if (ctx.env.NCBI_EMAIL) p.set('email', ctx.env.NCBI_EMAIL);
  return p.toString();
}

export function parsePubmedXml(xml: string, runDate: string): RawRecord[] {
  const doc = parseXml(xml, {
    stopNodes: ['*.ArticleTitle', '*.AbstractText'],
    arrays: ['PubmedArticle', 'AbstractText', 'Author', 'PublicationType', 'ELocationID', 'ArticleId', 'PubMedPubDate', 'Keyword', 'AffiliationInfo', 'ArticleDate'],
  });
  const out: RawRecord[] = [];
  for (const art of asArray(doc?.PubmedArticleSet?.PubmedArticle)) {
    const mc = art?.MedlineCitation;
    const a = mc?.Article;
    const pmid = normalizePmid(nodeText(mc?.PMID));
    if (!pmid || !a) continue;

    const pubTypes = asArray(a.PublicationTypeList?.PublicationType).map(nodeText).filter(Boolean);
    if (pubTypes.some((t) => EXCLUDED_TYPES.has(t))) continue;

    const title = cleanTitle(a.ArticleTitle);
    const abstract = asArray(a.Abstract?.AbstractText)
      .map((t: any) => {
        const label = typeof t === 'object' && t?.['@_Label'] ? `${t['@_Label']}: ` : '';
        return label + nodeText(t);
      })
      .join(' ')
      .trim();

    const authors = asArray(a.AuthorList?.Author)
      .map((au: any) => {
        if (au?.CollectiveName) return nodeText(au.CollectiveName);
        const last = nodeText(au?.LastName);
        const fore = nodeText(au?.ForeName) || nodeText(au?.Initials);
        return [fore, last].filter(Boolean).join(' ');
      })
      .filter(Boolean);
    const firstAffiliation = nodeText(asArray(asArray(a.AuthorList?.Author)[0]?.AffiliationInfo)[0]?.Affiliation);

    const articleIds = asArray(art?.PubmedData?.ArticleIdList?.ArticleId);
    const idOf = (type: string) => nodeText(articleIds.find((x: any) => x?.['@_IdType'] === type));
    const eloc = asArray(a.ELocationID).find((x: any) => x?.['@_EIdType'] === 'doi');
    const doi = normalizeDoi(idOf('doi')) ?? normalizeDoi(nodeText(eloc));
    const pmcid = normalizePmcid(idOf('pmc'));

    // Prefer the electronic publication date when it is a full, valid, non-future date; otherwise
    // use the date the record entered PubMed (Entrez date), labelled as "indexed".
    let date: string | null = null;
    let dateType: RawRecord['dateType'] = 'indexed';
    const ad = asArray(a.ArticleDate)[0];
    if (ad) {
      const d = parseSourceDate(`${nodeText(ad.Year)}-${nodeText(ad.Month).padStart(2, '0')}-${nodeText(ad.Day).padStart(2, '0')}`);
      if (d && validateRecordDate(d, runDate).ok) {
        date = d;
        dateType = 'published';
      }
    }
    if (!date) {
      const entrez = asArray(art?.PubmedData?.History?.PubMedPubDate).find((x: any) => x?.['@_PubStatus'] === 'entrez');
      if (entrez) {
        date = parseSourceDate(`${nodeText(entrez.Year)}-${nodeText(entrez.Month).padStart(2, '0')}-${nodeText(entrez.Day).padStart(2, '0')}`);
        dateType = 'indexed';
      }
    }

    const evidence: EvidenceClass = pubTypes.includes('Preprint') ? 'PREPRINT' : 'PEER-REVIEWED';
    out.push({
      sourceId: 'pubmed',
      sourceName: 'PubMed',
      title,
      authors,
      organization: firstAffiliation ? cleanText(firstAffiliation).slice(0, 200) : undefined,
      date,
      dateType,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      venue: nodeText(a.Journal?.Title) || undefined,
      identifiers: { pmid, doi, pmcid },
      abstract: abstract || undefined,
      keywords: asArray(mc?.KeywordList?.Keyword).map(nodeText).filter(Boolean),
      evidence,
      articleTypes: pubTypes,
    });
  }
  return out;
}

export const pubmedCollector: Collector = {
  id: 'pubmed',
  name: 'PubMed (NCBI E-utilities)',
  skipReason: () => null,
  async collect(ctx) {
    const from = addDays(ctx.runDate, -ctx.config.lookbackDays).replace(/-/g, '/');
    const to = ctx.runDate.replace(/-/g, '/');
    const warnings: string[] = [];
    const pmids = new Set<string>();
    const queries = CATEGORIES.filter((c) => c.pubmedTerms.length > 0);
    let failures = 0;

    for (const cat of queries) {
      const url = `${EUTILS}/esearch.fcgi?${eutilsParams(ctx, {
        db: 'pubmed',
        term: buildPubmedTerm(cat.pubmedTerms),
        datetype: 'edat',
        mindate: from,
        maxdate: to,
        retmax: String(ctx.config.pubmedPerCategory),
        sort: 'relevance',
        retmode: 'json',
      })}`;
      try {
        const res = await ctx.http.getJson<{ esearchresult?: { idlist?: string[]; ERROR?: string } }>(url);
        if (res.esearchresult?.ERROR) throw new Error(res.esearchresult.ERROR);
        for (const id of res.esearchresult?.idlist ?? []) {
          const n = normalizePmid(id);
          if (n) pmids.add(n);
        }
      } catch (err) {
        failures++;
        warnings.push(`esearch failed for ${cat.id}: ${(err as Error).message}`);
      }
    }
    if (failures === queries.length) throw new Error(`All PubMed searches failed (${warnings[0] ?? 'unknown error'})`);

    const ids = [...pmids];
    const records: RawRecord[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      const url = `${EUTILS}/efetch.fcgi?${eutilsParams(ctx, { db: 'pubmed', id: batch.join(','), retmode: 'xml', rettype: 'abstract' })}`;
      try {
        const xml = await ctx.http.getText(url, { timeoutMs: 60_000 });
        records.push(...parsePubmedXml(xml, ctx.runDate));
      } catch (err) {
        warnings.push(`efetch failed for batch ${i / 100 + 1}: ${(err as Error).message}`);
      }
    }
    if (ids.length > 0 && records.length === 0 && warnings.length > 0) throw new Error(`PubMed efetch failed: ${warnings.at(-1)}`);
    return { records, warnings };
  },
};
