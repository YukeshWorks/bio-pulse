import { CATEGORY_BY_ID } from '../../shared/categories';
import type { BioRecord, Briefing, EvidenceClass } from '../../shared/schema';
import { truncateWords, wordCount } from './text';

export const BRIEFING_MIN_WORDS = 20;
export const BRIEFING_MAX_WORDS = 30;

const PHRASE: Record<EvidenceClass, string> = {
  'PEER-REVIEWED': 'a peer-reviewed study',
  PREPRINT: 'a preprint not yet peer-reviewed',
  'CLINICAL TRIAL': 'a newly registered clinical trial with no results yet',
  'REGULATORY UPDATE': 'a regulatory update',
  'PATENT APPLICATION': 'a patent filing, which does not prove it works',
  'COMPANY ANNOUNCEMENT': 'a company announcement',
};

function lowerName(id: string): string {
  const n = CATEGORY_BY_ID[id]?.name ?? id;
  return n.replace(/^(\w)/, (c) => c.toLowerCase()).replace(/\bcrispr\b/i, 'CRISPR').replace(/\bai\b/i, 'AI');
}

function stripTrailing(s: string): string {
  return s.replace(/[.?!]+$/, '');
}

/**
 * Deterministic one-sentence briefing built only from record metadata (category counts, evidence
 * class and titles of the top records). Titles are quoted, never paraphrased. Returns a sentence of
 * 20–30 words, or a null sentence when no records qualify.
 */
export function deterministicBriefing(records: BioRecord[], top: BioRecord[]): Briefing {
  if (records.length === 0 || top.length === 0) {
    return { sentence: null, wordCount: 0, citations: [], method: 'none', note: 'No qualifying verified records were found for this run, so no briefing was generated.' };
  }
  const catCounts = new Map<string, number>();
  for (const r of records) for (const c of r.categories.slice(0, 1)) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  const [leadCat] = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];

  const a = top[0];
  // Plain one-story sentence: "Today's top biotech story is “<title>”, a peer-reviewed study, one of
  // 200 new records today, most of them in microbiology."
  const field = lowerName(leadCat);
  const tail =
    records.length === 1
      ? 'the only new record BioPulse found today.'
      : `one of ${records.length} new records today, most of them in ${field}.`;
  const build = (n: number) => `Today's top biotech story is “${stripTrailing(truncateWords(a.title, n))}”, ${PHRASE[a.evidence]}, ${tail}`;
  const fits = (s: string) => wordCount(s) <= BRIEFING_MAX_WORDS;
  let sentence = '';
  for (let n = 18; n >= 3 && !sentence; n--) {
    const s = build(n);
    if (fits(s)) sentence = s;
  }
  if (!sentence) sentence = build(3);
  if (wordCount(sentence) < BRIEFING_MIN_WORDS) {
    sentence = sentence.replace(/\.$/, ', with every source linked below.');
  }
  // Last-resort hard cap (only reachable with pathological category names).
  if (!fits(sentence)) sentence = `${sentence.split(/\s+/).slice(0, BRIEFING_MAX_WORDS).join(' ').replace(/[,;:]$/, '')}…`;
  const citations = [a.id];

  return {
    sentence,
    wordCount: wordCount(sentence),
    citations,
    method: 'deterministic',
    note: 'Generated deterministically from source metadata (the top story’s verbatim title, its evidence type and today’s record counts). No AI was used.',
  };
}

