/**
 * Live "search everywhere": queries free, official/open scholarly APIs directly from the browser.
 * No keys, no server, no cost. Each source is independent: one failing never blocks the others.
 *
 *   Europe PMC   https://europepmc.org/RestfulWebService        papers + preprints (bioRxiv, medRxiv, …)
 *   PubMed       https://www.ncbi.nlm.nih.gov/books/NBK25501/   biomedical journals (E-utilities, JSON)
 *   ClinicalTrials.gov  https://clinicaltrials.gov/data-api/api  trial registrations (API v2)
 *   OpenAlex     https://docs.openalex.org/                     open index of scholarly works
 *
 * Results are shown as the sources describe them. BioPulse does NOT validate, classify or summarise
 * live results; evidence labels come only from source metadata, and "peer-reviewed" is used only
 * where the source marks a journal article (Europe PMC MED / PubMed non-preprint).
 */

export type LiveSourceId = 'europepmc' | 'pubmed' | 'clinicaltrials' | 'openalex';

export type LiveKind = 'peer-reviewed' | 'preprint' | 'journal-article' | 'trial' | 'patent' | 'other';

export interface LiveResult {
  key: string;
  source: LiveSourceId;
  title: string;
  url: string;
  authors?: string;
  venue?: string;
  date?: string;
  kind: LiveKind;
  doi?: string;
  pmid?: string;
  nct?: string;
  extra?: string;
  alsoIn: { source: LiveSourceId; url: string }[];
}

export const LIVE_SOURCES: { id: LiveSourceId; name: string; covers: string; docs: string }[] = [
  { id: 'europepmc', name: 'Europe PMC', covers: 'Papers and preprints (incl. bioRxiv, medRxiv)', docs: 'https://europepmc.org/RestfulWebService' },
  { id: 'pubmed', name: 'PubMed', covers: 'Biomedical journal articles', docs: 'https://www.ncbi.nlm.nih.gov/books/NBK25501/' },
  { id: 'clinicaltrials', name: 'ClinicalTrials.gov', covers: 'Registered clinical trials', docs: 'https://clinicaltrials.gov/data-api/api' },
  { id: 'openalex', name: 'OpenAlex', covers: 'Open index of scholarly works across all fields', docs: 'https://docs.openalex.org/' },
];

export const KIND_LABEL: Record<LiveKind, string> = {
  'peer-reviewed': 'Peer-reviewed study',
  preprint: 'Preprint · not peer-reviewed',
  'journal-article': 'Journal article · review status not stated',
  trial: 'Clinical trial registration',
  patent: 'Patent filing · not proof it works',
  other: 'Other record',
};

const PER_SOURCE = 20;

/** Malformed responses (non-arrays) are treated as empty rather than crashing the page. */
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

const clean = (s: unknown): string =>
  String(s ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');

const normDoi = (d: unknown): string | undefined => {
  const s = String(d ?? '')
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : undefined;
};

const isoDate = (s: unknown): string | undefined => {
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(s ?? ''));
  if (!m) return undefined;
  return [m[1], m[2], m[3]].filter(Boolean).join('-');
};

function shortAuthors(list: string[]): string | undefined {
  const a = list.filter(Boolean);
  if (!a.length) return undefined;
  return a.length > 3 ? `${a.slice(0, 3).join(', ')} et al.` : a.join(', ');
}

// ---------- Europe PMC ----------
export function mapEuropePmc(json: any): LiveResult[] {
  return arr(json?.resultList?.result)
    .map((r: any): LiveResult | null => {
      if (!r?.id || !r?.source || !r?.title) return null;
      const src = String(r.source);
      const kind: LiveKind = src === 'MED' ? 'peer-reviewed' : src === 'PPR' ? 'preprint' : src === 'PAT' ? 'patent' : 'other';
      return {
        key: '',
        source: 'europepmc',
        title: clean(r.title),
        url: `https://europepmc.org/article/${encodeURIComponent(src)}/${encodeURIComponent(r.id)}`,
        authors: r.authorString ? clean(r.authorString) : undefined,
        venue: r.journalTitle ? clean(r.journalTitle) : src === 'PPR' ? clean(r.bookOrReportDetails?.publisher ?? 'Preprint server') : undefined,
        date: isoDate(r.firstPublicationDate ?? r.pubYear),
        kind,
        doi: normDoi(r.doi),
        pmid: src === 'MED' && /^\d+$/.test(String(r.pmid ?? '')) ? String(r.pmid) : undefined,
        alsoIn: [],
      };
    })
    .filter(Boolean) as LiveResult[];
}

