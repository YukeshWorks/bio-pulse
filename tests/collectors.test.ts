import { describe, expect, it } from 'vitest';
import { clinicalTrialsCollector, mapStudy } from '../pipeline/collectors/clinicaltrials';
import { epoCollector, mapExchangeDocument, patentStatusFromKind } from '../pipeline/collectors/epo';
import { europePmcCollector, mapEuropePmcResult } from '../pipeline/collectors/europepmc';
import { biorxivCollector, medrxivCollector } from '../pipeline/collectors/preprints';
import { parsePubmedXml, pubmedCollector } from '../pipeline/collectors/pubmed';
import { emaCollector, fdaCollector, parseFeed } from '../pipeline/collectors/rss';
import { createMemoryLogger } from '../pipeline/lib/log';
import type { CollectorContext } from '../pipeline/types';
import { BIORXIV_JSON, CTGOV_JSON, EPO_JSON, EUROPEPMC_JSON, FDA_RSS, happyRoutes, json, mockFetch, PUBMED_ARTICLES, pubmedEfetchXml, RUN_DATE, RUN_NOW, testConfig, testHttp, text } from './helpers';

function ctx(routes = happyRoutes(), env: Record<string, string> = {}): CollectorContext {
  return { runDate: RUN_DATE, now: RUN_NOW, http: testHttp(mockFetch(routes)), config: testConfig('/tmp/unused'), log: createMemoryLogger(), env };
}

describe('PubMed collector', () => {
  it('parses efetch XML: titles without markup, DOI, authors, dates, evidence', () => {
    const recs = parsePubmedXml(pubmedEfetchXml(PUBMED_ARTICLES), RUN_DATE);
    expect(recs).toHaveLength(2); // editorial excluded
    const r = recs[0];
    expect(r.title).toBe('Base editing of PCSK9 in primate liver with an engineered CRISPR adenine base editor');
    expect(r.identifiers).toMatchObject({ pmid: '99000001', doi: '10.5555/test.crispr.001' });
    expect(r.authors).toEqual(['Ana Rivera', 'Chidi Okafor']);
    expect(r.organization).toBe('Test Institute of Biotechnology');
    expect(r.date).toBe('2026-11-17');
    expect(r.dateType).toBe('published');
    expect(r.evidence).toBe('PEER-REVIEWED');
    expect(r.url).toBe('https://pubmed.ncbi.nlm.nih.gov/99000001/');
  });
  it('labels PubMed-indexed preprints as PREPRINT', () => {
    const recs = parsePubmedXml(pubmedEfetchXml([{ pmid: '99000009', title: 'A preprint indexed in PubMed about CRISPR screens', types: ['Preprint'] }]), RUN_DATE);
    expect(recs[0].evidence).toBe('PREPRINT');
  });
  it('falls back to the Entrez date when the electronic date is in the future', () => {
    const recs = parsePubmedXml(pubmedEfetchXml([{ pmid: '99000010', title: 'Future dated article on gene therapy vectors', year: '2027', month: '01', day: '15' }]), RUN_DATE);
    expect(recs[0].date).toBe('2026-11-17');
    expect(recs[0].dateType).toBe('indexed');
  });
  it('handles an empty search result', async () => {
    const res = await pubmedCollector.collect(ctx(happyRoutes({ pubmed: () => json({ esearchresult: { idlist: [] } }) })));
    expect(res.records).toEqual([]);
  });
  it('throws when every search fails (source reported as failed)', async () => {
    await expect(pubmedCollector.collect(ctx(happyRoutes({ pubmed: () => new Response('', { status: 503 }) })))).rejects.toThrow(/All PubMed searches failed/);
  });
  it('sends api_key only when configured', async () => {
    const f = mockFetch(happyRoutes());
    const c = { ...ctx(), http: testHttp(f), env: { NCBI_API_KEY: 'abc' } };
    await pubmedCollector.collect(c);
    expect(f.calls.every((u) => !u.includes('eutils') || u.includes('api_key=abc'))).toBe(true);
  });
});

describe('Europe PMC collector', () => {
  it('maps journal articles and preprints with correct evidence labels', () => {
    const [med, ppr, agr] = EUROPEPMC_JSON.resultList.result.map((r) => mapEuropePmcResult(r));
    expect(med?.evidence).toBe('PEER-REVIEWED');
    expect(med?.identifiers.doi).toBe('10.5555/test.crispr.001');
    expect(ppr?.evidence).toBe('PREPRINT');
    expect(ppr?.url).toBe('https://europepmc.org/article/PPR/PPR990001');
    expect(agr).toBeNull();
  });
  it('handles empty result lists', async () => {
    const res = await europePmcCollector.collect(ctx(happyRoutes({ epmc: () => json({ resultList: { result: [] } }) })));
    expect(res.records).toEqual([]);
  });
});

