import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DailyDatasetSchema, RunStatusSchema, SourcesFileSchema, ArchiveIndexSchema, type BioRecord } from '../shared/schema';
import { runAi, introducesUnknownIdentifiers, validateAiOutput, type AiCaller } from '../pipeline/lib/ai';
import { deterministicBriefing } from '../pipeline/lib/briefing';
import { createMemoryLogger } from '../pipeline/lib/log';
import { wordCount } from '../pipeline/lib/text';
import { runPipeline } from '../pipeline/pipeline';
import { failingRoutes, happyRoutes, json, mockFetch, RUN_NOW, TEST_ENV, tempDataDir, testConfig, testHttp } from './helpers';

async function run(dataDir: string, routes = happyRoutes(), extra: Partial<Parameters<typeof runPipeline>[0]> = {}) {
  return runPipeline({ config: testConfig(dataDir), http: testHttp(mockFetch(routes)), log: createMemoryLogger(), env: TEST_ENV, now: RUN_NOW, ...extra });
}
const readJson = async (f: string) => JSON.parse(await fs.readFile(f, 'utf8'));

describe('daily pipeline (integration, offline)', () => {
  it('ingests, validates, deduplicates and publishes schema-valid data', async () => {
    const dir = await tempDataDir();
    const res = await run(dir);
    expect(res.outcome).toBe('published');
    const latest = DailyDatasetSchema.parse(await readJson(path.join(dir, 'latest.json')));
    expect(latest.date).toBe('2026-11-18');
    expect(latest.timezone).toBe('Asia/Kolkata');
    expect(latest.dataset).toBe('live');

    // PubMed + Europe PMC copies of 99000001 merged into one record
    const crispr = latest.records.filter((r) => r.identifiers.pmid === '99000001');
    expect(crispr).toHaveLength(1);
    expect(crispr[0].alsoIndexedIn.map((a) => a.id)).toContain('europepmc');

    // Evidence integrity
    for (const r of latest.records) {
      if (r.source.id === 'biorxiv' || r.source.id === 'medrxiv') expect(r.evidence).toBe('PREPRINT');
      if (r.source.id === 'epo') expect(r.evidence).toBe('PATENT APPLICATION');
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.limitations.length).toBeGreaterThan(0);
    }
    // Off-site and non-biotech items rejected
    expect(latest.records.some((r) => r.url.includes('evil.example.com'))).toBe(false);
    expect(latest.records.some((r) => /tobacco/i.test(r.title))).toBe(false);
    expect(latest.records.some((r) => /zebra finches/i.test(r.title))).toBe(false);
    expect(latest.rejected.reasons['url-host-not-allowed']).toBe(1);

    // Briefing and discoveries reference real records only
    expect(latest.briefing.sentence).not.toBeNull();
    expect(latest.briefing.wordCount).toBeGreaterThanOrEqual(20);
    expect(latest.briefing.wordCount).toBeLessThanOrEqual(30);
    const ids = new Set(latest.records.map((r) => r.id));
    expect(latest.briefing.citations.every((c) => ids.has(c))).toBe(true);
    expect(latest.topDiscoveries).toHaveLength(3);
    expect(new Set(latest.topDiscoveries.map((d) => d.recordId)).size).toBe(3);

    // Archive + metadata files
    DailyDatasetSchema.parse(await readJson(path.join(dir, 'archive', '2026-11-18.json')));
    const index = ArchiveIndexSchema.parse(await readJson(path.join(dir, 'archive', 'index.json')));
    expect(index.days[0].date).toBe('2026-11-18');
    const status = RunStatusSchema.parse(await readJson(path.join(dir, 'status.json')));
    expect(status.lastSuccessfulDate).toBe('2026-11-18');
    const sources = SourcesFileSchema.parse(await readJson(path.join(dir, 'sources.json')));
    expect(sources.sources.find((s) => s.id === 'company')?.enabled).toBe(false);
    expect(latest.sources.find((s) => s.id === 'company')?.status).toBe('skipped');
  });

  it('preserves the previous dataset when every source fails', async () => {
    const dir = await tempDataDir();
    await run(dir);
    const before = await fs.readFile(path.join(dir, 'latest.json'), 'utf8');
    const res = await run(dir, failingRoutes(), { now: new Date('2026-11-19T01:30:00Z') });
    expect(res.outcome).toBe('preserved-previous');
    expect(await fs.readFile(path.join(dir, 'latest.json'), 'utf8')).toBe(before);
    await expect(fs.access(path.join(dir, 'archive', '2026-11-19.json'))).rejects.toThrow();
    const status = RunStatusSchema.parse(await readJson(path.join(dir, 'status.json')));
    expect(status.outcome).toBe('preserved-previous');
    expect(status.lastSuccessfulDate).toBe('2026-11-18');
    expect(status.lastAttemptDate).toBe('2026-11-19');
    expect(status.sources.filter((s) => s.status === 'failed').length).toBeGreaterThanOrEqual(6);
    expect(status.history).toHaveLength(2);
  });

  it('does not publish an empty day when some sources failed', async () => {
    const dir = await tempDataDir();
    await run(dir);
    const before = await fs.readFile(path.join(dir, 'latest.json'), 'utf8');
    const empty = () => json({ esearchresult: { idlist: [] }, resultList: { result: [] }, studies: [], messages: [{ status: 'no posts found' }], collection: [] });
    const routes = happyRoutes({ pubmed: empty, epmc: empty, biorxiv: empty, ctgov: empty, fda: () => new Response('', { status: 500 }), ema: () => new Response('', { status: 500 }), epo: () => new Response('', { status: 404 }) });
    const res = await run(dir, routes, { now: new Date('2026-11-19T01:30:00Z') });
    expect(res.outcome).toBe('preserved-previous');
    expect(await fs.readFile(path.join(dir, 'latest.json'), 'utf8')).toBe(before);
  });

  it('publishes an explicit "no qualifying updates" day when all sources respond with nothing', async () => {
    const dir = await tempDataDir();
    const empty = () => json({ esearchresult: { idlist: [] }, resultList: { result: [] }, studies: [], messages: [{ status: 'no posts found' }], collection: [] });
    const emptyRss = () => new Response('<rss version="2.0"><channel><title>t</title></channel></rss>', { status: 200 });
    const routes = happyRoutes({ pubmed: empty, epmc: empty, biorxiv: empty, ctgov: empty, fda: emptyRss, ema: emptyRss, epo: () => new Response('', { status: 404 }) });
    const res = await run(dir, routes);
    expect(res.outcome).toBe('published-empty');
    const latest = DailyDatasetSchema.parse(await readJson(path.join(dir, 'latest.json')));
    expect(latest.records).toEqual([]);
    expect(latest.briefing.sentence).toBeNull();
    expect(latest.briefing.method).toBe('none');
    expect(latest.topDiscoveries).toEqual([]);
    expect(latest.notice).toMatch(/No qualifying updates/);
  });

  it('suppresses records already published on previous days', async () => {
    const dir = await tempDataDir();
    await run(dir);
    const res = await run(dir, happyRoutes(), { now: new Date('2026-11-19T01:30:00Z') });
    expect(res.outcome).toBe('published-empty');
    expect(res.dataset?.rejected.reasons['already-published']).toBeGreaterThan(0);
  });

  it('carries over same-day records for a source that fails on a re-run', async () => {
    const dir = await tempDataDir();
    const first = await run(dir);
    const trials = first.dataset!.records.filter((r) => r.evidence === 'CLINICAL TRIAL').length;
    expect(trials).toBe(1);
    const res = await run(dir, happyRoutes({ ctgov: () => new Response('', { status: 503 }) }), { now: new Date('2026-11-18T05:00:00Z') });
    expect(res.outcome).toBe('published');
    expect(res.dataset!.records.filter((r) => r.evidence === 'CLINICAL TRIAL')).toHaveLength(1);
    expect(res.dataset!.sources.find((s) => s.id === 'clinicaltrials')?.status).toBe('failed');
  });

  it('drops records whose original URL returns 404 and features only verified links', async () => {
    const dir = await tempDataDir();
    const urlFetch = mockFetch([
      { match: (u) => u.includes('99000002'), respond: () => new Response('', { status: 404 }) },
      { match: () => true, respond: () => new Response('', { status: 200 }) },
    ]);
    const res = await runPipeline({
      config: testConfig(dir, { verifyUrls: true, requireVerifiedFeatured: true }),
      http: testHttp(mockFetch(happyRoutes())),
      urlHttp: testHttp(urlFetch),
      log: createMemoryLogger(),
      env: TEST_ENV,
      now: RUN_NOW,
    });
    expect(res.dataset!.records.some((r) => r.identifiers.pmid === '99000002')).toBe(false);
    expect(res.dataset!.rejected.reasons['url-not-found']).toBe(1);
    const byId = new Map(res.dataset!.records.map((r) => [r.id, r]));
    for (const d of res.dataset!.topDiscoveries) expect(byId.get(d.recordId)!.verification.urlCheck).toBe('ok');
  });

  it('never writes demonstration data and keeps fixtures out of production paths', async () => {
    const dir = await tempDataDir();
    const res = await run(dir);
    expect(res.dataset?.dataset).toBe('live');
  });
});

