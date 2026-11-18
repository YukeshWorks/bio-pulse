import { describe, expect, it } from 'vitest';
import { addDays, diffDays, istDate, parseSourceDate, validateRecordDate } from '../pipeline/lib/dates';
import { dedupe } from '../pipeline/lib/dedupe';
import { dedupeKeys, normalizeDoi, normalizeNct, normalizePatentNumber, recordId } from '../pipeline/lib/ids';
import { cleanText, excerpt, splitSentences, wordCount } from '../pipeline/lib/text';
import { checkUrlLive, validateRaw, validateUrl } from '../pipeline/lib/validate';
import { classify } from '../pipeline/lib/classify';
import { createHttpClient, HttpError } from '../pipeline/lib/http';
import type { RawRecord } from '../pipeline/types';
import { json, mockFetch, RUN_DATE, testHttp } from './helpers';

const raw = (over: Partial<RawRecord> = {}): RawRecord => ({
  sourceId: 'pubmed',
  sourceName: 'PubMed',
  title: 'CRISPR base editing restores gene function in a test model',
  authors: ['A. Rivera'],
  date: '2026-11-17',
  dateType: 'published',
  url: 'https://pubmed.ncbi.nlm.nih.gov/99000001/',
  identifiers: { pmid: '99000001', doi: '10.5555/test.1' },
  evidence: 'PEER-REVIEWED',
  ...over,
});

describe('dates and time zones (Asia/Kolkata)', () => {
  it('maps UTC instants to the IST calendar date', () => {
    expect(istDate(new Date('2026-11-17T18:29:59Z'))).toBe('2026-11-17'); // 23:59:59 IST
    expect(istDate(new Date('2026-11-17T18:30:00Z'))).toBe('2026-11-18'); // 00:00 IST
    expect(istDate(new Date('2026-11-18T01:30:00Z'))).toBe('2026-11-18'); // scheduled 07:00 IST run
  });
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-11-16', '2026-11-18')).toBe(2);
  });
  it('parses the date formats used by sources', () => {
    expect(parseSourceDate('2026-11-17')).toBe('2026-11-17');
    expect(parseSourceDate('2026/11/17 06:22')).toBe('2026-11-17');
    expect(parseSourceDate('20261111')).toBe('2026-11-11');
    expect(parseSourceDate('2026 Nov 17')).toBe('2026-11-17');
    // 14:00 EST = 19:00 UTC = 00:30 IST next day
    expect(parseSourceDate('Tue, 17 Nov 2026 14:00:00 EST')).toBe('2026-11-18');
    expect(parseSourceDate('Mon, 16 Nov 2026 12:00:00 +0100')).toBe('2026-11-16');
  });
  it('rejects missing, partial and impossible dates instead of guessing', () => {
    expect(parseSourceDate('')).toBeNull();
    expect(parseSourceDate(undefined)).toBeNull();
    expect(parseSourceDate('2026 Nov')).toBeNull();
    expect(parseSourceDate('2026-02-30')).toBeNull();
    expect(parseSourceDate('not a date')).toBeNull();
  });
  it('validates publication dates against the run date', () => {
    expect(validateRecordDate('2026-11-18', RUN_DATE).ok).toBe(true);
    expect(validateRecordDate('2026-11-19', RUN_DATE).ok).toBe(true); // one day of zone slack
    expect(validateRecordDate('2026-11-21', RUN_DATE)).toEqual({ ok: false, reason: 'future-date' });
    expect(validateRecordDate('1970-01-01', RUN_DATE)).toEqual({ ok: false, reason: 'date-too-old' });
  });
});

