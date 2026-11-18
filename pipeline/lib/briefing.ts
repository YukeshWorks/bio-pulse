import { CATEGORY_BY_ID } from '../../shared/categories';
import type { BioRecord, Briefing, EvidenceClass } from '../../shared/schema';
import { truncateWords, wordCount } from './text';

export const BRIEFING_MIN_WORDS = 20;
export const BRIEFING_MAX_WORDS = 30;

const PHRASE: Record<EvidenceClass, string> = {
  'PEER-REVIEWED': 'a peer-reviewed study',
  PREPRINT: 'a not-yet-peer-reviewed preprint',
  'CLINICAL TRIAL': 'a newly registered clinical trial',
  'REGULATORY UPDATE': 'a regulatory update',
  'PATENT APPLICATION': 'a patent filing',
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
  const b = top[1];
  const head =
    records.length === 1
      ? `${capitalize(lowerName(leadCat))} produced today's only verified biotech update`
      : `${capitalize(lowerName(leadCat))} led today's ${records.length} verified biotech updates`;
  const quote = (r: BioRecord, n: number) => `${PHRASE[r.evidence]} on “${stripTrailing(truncateWords(r.title, n))}”`;
  const fits = (s: string) => wordCount(s) <= BRIEFING_MAX_WORDS;

  // Prefer two highlights when both titles stay readable (>= 6 words); otherwise one longer highlight.
  let sentence = '';
  let citations = [a.id];
  if (b) {
    for (let n = 9; n >= 6 && !sentence; n--) {
      const s = `${head}, headlined by ${quote(a, n)} and ${quote(b, n)}.`;
      if (fits(s)) {
        sentence = s;
        citations = [a.id, b.id];
      }
    }
  }
  for (let n = 16; n >= 3 && !sentence; n--) {
    const s = `${head}, headlined by ${quote(a, n)}.`;
    if (fits(s)) sentence = s;
  }
  if (!sentence) sentence = `${head}, headlined by ${quote(a, 3)}.`;
  if (wordCount(sentence) < BRIEFING_MIN_WORDS) {
    sentence = sentence.replace(/\.$/, '; evidence labels and original sources are linked below.');
  }
  // Last-resort hard cap (only reachable with pathological category names).
  if (!fits(sentence)) sentence = `${sentence.split(/\s+/).slice(0, BRIEFING_MAX_WORDS).join(' ').replace(/[,;:]$/, '')}…`;

  return {
    sentence,
    wordCount: wordCount(sentence),
    citations,
    method: 'deterministic',
    note: 'Generated deterministically from source metadata (category counts, evidence labels and verbatim titles). No AI was used.',
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