const rec = (i: number, over: Partial<BioRecord> = {}): BioRecord => ({
  id: `pmid-${i}`,
  title: `An engineered CRISPR system number ${i} for precise genome editing in human primary cells and organoids`,
  authors: ['A. Author'],
  date: '2026-11-17',
  dateType: 'published',
  source: { id: 'pubmed', name: 'PubMed' },
  alsoIndexedIn: [],
  url: `https://pubmed.ncbi.nlm.nih.gov/${i}/`,
  identifiers: { pmid: String(i) },
  categories: ['crispr-genetic-engineering'],
  evidence: 'PEER-REVIEWED',
  evidenceNote: '',
  summary: { text: 'x', basis: 'source' },
  whyItMatters: { text: 'x', basis: 'template' },
  limitations: [{ text: 'x', basis: 'template' }],
  verification: { urlFormatValid: true, urlHostAllowed: true, urlCheck: 'ok', identifierConsistent: true, dateValid: true, checks: [] },
  score: 3,
  ...over,
});

describe('one-sentence briefing', () => {
  it('stays within 20–30 words for short, long and single-record inputs', () => {
    const longTitle = rec(2, { title: Array.from({ length: 40 }, () => 'verylongword').join(' '), categories: ['stem-cells-regenerative'] });
    const cases: [BioRecord[], BioRecord[]][] = [
      [[rec(1), rec(2)], [rec(1), rec(2)]],
      [[rec(1), longTitle], [longTitle, rec(1)]],
      [[rec(1)], [rec(1)]],
      [[rec(1, { title: 'Short CRISPR study' })], [rec(1, { title: 'Short CRISPR study' })]],
      [Array.from({ length: 150 }, (_, i) => rec(i + 1, { evidence: 'PREPRINT' })), [rec(1, { evidence: 'PREPRINT' }), rec(2, { evidence: 'PATENT APPLICATION' })]],
    ];
    for (const [all, top] of cases) {
      const b = deterministicBriefing(all, top);
      expect(b.wordCount, b.sentence ?? '').toBeGreaterThanOrEqual(20);
      expect(b.wordCount, b.sentence ?? '').toBeLessThanOrEqual(30);
      expect(b.wordCount).toBe(wordCount(b.sentence!));
      expect(b.citations.length).toBeGreaterThan(0);
    }
  });
  it('flags preprints and patents in the sentence', () => {
    const p = deterministicBriefing([rec(1)], [rec(1, { evidence: 'PREPRINT' })]);
    expect(p.sentence).toMatch(/preprint not yet peer-reviewed/);
    const pat = deterministicBriefing([rec(2)], [rec(2, { evidence: 'PATENT APPLICATION' })]);
    expect(pat.sentence).toMatch(/patent filing, which does not prove it works/);
    expect(pat.sentence).not.toMatch(/peer-reviewed study/);
  });
  it('returns no headline when there are no records', () => {
    expect(deterministicBriefing([], [])).toMatchObject({ sentence: null, citations: [], method: 'none' });
  });
});