describe('identifiers', () => {
  it('normalises DOIs, NCT IDs and patent numbers', () => {
    expect(normalizeDoi('https://doi.org/10.1038/S41586-026-0001-X.')).toBe('10.1038/s41586-026-0001-x');
    expect(normalizeDoi('doi: 10.5555/abc')).toBe('10.5555/abc');
    expect(normalizeDoi('11.1234/abc')).toBeUndefined();
    expect(normalizeNct('nct01234567')).toBe('NCT01234567');
    expect(normalizeNct('NCT123')).toBeUndefined();
    expect(normalizePatentNumber('ep', '4 999 001', 'a1')).toBe('EP4999001A1');
    expect(normalizePatentNumber('EP', '', 'A1')).toBeUndefined();
  });
  it('derives stable record ids from the strongest identifier', () => {
    expect(recordId({ doi: '10.5555/x', pmid: '1' }, 'https://x')).toMatch(/^doi-[0-9a-f]{12}$/);
    expect(recordId({ pmid: '42' }, 'https://x')).toBe('pmid-42');
    expect(recordId({ nct: 'NCT01234567' }, 'https://x')).toBe('nct-01234567');
    expect(recordId({ patentNumber: 'EP4999001A1' }, 'https://x')).toBe('pat-ep4999001a1');
  });
});

