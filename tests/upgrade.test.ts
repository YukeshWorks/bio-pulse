/**
 * Regression tests for the issues found in the 19 Nov 2026 audit of the live site.
 * Inputs are synthetic but reproduce each observed failure mode.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../shared/categories';
import type { BioRecord } from '../shared/schema';
import { aiFailureCategory, runAi } from '../pipeline/lib/ai';
import { classifyDetailed } from '../pipeline/lib/classify';
import { contextFor } from '../pipeline/lib/enrich';
import { createMemoryLogger } from '../pipeline/lib/log';
import { capBalanced, pickTop, scoreRecord } from '../pipeline/lib/rank';
import { normalizeOfficialLink } from '../pipeline/collectors/rss';
import { runPipeline } from '../pipeline/pipeline';
import type { RawRecord } from '../pipeline/types';
import { happyRoutes, mockFetch, RUN_NOW, TEST_ENV, tempDataDir, testConfig, testHttp, text } from './helpers';

const raw = (title: string, abstract = '', over: Partial<RawRecord> = {}): RawRecord => ({
  sourceId: 'pubmed',
  sourceName: 'PubMed',
  title,
  authors: [],
  date: '2026-11-17',
  dateType: 'published',
  url: 'https://pubmed.ncbi.nlm.nih.gov/1/',
  identifiers: { pmid: '1' },
  evidence: 'PEER-REVIEWED',
  abstract,
  ...over,
});

describe('A. category relevance (observed: obesity/skeleton paper tagged Vaccines/Dx + Microbiology)', () => {
  // The live record's title and stored excerpt, plus incidental single mentions of broad words of the
  // kind that produced the mis-tags ("gut microbiota", "diagnostic biomarkers").
  const obesity = raw(
    'The impact of childhood obesity on the developing skeleton',
    'Childhood obesity is an increasingly prevalent global health concern associated with significant metabolic, endocrine, and skeletal consequences. During critical periods of growth and peak bone mineralisation, excessive adiposity may impair skeletal development by disrupting bone formation and remodeling. Alterations in the gut microbiota and candidate diagnostic biomarkers of bone health are discussed.',
  );

  it('does not assign Vaccines/Dx or Microbiology from single broad-word mentions', () => {
    const r = classifyDetailed(obesity);
    expect(r.categories).not.toContain('vaccines-diagnostics');
    expect(r.categories).not.toContain('microbiology');
    expect(r.categories).toEqual([]); // out of biotech scope -> rejected, not mislabelled
  });

  it('still classifies genuine records with high confidence and explains the match', () => {
    const r = classifyDetailed(raw('A CRISPR base editor corrects a liver gene in primates', 'We developed an adenine base editor delivered with lipid nanoparticles.'));
    expect(r.classification?.primary).toBe('crispr-genetic-engineering');
    expect(r.classification?.confidence).toBe('high');
    expect(r.classification?.matched['crispr-genetic-engineering'].terms).toEqual(expect.arrayContaining(['crispr', 'base edit']));
  });

  it('requires two broad mentions or one specific term for a category', () => {
    expect(classifyDetailed(raw('Bone growth in adolescents', 'A microbiome survey.')).categories).toEqual([]);
    expect(classifyDetailed(raw('Bone growth in adolescents', 'Antimicrobial peptides were tested.')).categories).toEqual([]);
    expect(classifyDetailed(raw('Antimicrobial peptides against bone infection', '')).categories).toContain('microbiology');
  });

  it('has broad terms that cannot qualify a record alone, for every category that defines them', () => {
    for (const c of CATEGORIES) {
      for (const p of c.broad) {
        const word = p.source.replace(/\\b|\\|\(|\)|\?|\[|\]|\^|\$|-|\|/g, ' ').split(/\s+/).filter((w) => /^[a-z]{4,}$/i.test(w))[0];
        if (!word) continue;
        const r = classifyDetailed(raw('Routine hospital staffing report', `This text mentions ${word} once.`));
        expect(r.categories, `${c.id} broad term ${p} qualified alone`).not.toContain(c.id);
      }
    }
  });

  it('withholds category-specific context when classification confidence is low', () => {
    const low = contextFor(['vaccines-diagnostics'], { primary: 'vaccines-diagnostics', confidence: 'low', method: 'x', matched: {} });
    expect(low.text).not.toMatch(/Vaccines/);
    expect(low.text).toMatch(/only weakly/);
    const ok = contextFor(['vaccines-diagnostics'], { primary: 'vaccines-diagnostics', confidence: 'high', method: 'x', matched: { 'vaccines-diagnostics': { score: 4, terms: ['vaccine'] } } });
    expect(ok.text).toMatch(/Vaccines & diagnostics; matched: vaccine/);
  });

  it('never features or promotes low-confidence records', () => {
    const base = { evidence: 'PEER-REVIEWED' as const, date: '2026-11-17', categories: ['microbiology'], alsoIndexedIn: [], summary: { text: 'x', basis: 'source' as const } };
    expect(scoreRecord({ ...base, classification: { primary: 'microbiology', confidence: 'low', method: 'x', matched: {} } }, '2026-11-18')).toBeLessThan(scoreRecord(base, '2026-11-18'));
    const rec = (id: string, confidence: 'low' | 'high', score: number) => ({ id, score, evidence: 'PEER-REVIEWED', categories: [id], verification: { urlCheck: 'ok' }, classification: { primary: id, confidence, method: 'x', matched: {} } }) as unknown as BioRecord;
    expect(pickTop([rec('a', 'low', 9), rec('b', 'high', 1)], 3, true).map((r) => r.id)).toEqual(['b']);
  });
});

describe('C. source coverage', () => {
  it('reserves part of the daily cap for preprints and trials instead of cutting them all', () => {
    const recs = [
      ...Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, evidence: 'PEER-REVIEWED' as const, score: 4 })),
      ...Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, evidence: 'PREPRINT' as const, score: 2 })),
      ...Array.from({ length: 5 }, (_, i) => ({ id: `t${i}`, evidence: 'CLINICAL TRIAL' as const, score: 2.5 })),
    ];
    const { kept, dropped } = capBalanced(recs, 200);
    expect(kept).toHaveLength(200);
    expect(dropped).toHaveLength(205);
    expect(kept.filter((r) => r.evidence === 'PREPRINT')).toHaveLength(50);
    expect(kept.filter((r) => r.evidence === 'CLINICAL TRIAL')).toHaveLength(5);
    expect(kept.filter((r) => r.evidence === 'PEER-REVIEWED')).toHaveLength(145);
  });

  it('upgrades http links only on the regulator’s own official host', () => {
    expect(normalizeOfficialLink('http://www.fda.gov/news/x', 'https://www.fda.gov/rss.xml', 'fda')).toBe('https://www.fda.gov/news/x');
    expect(normalizeOfficialLink('/news/y', 'https://www.fda.gov/rss.xml', 'fda')).toBe('https://www.fda.gov/news/y');
    expect(normalizeOfficialLink('http://evil.example.com/x', 'https://www.fda.gov/rss.xml', 'fda')).toBe('http://evil.example.com/x');
  });

  it('accepts FDA items published with http:// links (observed: 11 fetched, 9 rejected as non-https)', async () => {
    const dir = await tempDataDir();
    const httpFeed = `<rss version="2.0"><channel><title>FDA</title><item><title>FDA approves a new CAR-T cell therapy for lymphoma</title><link>http://www.fda.gov/news-events/press-announcements/test-cart</link><description>The FDA approved a CAR-T cell immunotherapy.</description><pubDate>Tue, 17 Nov 2026 10:00:00 EST</pubDate></item></channel></rss>`;
    const res = await runPipeline({ config: testConfig(dir), http: testHttp(mockFetch(happyRoutes({ fda: () => text(httpFeed) }))), log: createMemoryLogger(), env: TEST_ENV, now: RUN_NOW });
    const fda = res.dataset!.records.filter((r) => r.source.id === 'fda');
    expect(fda).toHaveLength(1);
    expect(fda[0].url).toBe('https://www.fda.gov/news-events/press-announcements/test-cart');
  });

  it('reports per-source rejection reasons and capped counts', async () => {
    const dir = await tempDataDir();
    const res = await runPipeline({ config: testConfig(dir, { maxRecordsPerDay: 3 }), http: testHttp(mockFetch(happyRoutes())), log: createMemoryLogger(), env: TEST_ENV, now: RUN_NOW });
    const ds = res.dataset!;
    const fda = ds.sources.find((s) => s.id === 'fda')!;
    expect(fda.rejectReasons?.['url-host-not-allowed']).toBe(1);
    const capped = ds.sources.reduce((a, s) => a + (s.capped ?? 0), 0);
    expect(capped).toBe(ds.rejected.reasons['daily-cap']);
  });
});

describe('B. verification honesty', () => {
  it('reports metadata validation and live link checks separately, and the counts reconcile', async () => {
    const dir = await tempDataDir();
    const res = await runPipeline({
      config: testConfig(dir, { verifyUrls: true, verifyUrlLimit: 2, requireVerifiedFeatured: false }),
      http: testHttp(mockFetch(happyRoutes())),
      urlHttp: testHttp(mockFetch([{ match: () => true, respond: () => new Response('', { status: 200 }) }])),
      log: createMemoryLogger(),
      env: TEST_ENV,
      now: RUN_NOW,
    });
    const v = res.dataset!.verificationSummary!;
    expect(v.linkOk).toBe(2);
    expect(v.linkOk + v.linkRestricted + v.linkFailed + v.linkNotChecked).toBe(v.published);
    expect(v.published).toBe(res.dataset!.records.length);
    expect(v.metadataValidated).toBeGreaterThanOrEqual(v.published);
    expect(v.collected).toBeGreaterThanOrEqual(v.metadataValidated);
    expect(res.message).toMatch(/metadata-validated records \(2 links live-checked\)/);
    expect(res.message).not.toMatch(/\bverified records/);
    expect(res.dataset!.briefing.sentence).not.toMatch(/verified/);
  });

  it('writes a reproducibility manifest without secrets', async () => {
    const dir = await tempDataDir();
    const res = await runPipeline({ config: testConfig(dir), http: testHttp(mockFetch(happyRoutes())), log: createMemoryLogger(), env: { ...TEST_ENV, GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '42', ANTHROPIC_API_KEY: 'sk-secret' }, now: RUN_NOW });
    expect(res.dataset!.run).toMatchObject({ pipelineVersion: expect.any(String), commit: 'abc123', workflowRun: '42/1' });
    expect(JSON.stringify(res.dataset)).not.toContain('sk-secret');
    expect(JSON.stringify(res.dataset)).not.toContain(TEST_ENV.EPO_OPS_SECRET === 's' ? 'EPO_OPS_SECRET' : '');
  });
});

describe('E. AI status transparency', () => {
  const top = [{ id: 'pmid-1', title: 'A CRISPR study', evidence: 'PEER-REVIEWED', date: '2026-11-17', source: { id: 'pubmed', name: 'PubMed' }, authors: [], identifiers: {}, categories: ['crispr-genetic-engineering'] }] as unknown as BioRecord[];
  const cfg = { enabled: true, model: 'claude-opus-5-5', effort: 'medium' as const, maxRecords: 5 };

  it('reports disabled, failed, fallback and partial states explicitly', async () => {
    expect((await runAi({ ...cfg, enabled: false }, top, top, new Map())).status).toBe('disabled');
    expect((await runAi(cfg, [], [], new Map())).status).toBe('not-needed');
    const failed = await runAi(cfg, top, top, new Map(), async () => {
      throw new Error('boom: secret details');
    });
    expect(failed).toMatchObject({ status: 'failed', failure: 'unexpected-error', used: false });
    expect(failed.note).not.toContain('secret details');
    expect((await runAi(cfg, top, top, new Map(), async () => null)).status).toBe('fallback');
    const allBad = await runAi(cfg, top, top, new Map(), async () => ({ briefing: { sentence: 'short', cited_record_ids: ['x'] }, discoveries: [], summaries: [] }));
    expect(allBad.status).toBe('fallback');
  });

  it('maps SDK errors to coarse categories', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    expect(aiFailureCategory(new Anthropic.APIConnectionTimeoutError())).toBe('timeout');
    expect(aiFailureCategory(new Error('x'))).toBe('unexpected-error');
  });
});
