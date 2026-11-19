/** Live search tests with SYNTHETIC API responses (fake IDs; 10.5555 is a reserved test DOI prefix). */
import { describe, expect, it } from 'vitest';
import { mapEuropePmc, mapOpenAlex, mapPubmedSummary, mapTrials, mergeResults, searchEverywhere, type Fetcher } from '../src/lib/liveSearch';

export const EPMC = { resultList: { result: [
  { id: '99100001', source: 'MED', pmid: '99100001', doi: '10.5555/LIVE.1', title: 'CRISPR base editing in <i>vivo</i>.', authorString: 'Rivera A, Okafor C.', journalTitle: 'Test Journal', firstPublicationDate: '2026-11-10' },
  { id: 'PPR900001', source: 'PPR', doi: '10.5555/live.pre', title: 'A preprint on base editing', authorString: 'Chen L.', firstPublicationDate: '2026-11-12' },
  { id: 'EP4000001', source: 'PAT', title: 'Patent on a nuclease', firstPublicationDate: '2026-11-01' },
] } };
export const PM_SEARCH = { esearchresult: { idlist: ['99100001', '99100002'] } };
export const PM_SUMMARY = { result: { uids: ['99100001', '99100002'],
  '99100001': { uid: '99100001', title: 'CRISPR base editing in vivo.', authors: [{ name: 'Rivera A' }], fulljournalname: 'Test Journal', sortpubdate: '2026/11/10 00:00', pubtype: ['Journal Article'], articleids: [{ idtype: 'doi', value: '10.5555/live.1' }] },
  '99100002': { uid: '99100002', title: 'A PubMed-indexed preprint', authors: [], sortpubdate: '2026/11/11 00:00', pubtype: ['Preprint'], articleids: [] },
} };
export const CT = { studies: [{ protocolSection: { identificationModule: { nctId: 'NCT09999911', briefTitle: 'Base editing trial (TEST)' }, statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-11-05' } }, designModule: { phases: ['PHASE1'] }, conditionsModule: { conditions: ['Hypercholesterolemia'] }, sponsorCollaboratorsModule: { leadSponsor: { name: 'Test Bio' } } } }] };
export const OA = { results: [
  { id: 'https://openalex.org/W9990001', doi: 'https://doi.org/10.5555/live.1', display_name: 'CRISPR base editing in vivo', publication_date: '2026-11-10', type: 'article', primary_location: { source: { type: 'journal', display_name: 'Test Journal' } }, authorships: [] },
  { id: 'https://openalex.org/W9990002', doi: null, display_name: 'An OpenAlex-only journal article', publication_date: '2026-10-01', type: 'article', primary_location: { source: { type: 'journal', display_name: 'Other Journal' } }, authorships: [{ author: { display_name: 'K. Lee' } }] },
  { id: 'javascript:alert(1)', doi: null, display_name: 'Bad id must be dropped', type: 'article' },
] };

describe('source mappers', () => {
  it('Europe PMC: journal = peer-reviewed, PPR = preprint, PAT = patent; official links', () => {
    const r = mapEuropePmc(EPMC);
    expect(r.map((x) => x.kind)).toEqual(['peer-reviewed', 'preprint', 'patent']);
    expect(r[0]).toMatchObject({ title: 'CRISPR base editing in vivo', doi: '10.5555/live.1', pmid: '99100001', url: 'https://europepmc.org/article/MED/99100001' });
  });
  it('PubMed: preprint publication type is never labelled peer-reviewed', () => {
    const r = mapPubmedSummary(PM_SUMMARY);
    expect(r.map((x) => x.kind)).toEqual(['peer-reviewed', 'preprint']);
    expect(r[0].url).toBe('https://pubmed.ncbi.nlm.nih.gov/99100001/');
  });
  it('ClinicalTrials.gov: registrations with status and phase', () => {
    const [t] = mapTrials(CT);
    expect(t).toMatchObject({ kind: 'trial', nct: 'NCT09999911', url: 'https://clinicaltrials.gov/study/NCT09999911' });
    expect(t.extra).toContain('Recruiting');
  });
  it('OpenAlex: journal articles carry no peer-review claim; unsafe ids are dropped', () => {
    const r = mapOpenAlex(OA);
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.kind === 'journal-article')).toBe(true);
    expect(r[1].url).toBe('https://openalex.org/W9990002');
    expect(r.every((x) => x.url.startsWith('https://'))).toBe(true);
  });
  it('handles empty and malformed responses', () => {
    expect(mapEuropePmc({})).toEqual([]);
    expect(mapPubmedSummary(null)).toEqual([]);
    expect(mapTrials({ studies: [{}] })).toEqual([]);
    expect(mapOpenAlex({ results: 'x' as unknown as [] })).toEqual([]);
  });
});

describe('merging across sources', () => {
  it('merges the same article from Europe PMC, PubMed and OpenAlex by DOI/PMID', () => {
    const merged = mergeResults([mapEuropePmc(EPMC), mapPubmedSummary(PM_SUMMARY), mapOpenAlex(OA)]);
    const art = merged.filter((r) => r.doi === '10.5555/live.1');
    expect(art).toHaveLength(1);
    expect(art[0].source).toBe('europepmc');
    expect(art[0].alsoIn.map((a) => a.source).sort()).toEqual(['openalex', 'pubmed']);
    expect(new Set(merged.map((r) => r.key)).size).toBe(merged.length);
  });
});

function routes(fail: string[] = []): Fetcher {
  return async (url) => {
    const host = new URL(url).host;
    if (fail.some((f) => host.includes(f))) return new Response('down', { status: 503 });
    if (url.includes('europepmc')) return Response.json(EPMC);
    if (url.includes('esearch')) return Response.json(PM_SEARCH);
    if (url.includes('esummary')) return Response.json(PM_SUMMARY);
    if (url.includes('clinicaltrials')) return Response.json(CT);
    if (url.includes('openalex')) return Response.json(OA);
    return new Response('', { status: 404 });
  };
}

describe('searchEverywhere', () => {
  it('queries all sources and merges results', async () => {
    const { results, states } = await searchEverywhere('base editing', ['europepmc', 'pubmed', 'clinicaltrials', 'openalex'], { fetcher: routes() });
    expect(Object.values(states).every((s) => s.status === 'ok')).toBe(true);
    expect(results.some((r) => r.kind === 'trial')).toBe(true);
    expect(results.some((r) => r.kind === 'preprint')).toBe(true);
  });
  it('keeps results from working sources when one fails', async () => {
    const { results, states } = await searchEverywhere('x', ['europepmc', 'pubmed', 'clinicaltrials', 'openalex'], { fetcher: routes(['ebi.ac.uk']) });
    expect(states.europepmc).toMatchObject({ status: 'error', error: 'HTTP 503' });
    expect(states.pubmed.status).toBe('ok');
    expect(results.length).toBeGreaterThan(0);
  });
  it('sends the query URL-encoded and only to official API hosts', async () => {
    const seen: string[] = [];
    const f: Fetcher = async (u, i) => {
      seen.push(u);
      return routes()(u, i);
    };
    await searchEverywhere('CAR-T & "solid" tumors', ['europepmc', 'pubmed', 'clinicaltrials', 'openalex'], { fetcher: f });
    const hosts = new Set(seen.map((u) => new URL(u).host));
    expect([...hosts].sort()).toEqual(['api.openalex.org', 'clinicaltrials.gov', 'eutils.ncbi.nlm.nih.gov', 'www.ebi.ac.uk']);
    expect(seen.every((u) => u.startsWith('https://') && !u.includes('"solid"'))).toBe(true);
  });
  it('times out a hanging source without blocking the rest', async () => {
    const f: Fetcher = (u, i) => (u.includes('openalex') ? new Promise((_, rej) => i?.signal?.addEventListener('abort', () => rej(new Error('aborted')))) : routes()(u, i));
    const { states } = await searchEverywhere('x', ['europepmc', 'openalex'], { fetcher: f, timeoutMs: 50 });
    expect(states.openalex.status).toBe('error');
    expect(states.europepmc.status).toBe('ok');
  });
});