describe('bioRxiv / medRxiv collectors', () => {
  it('keeps only new (v1) postings in relevant subjects, always as PREPRINT', async () => {
    const res = await biorxivCollector.collect(ctx());
    expect(res.records).toHaveLength(1);
    const r = res.records[0];
    expect(r.evidence).toBe('PREPRINT');
    expect(r.url).toBe('https://www.biorxiv.org/content/10.5555/test.biorxiv.001v1');
    expect(r.authors).toEqual(['J. Smith', 'R. K. Patel']);
    expect(BIORXIV_JSON.collection).toHaveLength(3);
  });
  it('treats "no posts found" as an empty (not failed) response', async () => {
    const res = await medrxivCollector.collect(ctx());
    expect(res.records).toEqual([]);
  });
  it('fails on unexpected API status', async () => {
    await expect(biorxivCollector.collect(ctx(happyRoutes({ biorxiv: () => json({ messages: [{ status: 'internal error' }], collection: [] }) })))).rejects.toThrow(/status/);
  });
});

describe('ClinicalTrials.gov collector', () => {
  it('maps v2 studies and keeps only genetic/biological interventions', async () => {
    const res = await clinicalTrialsCollector.collect(ctx());
    expect(res.records).toHaveLength(1);
    const r = res.records[0];
    expect(r.identifiers.nct).toBe('NCT09999901');
    expect(r.url).toBe('https://clinicaltrials.gov/study/NCT09999901');
    expect(r.trial).toMatchObject({ phase: ['Phase 1'], status: 'Not yet recruiting', sponsor: 'Test Cell Therapeutics' });
    expect(r.evidence).toBe('CLINICAL TRIAL');
    expect(mapStudy(CTGOV_JSON.studies[1])?.trial?.interventionTypes).toEqual(['BEHAVIORAL']);
  });
});

describe('Regulatory RSS collectors', () => {
  it('parses RSS 2.0 and Atom feeds', () => {
    expect(parseFeed(FDA_RSS)).toHaveLength(3);
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom item</title><link href="https://www.ema.europa.eu/en/a"/><updated>2026-11-17T10:00:00Z</updated><summary>Sum</summary></entry></feed>`;
    expect(parseFeed(atom)[0]).toMatchObject({ title: 'Atom item', link: 'https://www.ema.europa.eu/en/a', date: '2026-11-17' });
  });
  it('labels FDA and EMA items as REGULATORY UPDATE', async () => {
    const fda = await fdaCollector.collect(ctx());
    expect(fda.records.every((r) => r.evidence === 'REGULATORY UPDATE')).toBe(true);
    const ema = await emaCollector.collect(ctx());
    expect(ema.records[0].organization).toBe('European Medicines Agency');
  });
  it('reports a failure only when every feed fails', async () => {
    const partial = await fdaCollector.collect(ctx(happyRoutes({ fda: (u) => (u.includes('biologics') ? new Response('', { status: 500 }) : text(FDA_RSS)) })));
    expect(partial.records.length).toBe(3);
    expect(partial.warnings.length).toBe(1);
    await expect(fdaCollector.collect(ctx(happyRoutes({ fda: () => new Response('', { status: 500 }) })))).rejects.toThrow(/All U.S. FDA feeds failed/);
  });
});

describe('EPO OPS collector', () => {
  it('is skipped without credentials', () => {
    expect(epoCollector.skipReason(ctx())).toMatch(/credentials/);
  });
  it('authenticates and maps exchange documents', async () => {
    const res = await epoCollector.collect(ctx(happyRoutes(), { EPO_OPS_KEY: 'k', EPO_OPS_SECRET: 's' }));
    expect(res.records).toHaveLength(1);
    const r = res.records[0];
    expect(r.identifiers.patentNumber).toBe('EP4999001A1');
    expect(r.date).toBe('2026-11-11');
    expect(r.patent).toMatchObject({ status: 'application', applicants: ['TEST BIO GMBH'] });
    expect(r.url).toBe('https://worldwide.espacenet.com/patent/search?q=pn%3DEP4999001A1');
    expect(mapExchangeDocument(EPO_JSON['ops:world-patent-data']['ops:biblio-search']['ops:search-result']['exchange-documents'][0]['exchange-document'])?.evidence).toBe('PATENT APPLICATION');
  });
  it('distinguishes applications from grants', () => {
    expect(patentStatusFromKind('EP', 'A1')).toBe('application');
    expect(patentStatusFromKind('EP', 'B1')).toBe('granted');
    expect(patentStatusFromKind('WO', 'A1')).toBe('application');
    expect(patentStatusFromKind('EP', 'U')).toBe('unknown');
  });
  it('treats HTTP 404 (no hits) as an empty result', async () => {
    const res = await epoCollector.collect(ctx(happyRoutes({ epo: () => new Response('', { status: 404 }) }), { EPO_OPS_KEY: 'k', EPO_OPS_SECRET: 's' }));
    expect(res.records).toEqual([]);
  });
});