// ---------- PubMed (esummary JSON) ----------
export function mapPubmedSummary(json: any): LiveResult[] {
  const res = json?.result ?? {};
  return arr(res.uids)
    .map((uid: string): LiveResult | null => {
      const r = res[uid];
      if (!r?.title || !/^\d+$/.test(uid)) return null;
      const types: string[] = r.pubtype ?? [];
      const doi = normDoi((r.articleids ?? []).find((a: any) => a?.idtype === 'doi')?.value);
      return {
        key: '',
        source: 'pubmed',
        title: clean(r.title),
        url: `https://pubmed.ncbi.nlm.nih.gov/${uid}/`,
        authors: shortAuthors((r.authors ?? []).map((a: any) => a?.name)),
        venue: r.fulljournalname || r.source || undefined,
        date: isoDate(String(r.sortpubdate ?? '').replace(/\//g, '-')),
        kind: types.includes('Preprint') ? 'preprint' : 'peer-reviewed',
        doi,
        pmid: uid,
        alsoIn: [],
      };
    })
    .filter(Boolean) as LiveResult[];
}

// ---------- ClinicalTrials.gov v2 ----------
const human = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function mapTrials(json: any): LiveResult[] {
  return arr(json?.studies)
    .map((s: any): LiveResult | null => {
      const p = s?.protocolSection;
      const nct = String(p?.identificationModule?.nctId ?? '').toUpperCase();
      if (!/^NCT\d{8}$/.test(nct)) return null;
      const phases: string[] = p?.designModule?.phases ?? [];
      const status = p?.statusModule?.overallStatus;
      return {
        key: '',
        source: 'clinicaltrials',
        title: clean(p?.identificationModule?.briefTitle ?? p?.identificationModule?.officialTitle ?? nct),
        url: `https://clinicaltrials.gov/study/${nct}`,
        authors: p?.sponsorCollaboratorsModule?.leadSponsor?.name,
        venue: 'ClinicalTrials.gov',
        date: isoDate(p?.statusModule?.studyFirstPostDateStruct?.date),
        kind: 'trial',
        nct,
        extra: [status && human(status), phases.length ? phases.map((x) => human(x).replace('Phase', 'Phase ')).join('/') : '', (p?.conditionsModule?.conditions ?? []).slice(0, 2).join(', ')]
          .filter(Boolean)
          .join(' · '),
        alsoIn: [],
      };
    })
    .filter(Boolean) as LiveResult[];
}

// ---------- OpenAlex ----------
export function mapOpenAlex(json: any): LiveResult[] {
  return arr(json?.results)
    .map((w: any): LiveResult | null => {
      if (!w?.id || !w?.display_name) return null;
      const doi = normDoi(w.doi);
      const loc = w.primary_location ?? {};
      const sourceType = loc.source?.type;
      const kind: LiveKind = w.type === 'preprint' || sourceType === 'repository' ? 'preprint' : w.type === 'article' && sourceType === 'journal' ? 'journal-article' : 'other';
      const id = String(w.id);
      const landing = doi ? `https://doi.org/${doi}` : /^https:\/\/openalex\.org\/W\d+$/.test(id) ? id : null;
      if (!landing) return null;
      return {
        key: '',
        source: 'openalex',
        title: clean(w.display_name),
        url: landing,
        authors: shortAuthors((w.authorships ?? []).map((a: any) => a?.author?.display_name)),
        venue: loc.source?.display_name ?? undefined,
        date: isoDate(w.publication_date ?? w.publication_year),
        kind,
        doi,
        alsoIn: [],
      };
    })
    .filter(Boolean) as LiveResult[];
}

// ---------- Fetchers ----------
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, url: string, signal: AbortSignal): Promise<any> {
  const res = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const SEARCHERS: Record<LiveSourceId, (q: string, f: Fetcher, signal: AbortSignal) => Promise<LiveResult[]>> = {
  europepmc: async (q, f, signal) => {
    const p = new URLSearchParams({ query: q, format: 'json', resultType: 'lite', pageSize: String(PER_SOURCE) });
    return mapEuropePmc(await getJson(f, `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${p}`, signal));
  },
  pubmed: async (q, f, signal) => {
    const s = new URLSearchParams({ db: 'pubmed', term: q, retmode: 'json', retmax: String(PER_SOURCE), sort: 'relevance', tool: 'biopulse' });
    const ids: string[] = (await getJson(f, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${s}`, signal))?.esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const m = new URLSearchParams({ db: 'pubmed', id: ids.join(','), retmode: 'json', tool: 'biopulse' });
    const out = mapPubmedSummary(await getJson(f, `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${m}`, signal));
    const order = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => (order.get(a.pmid!) ?? 0) - (order.get(b.pmid!) ?? 0)); // keep PubMed relevance order
  },
  clinicaltrials: async (q, f, signal) => {
    const p = new URLSearchParams({ 'query.term': q, pageSize: String(PER_SOURCE), format: 'json' });
    return mapTrials(await getJson(f, `https://clinicaltrials.gov/api/v2/studies?${p}`, signal));
  },
  openalex: async (q, f, signal) => {
    const p = new URLSearchParams({ search: q, 'per-page': String(PER_SOURCE), select: 'id,doi,display_name,publication_date,publication_year,type,primary_location,authorships' });
    return mapOpenAlex(await getJson(f, `https://api.openalex.org/works?${p}`, signal));
  },
};

/** Merge records that share a DOI, PMID or NCT ID; the first source keeps the card, others become "also in". */
export function mergeResults(lists: LiveResult[][]): LiveResult[] {
  const out: LiveResult[] = [];
  const index = new Map<string, LiveResult>();
  // Round-robin across sources so each source's best results appear near the top.
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const list of lists) {
      const r = list[i];
      if (!r) continue;
      const keys = [r.doi && `doi:${r.doi}`, r.pmid && `pmid:${r.pmid}`, r.nct && `nct:${r.nct}`].filter(Boolean) as string[];
      const existing = keys.map((k) => index.get(k)).find(Boolean);
      if (existing) {
        if (existing.source !== r.source && !existing.alsoIn.some((a) => a.source === r.source)) existing.alsoIn.push({ source: r.source, url: r.url });
        // A preprint label from any copy wins over a generic label (conservative).
        if (r.kind === 'preprint' && existing.kind !== 'preprint') existing.kind = 'preprint';
        for (const k of keys) index.set(k, existing);
        continue;
      }
      const item = { ...r, key: keys[0] ?? `${r.source}:${r.url}`, alsoIn: [] };
      for (const k of keys) index.set(k, item);
      out.push(item);
    }
  }
  return out;
}

export interface SourceState {
  status: 'idle' | 'loading' | 'ok' | 'error';
  count: number;
  error?: string;
}

export async function searchEverywhere(
  q: string,
  sources: LiveSourceId[],
  opts: { fetcher?: Fetcher; signal?: AbortSignal; onSource?: (id: LiveSourceId, s: SourceState) => void; onPartial?: (results: LiveResult[]) => void; timeoutMs?: number } = {},
): Promise<{ results: LiveResult[]; states: Record<string, SourceState> }> {
  const fetcher: Fetcher = opts.fetcher ?? ((u, i) => fetch(u, i));
  const states: Record<string, SourceState> = {};
  const report = (id: LiveSourceId, st: SourceState) => {
    states[id] = st;
    opts.onSource?.(id, st);
  };
  // Results are reported as each source answers, so fast sources show immediately.
  const done: LiveResult[][] = sources.map(() => []);
  const lists = await Promise.all(
    sources.map(async (id, idx) => {
      report(id, { status: 'loading', count: 0 });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 25000);
      opts.signal?.addEventListener('abort', () => ctrl.abort());
      try {
        const r = await SEARCHERS[id](q, fetcher, ctrl.signal);
        report(id, { status: 'ok', count: r.length });
        done[idx] = r;
        if (!opts.signal?.aborted) opts.onPartial?.(mergeResults(done));
        return r;
      } catch (e) {
        const msg = ctrl.signal.aborted ? 'timed out or cancelled' : e instanceof Error ? e.message : 'failed';
        report(id, { status: 'error', count: 0, error: msg });
        return [];
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return { results: mergeResults(lists), states };
}