describe('optional AI adapter', () => {
  const top = [rec(1), rec(2), rec(3)];
  const abstracts = new Map([['pmid-1', 'We developed a CRISPR tool. DOI 10.5555/known.']]);
  const aiConfig = { enabled: true, model: 'claude-opus-5-5', effort: 'medium' as const, maxRecords: 20 };
  const good = {
    briefing: { sentence: 'Peer-reviewed CRISPR studies dominated today, including an engineered genome-editing system for primary human cells, while follow-up validation in larger models remains necessary.', cited_record_ids: ['pmid-1', 'pmid-2'] },
    discoveries: top.map((t) => ({ record_id: t.id, what_was_developed: 'An engineered CRISPR system.', what_is_new: 'Not stated in the source.', why_important: 'Interpretation: may improve editing.', limitations: 'Abstract only.', what_next: 'Interpretation: replication.' })),
    summaries: [{ record_id: 'pmid-1', summary: 'The authors developed a CRISPR tool.', why_it_matters: 'Interpretation: could aid research.' }],
  };

  it('is disabled without an API key and falls back to deterministic text', async () => {
    const r = await runAi({ ...aiConfig, enabled: false }, top, top, abstracts);
    expect(r.used).toBe(false);
    expect(r.note).toMatch(/ANTHROPIC_API_KEY/);
  });
  it('accepts validated AI output', async () => {
    const caller: AiCaller = async () => good;
    const r = await runAi(aiConfig, top, top, abstracts, caller);
    expect(r.used).toBe(true);
    expect(r.briefing?.method).toBe('ai');
    expect(r.analyses.get('pmid-1')?.whatIsNew.basis).toBe('unavailable');
    expect(r.analyses.get('pmid-1')?.whyImportant.basis).toBe('ai');
    expect(r.summaries.get('pmid-1')?.summary.basis).toBe('ai');
  });
  it('rejects fabricated identifiers, URLs, bad citations and wrong length', () => {
    const input = top.map((t) => ({ id: t.id, title: t.title, evidence: t.evidence, date: t.date, source: 'PubMed', authorsOrOrganization: 'x', identifiers: t.identifiers, categories: t.categories, abstract: abstracts.get(t.id) }));
    const bad = {
      briefing: { sentence: 'Too short to pass.', cited_record_ids: ['pmid-999'] },
      discoveries: [{ ...good.discoveries[0], what_is_new: 'See doi 10.9999/fabricated for details.' }, { ...good.discoveries[1], what_next: 'Visit https://example.com' }, { ...good.discoveries[2], record_id: 'pmid-404' }],
      summaries: [{ record_id: 'pmid-1', summary: 'Trial NCT12345678 started.', why_it_matters: 'x' }],
    };
    const v = validateAiOutput(bad, input, top.map((t) => t.id));
    expect(v.briefing).toBeUndefined();
    expect(v.analyses.size).toBe(0);
    expect(v.summaries.size).toBe(0);
    expect(v.rejected.length).toBeGreaterThanOrEqual(5);
    expect(introducesUnknownIdentifiers('cites 10.5555/known.', JSON.stringify(input))).toBe(false);
  });
  it('falls back when the API call throws or is refused', async () => {
    const throws: AiCaller = async () => {
      throw new Error('529 overloaded');
    };
    expect((await runAi(aiConfig, top, top, abstracts, throws)).used).toBe(false);
    const refused: AiCaller = async () => null;
    expect((await runAi(aiConfig, top, top, abstracts, refused)).note).toMatch(/deterministic/);
  });
  it('is wired into the pipeline and its briefing replaces the deterministic one only when valid', async () => {
    const dir = await tempDataDir();
    const caller: AiCaller = async (_s, user) => {
      const ids = [...user.matchAll(/"id":"([^"]+)"/g)].map((m) => m[1]);
      return { ...good, briefing: { ...good.briefing, cited_record_ids: [ids[0]] }, discoveries: [], summaries: [] };
    };
    const res = await runPipeline({
      config: { ...testConfig(dir), ai: { ...aiConfig } },
      http: testHttp(mockFetch(happyRoutes())),
      log: createMemoryLogger(),
      env: TEST_ENV,
      now: RUN_NOW,
      aiCaller: caller,
    });
    expect(res.dataset!.briefing.method).toBe('ai');
    expect(res.dataset!.ai.used).toBe(true);
    expect(res.dataset!.topDiscoveries.every((d) => d.analysis.whatHappened.basis === 'metadata')).toBe(true);
  });
});
