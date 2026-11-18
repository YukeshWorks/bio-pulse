import { CATEGORIES } from '../../shared/categories';
import type { SourceId } from '../../shared/schema';
import { addDays, parseSourceDate } from '../lib/dates';
import { normalizeDoi } from '../lib/ids';
import { cleanText, cleanTitle } from '../lib/text';
import type { Collector, RawRecord } from '../types';

/**
 * bioRxiv / medRxiv public API (https://api.biorxiv.org/).
 * `details/{server}/{from}/{to}/{cursor}` returns 100 records per page. Only version 1 postings
 * (new manuscripts) are collected. Every record is labelled PREPRINT — never peer-reviewed.
 */
interface RxivItem {
  doi?: string;
  title?: string;
  authors?: string;
  author_corresponding_institution?: string;
  date?: string;
  version?: string;
  type?: string;
  category?: string;
  abstract?: string;
  published?: string;
  server?: string;
}

const RELEVANT_SUBJECTS = new Set(CATEGORIES.flatMap((c) => c.preprintSubjects));

export function mapRxivItem(item: RxivItem, server: 'biorxiv' | 'medrxiv'): RawRecord | null {
  const doi = normalizeDoi(item.doi);
  if (!doi) return null;
  const version = String(item.version ?? '1');
  if (version !== '1') return null;
  const category = (item.category ?? '').trim().toLowerCase();
  const authors = (item.authors ?? '')
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      // "Smith, J. A." -> "J. A. Smith"
      const [last, first] = a.split(',').map((s) => s.trim());
      return first ? `${first} ${last}` : last;
    });
  const published = item.published && item.published !== 'NA' ? normalizeDoi(item.published) : undefined;
  const host = server === 'biorxiv' ? 'www.biorxiv.org' : 'www.medrxiv.org';
  return {
    sourceId: server,
    sourceName: server === 'biorxiv' ? 'bioRxiv' : 'medRxiv',
    title: cleanTitle(item.title),
    authors,
    organization: item.author_corresponding_institution ? cleanText(item.author_corresponding_institution).slice(0, 200) : undefined,
    date: parseSourceDate(item.date),
    dateType: 'posted',
    url: `https://${host}/content/${doi}v${version}`,
    venue: server === 'biorxiv' ? 'bioRxiv (preprint)' : 'medRxiv (preprint)',
    identifiers: { doi, publishedDoi: published },
    abstract: item.abstract ? cleanText(item.abstract) : undefined,
    subjects: category ? [category] : [],
    evidence: 'PREPRINT',
    articleTypes: item.type ? [item.type] : undefined,
  };
}

function makeCollector(server: 'biorxiv' | 'medrxiv'): Collector {
  return {
    id: server as SourceId,
    name: server === 'biorxiv' ? 'bioRxiv' : 'medRxiv',
    skipReason: () => null,
    async collect(ctx) {
      const from = addDays(ctx.runDate, -ctx.config.lookbackDays);
      const records: RawRecord[] = [];
      const warnings: string[] = [];
      let cursor = 0;
      for (let page = 0; page < ctx.config.preprintMaxPages; page++) {
        const url = `https://api.biorxiv.org/details/${server}/${from}/${ctx.runDate}/${cursor}/json`;
        const res = await ctx.http.getJson<{ messages?: { status?: string; total?: number | string; count?: number | string }[]; collection?: RxivItem[] }>(url, { timeoutMs: 60_000 });
        const msg = res.messages?.[0];
        const items = res.collection ?? [];
        if (msg?.status && msg.status !== 'ok' && items.length === 0) {
          // The API reports "no posts found" as a non-ok status: a legitimately empty window.
          if (/no posts found/i.test(msg.status)) break;
          throw new Error(`${server} API status: ${msg.status}`);
        }
        for (const it of items) {
          const subject = (it.category ?? '').toLowerCase();
          if (!RELEVANT_SUBJECTS.has(subject)) continue;
          const m = mapRxivItem(it, server);
          if (m) records.push(m);
        }
        const total = Number(msg?.total ?? 0);
        cursor += items.length;
        if (items.length === 0 || cursor >= total) break;
        if (page === ctx.config.preprintMaxPages - 1) warnings.push(`stopped after ${ctx.config.preprintMaxPages} pages (${cursor}/${total} postings scanned)`);
      }
      return { records, warnings };
    },
  };
}

export const biorxivCollector = makeCollector('biorxiv');
export const medrxivCollector = makeCollector('medrxiv');
