import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { ArchiveIndexSchema, DailyDatasetSchema, RunStatusSchema, SourcesFileSchema } from '../shared/schema';
import { CATEGORIES } from '../shared/categories';
import { loadConfig } from '../pipeline/config';

describe('JSON schema validation', () => {
  it('demo fixtures are schema-valid and explicitly labelled as demonstration data', () => {
    const latest = DailyDatasetSchema.parse(JSON.parse(readFileSync('fixtures/demo/latest.json', 'utf8')));
    expect(latest.dataset).toBe('demo');
    expect(latest.notice).toMatch(/DEMONSTRATION DATA/);
    expect(latest.records.every((r) => r.title.startsWith('[DEMO]') && r.url.startsWith('https://example.org/'))).toBe(true);
    for (const f of readdirSync('fixtures/demo/archive').filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      expect(DailyDatasetSchema.parse(JSON.parse(readFileSync(`fixtures/demo/archive/${f}`, 'utf8'))).dataset).toBe('demo');
    }
    ArchiveIndexSchema.parse(JSON.parse(readFileSync('fixtures/demo/archive/index.json', 'utf8')));
    RunStatusSchema.parse(JSON.parse(readFileSync('fixtures/demo/status.json', 'utf8')));
    SourcesFileSchema.parse(JSON.parse(readFileSync('fixtures/demo/sources.json', 'utf8')));
  });
  it('rejects datasets that cite unknown records or headline without records', () => {
    const latest = JSON.parse(readFileSync('fixtures/demo/latest.json', 'utf8'));
    expect(DailyDatasetSchema.safeParse({ ...latest, briefing: { ...latest.briefing, citations: ['pmid-0'] } }).success).toBe(false);
    expect(DailyDatasetSchema.safeParse({ ...latest, records: [], topDiscoveries: [] }).success).toBe(false);
    const dup = { ...latest, records: [...latest.records, latest.records[0]] };
    expect(DailyDatasetSchema.safeParse(dup).success).toBe(false);
    const badDoi = structuredClone(latest);
    badDoi.records[0].identifiers.doi = 'not-a-doi';
    expect(DailyDatasetSchema.safeParse(badDoi).success).toBe(false);
  });
});

describe('coverage', () => {
  it('covers all 20 required biotechnology areas', () => {
    expect(CATEGORIES).toHaveLength(20);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(20);
  });
});

describe('configuration', () => {
  it('enables AI only with an API key and defaults to deterministic summaries', () => {
    expect(loadConfig({}).ai.enabled).toBe(false);
    expect(loadConfig({ ANTHROPIC_API_KEY: 'x' }).ai.enabled).toBe(true);
    expect(loadConfig({ ANTHROPIC_API_KEY: 'x', BIOPULSE_AI_DISABLE: 'true' }).ai.enabled).toBe(false);
    expect(loadConfig({ BIOPULSE_AI_MODEL: '' }).ai.model).toBe('claude-opus-5-5');
  });
  it('accepts only https company feeds', () => {
    const c = loadConfig({ BIOPULSE_COMPANY_FEEDS: JSON.stringify([{ name: 'A', url: 'https://a.com/rss' }, { name: 'B', url: 'http://b.com/rss' }]) });
    expect(c.companyFeeds).toEqual([{ name: 'A', url: 'https://a.com/rss' }]);
    expect(loadConfig({ BIOPULSE_COMPANY_FEEDS: 'not json' }).companyFeeds).toEqual([]);
  });
});

describe('GitHub Actions daily workflow', () => {
  const wf = parse(readFileSync('.github/workflows/daily.yml', 'utf8'));
  const steps: { name?: string; run?: string; uses?: string; if?: string; env?: Record<string, string>; id?: string }[] = wf.jobs.update.steps;

  it('runs daily at 07:00 Asia/Kolkata and can be triggered manually', () => {
    expect(wf.on.schedule[0].cron).toBe('30 1 * * *'); // 01:30 UTC = 07:00 IST
    expect(wf.on.workflow_dispatch).toBeDefined();
  });
  it('has the permissions needed to commit data and deploy Pages', () => {
    expect(wf.permissions).toMatchObject({ contents: 'write', pages: 'write', 'id-token': 'write' });
  });
  it('generates data, validates, commits, builds and deploys in the same run', () => {
    const idx = (pred: (s: (typeof steps)[number]) => boolean) => steps.findIndex(pred);
    const pipeline = idx((s) => s.run === 'npm run pipeline');
    const validate = idx((s) => s.run === 'npm run validate:data');
    const commit = idx((s) => (s.name ?? '').startsWith('Commit data'));
    const build = idx((s) => s.run === 'npm run build');
    const upload = idx((s) => (s.uses ?? '').startsWith('actions/upload-pages-artifact'));
    expect(pipeline).toBeGreaterThan(-1);
    expect(pipeline).toBeLessThan(validate);
    expect(validate).toBeLessThan(commit);
    expect(commit).toBeLessThan(build);
    expect(build).toBeLessThan(upload);
    expect(wf.jobs.deploy.needs).toBe('update');
    expect(wf.jobs.deploy.steps[0].uses).toMatch(/^actions\/deploy-pages@/);
  });
  it('preserves the last good data when the pipeline crashes and never commits after a crash', () => {
    const p = steps.find((s) => s.run === 'npm run pipeline')!;
    expect((p as { 'continue-on-error'?: boolean })['continue-on-error']).toBe(true);
    const restore = steps.find((s) => (s.name ?? '').startsWith('Restore'))!;
    expect(restore.if).toContain("steps.pipeline.outcome == 'failure'");
    expect(restore.run).toContain('git checkout -- public/data');
    expect(steps.find((s) => (s.name ?? '').startsWith('Commit data'))!.if).toContain("steps.pipeline.outcome == 'success'");
  });
  it('reads credentials only from secrets', () => {
    const env = steps.find((s) => s.run === 'npm run pipeline')!.env!;
    for (const k of ['ANTHROPIC_API_KEY', 'EPO_OPS_KEY', 'EPO_OPS_SECRET', 'NCBI_API_KEY']) expect(env[k]).toBe(`\${{ secrets.${k} }}`);
  });
});