describe('text handling', () => {
  it('strips markup and decodes entities', () => {
    expect(cleanText('Base <i>editing</i> &amp; &#x3B1;-helix')).toBe('Base editing & α-helix');
  });
  it('does not split sentences on scientific abbreviations', () => {
    expect(splitSentences('Cells (e.g. HEK293) were used. Results were robust.')).toHaveLength(2);
    expect(splitSentences('Smith et al. reported this effect. We confirm it.')).toHaveLength(2);
  });
  it('produces short excerpts rather than full abstracts', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} describes a result in detail.`).join(' ');
    expect(excerpt(long, 320).length).toBeLessThanOrEqual(321);
    expect(wordCount('one two  three')).toBe(3);
  });
});

describe('source URL validation', () => {
  it('accepts official source URLs', () => {
    expect(validateUrl('https://pubmed.ncbi.nlm.nih.gov/1/', 'pubmed').ok).toBe(true);
    expect(validateUrl('https://clinicaltrials.gov/study/NCT01234567', 'clinicaltrials').ok).toBe(true);
  });
  it('rejects invalid, missing, insecure and off-site URLs', () => {
    expect(validateUrl('not a url', 'pubmed')).toEqual({ ok: false, reason: 'invalid-url' });
    expect(validateUrl('http://pubmed.ncbi.nlm.nih.gov/1/', 'pubmed')).toEqual({ ok: false, reason: 'non-https-url' });
    expect(validateUrl('https://pubmed.example.com/1/', 'pubmed')).toEqual({ ok: false, reason: 'url-host-not-allowed' });
    expect(validateUrl('https://www.fda.gov.evil.com/x', 'fda')).toEqual({ ok: false, reason: 'url-host-not-allowed' });
    expect(validateUrl('https://news.acme.com/x', 'company', 'news.acme.com').ok).toBe(true);
    expect(validateUrl('https://other.com/x', 'company', 'news.acme.com').ok).toBe(false);
    expect(validateRaw(raw({ url: '' }), RUN_DATE)).toEqual({ ok: false, reason: 'missing-url' });
  });
  it('verifies that identifiers agree with the source URL (citation verification)', () => {
    expect(validateRaw(raw(), RUN_DATE).ok).toBe(true);
    expect(validateRaw(raw({ url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' }), RUN_DATE)).toEqual({ ok: false, reason: 'identifier-mismatch' });
    expect(validateRaw(raw({ sourceId: 'clinicaltrials', identifiers: {}, url: 'https://clinicaltrials.gov/study/NCT01234567' }), RUN_DATE)).toEqual({ ok: false, reason: 'identifier-mismatch' });
  });
  it('refuses to label preprint-server records as peer-reviewed', () => {
    const r = raw({ sourceId: 'biorxiv', url: 'https://www.biorxiv.org/content/10.5555/x.1v1', identifiers: { doi: '10.5555/x.1' }, evidence: 'PEER-REVIEWED' });
    expect(validateRaw(r, RUN_DATE)).toEqual({ ok: false, reason: 'evidence-misclassified' });
  });
  it('rejects missing titles and future dates', () => {
    expect(validateRaw(raw({ title: '' }), RUN_DATE)).toEqual({ ok: false, reason: 'missing-title' });
    expect(validateRaw(raw({ date: null }), RUN_DATE)).toEqual({ ok: false, reason: 'missing-date' });
    expect(validateRaw(raw({ date: '2027-01-01' }), RUN_DATE)).toEqual({ ok: false, reason: 'future-date' });
  });
  it('classifies live URL check results', async () => {
    const http = testHttp(
      mockFetch([
        { match: (u) => u.endsWith('/ok'), respond: () => new Response('', { status: 200 }) },
        { match: (u) => u.endsWith('/gone'), respond: () => new Response('', { status: 404 }) },
        { match: (u) => u.endsWith('/blocked'), respond: () => new Response('', { status: 403 }) },
      ]),
    );
    expect((await checkUrlLive(http, 'https://x.org/ok')).result).toBe('ok');
    expect((await checkUrlLive(http, 'https://x.org/gone')).result).toBe('failed');
    expect((await checkUrlLive(http, 'https://x.org/blocked')).result).toBe('restricted');
  });
});

describe('deduplication', () => {
  it('merges the same article from PubMed and Europe PMC (DOI case-insensitive / PMID)', () => {
    const a = raw();
    const b = raw({ sourceId: 'europepmc', sourceName: 'Europe PMC', url: 'https://europepmc.org/article/MED/99000001', identifiers: { pmid: '99000001', doi: '10.5555/test.1', pmcid: 'PMC1' }, abstract: 'Longer abstract text from Europe PMC.' });
    const { merged, duplicatesRemoved } = dedupe([a, b]);
    expect(merged).toHaveLength(1);
    expect(duplicatesRemoved).toBe(1);
    expect(merged[0].sourceId).toBe('pubmed');
    expect(merged[0].identifiers.pmcid).toBe('PMC1');
    expect(merged[0].alsoIndexedIn.map((x) => x.id)).toEqual(['europepmc']);
    expect(merged[0].abstract).toContain('Europe PMC');
  });
  it('merges transitively (A~B by DOI, B~C by PMID)', () => {
    const a = raw({ identifiers: { doi: '10.5555/t' }, url: 'https://pubmed.ncbi.nlm.nih.gov/1/' });
    const b = raw({ sourceId: 'europepmc', identifiers: { doi: '10.5555/t', pmid: '7' }, url: 'https://europepmc.org/article/MED/7' });
    const c = raw({ sourceId: 'europepmc', identifiers: { pmid: '7' }, url: 'https://europepmc.org/abstract/MED/7' });
    expect(dedupe([a, b, c]).merged).toHaveLength(1);
  });
  it('labels conflicting peer-review status conservatively as PREPRINT', () => {
    const a = raw({ identifiers: { doi: '10.5555/same' } });
    const b = raw({ sourceId: 'europepmc', url: 'https://europepmc.org/article/PPR/PPR1', identifiers: { doi: '10.5555/same' }, evidence: 'PREPRINT' });
    const m = dedupe([a, b]).merged[0];
    expect(m.evidence).toBe('PREPRINT');
    expect(m.mergeNotes.length).toBe(1);
  });
  it('does not merge a preprint with its journal version by title alone', () => {
    const t = 'A sufficiently long identical title shared by preprint and journal version of a study';
    const keysA = dedupeKeys({}, 'https://a.org/1', t, 'PREPRINT');
    const keysB = dedupeKeys({}, 'https://b.org/1', t, 'PEER-REVIEWED');
    expect(keysA.some((k) => keysB.includes(k))).toBe(false);
  });
  it('keeps distinct trials separate', () => {
    const t1 = raw({ sourceId: 'clinicaltrials', identifiers: { nct: 'NCT00000001' }, url: 'https://clinicaltrials.gov/study/NCT00000001', title: 'Trial one' });
    const t2 = raw({ sourceId: 'clinicaltrials', identifiers: { nct: 'NCT00000002' }, url: 'https://clinicaltrials.gov/study/NCT00000002', title: 'Trial two' });
    expect(dedupe([t1, t2]).merged).toHaveLength(2);
  });
});

describe('classification', () => {
  it('assigns biotechnology categories from title and abstract', () => {
    expect(classify(raw())[0]).toBe('crispr-genetic-engineering');
    expect(classify(raw({ title: 'Municipal budget policy discussion for 2027', abstract: 'Tax policy.' }))).toEqual([]);
  });
  it('always tags patents as patents & inventions', () => {
    const cats = classify(raw({ sourceId: 'epo', evidence: 'PATENT APPLICATION', title: 'Engineered nuclease', patent: { status: 'application', cpc: ['C12N15'] } }));
    expect(cats[0]).toBe('patents-inventions');
    expect(cats).toContain('crispr-genetic-engineering');
  });
  it('requires a stronger match for regulatory news', () => {
    expect(classify(raw({ sourceId: 'fda', evidence: 'REGULATORY UPDATE', title: 'FDA warns about tobacco products', abstract: 'Tobacco warning.' }))).toEqual([]);
  });
});

describe('HTTP client: failed and empty API responses', () => {
  it('retries transient 5xx errors then succeeds', async () => {
    let n = 0;
    const f = mockFetch([{ match: () => true, respond: () => (++n < 3 ? new Response('busy', { status: 503 }) : json({ ok: true })) }]);
    const http = testHttp(f);
    expect(await http.getJson('https://api.example.org/x')).toEqual({ ok: true });
    expect(f.calls).toHaveLength(3);
  });
  it('gives up after bounded retries and reports the status', async () => {
    const http = testHttp(mockFetch([{ match: () => true, respond: () => new Response('down', { status: 500 }) }]));
    await expect(http.getJson('https://api.example.org/x')).rejects.toMatchObject({ status: 500 });
  });
  it('does not retry 404 and surfaces it', async () => {
    const f = mockFetch([]);
    await expect(testHttp(f).getText('https://api.example.org/missing')).rejects.toBeInstanceOf(HttpError);
    expect(f.calls).toHaveLength(1);
  });
  it('reports network errors and invalid JSON', async () => {
    const http = createHttpClient({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, sleep: async () => {}, baseBackoffMs: 0 });
    await expect(http.getText('https://api.example.org/x')).rejects.toThrow(/Network error/);
    const bad = testHttp(mockFetch([{ match: () => true, respond: () => new Response('<html>', { status: 200 }) }]));
    await expect(bad.getJson('https://api.example.org/x')).rejects.toThrow(/Invalid JSON/);
  });
  it('redacts API keys from error messages', async () => {
    const http = testHttp(mockFetch([{ match: () => true, respond: () => new Response('', { status: 400 }) }]));
    await expect(http.getText('https://eutils.example.org/x?api_key=SECRET123')).rejects.toThrow(/api_key=\*\*\*/);
  });
});

describe('structured abstract labels', () => {
  it('are stripped from excerpts', async () => {
    const { excerpt: ex } = await import('../pipeline/lib/text');
    expect(ex('RESULTS: We developed a tool. It works.')).toBe('We developed a tool. It works.');
    expect(ex('Background: Context here. More.')).toBe('Context here. More.');
  });
});

describe('section label stripping is conservative', () => {
  it('keeps ordinary leading phrases with colons', async () => {
    const { stripSectionLabel } = await import('../pipeline/lib/text');
    expect(stripSectionLabel('Here we show: a result.')).toBe('Here we show: a result.');
    expect(stripSectionLabel('KEY FINDINGS: x')).toBe('x');
  });
});
