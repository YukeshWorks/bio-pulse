import { EVIDENCE } from '../../shared/evidence';
import type { BioRecord } from '../../shared/schema';
import { diffDays } from './dates';

/**
 * Transparent ranking score. It reflects evidence strength and metadata completeness — not
 * scientific importance, which BioPulse cannot judge. The formula is documented on the About page.
 */
export function scoreRecord(r: Pick<BioRecord, 'evidence' | 'date' | 'categories' | 'alsoIndexedIn' | 'articleTypes' | 'summary'> & Partial<Pick<BioRecord, 'classification'>>, runDate: string): number {
  let s = EVIDENCE[r.evidence].weight;
  if (r.classification?.confidence === 'low') s -= 0.8; // weak topical match: keep, but do not promote
  if (r.summary.basis === 'source') s += 0.5;
  s += Math.min(r.categories.length, 3) * 0.15;
  // Being indexed by a second database (e.g. PubMed + Europe PMC) is the same article, not extra evidence:
  // a small completeness bonus only.
  if (r.alsoIndexedIn.length > 0) s += 0.1;
  const age = Math.max(0, diffDays(r.date, runDate));
  s += Math.max(0, 0.6 - age * 0.2);
  const types = (r.articleTypes ?? []).join(' ').toLowerCase();
  if (/review|meta-analysis/.test(types)) s -= 1.2; // reviews summarise, they are not new discoveries
  if (/case reports?/.test(types)) s -= 0.6;
  return Math.round(s * 100) / 100;
}

/**
 * Pick the top `n` records with diversity: at most one per primary category and a penalty for
 * repeating an evidence class. Only records whose URL passed live verification are eligible when
 * `requireVerified` is set (citation integrity for the homepage).
 */
export function pickTop(records: BioRecord[], n: number, requireVerified: boolean): BioRecord[] {
  const eligible = records.filter(
    (r) =>
      (!requireVerified || r.verification.urlCheck === 'ok' || r.verification.urlCheck === 'restricted') &&
      // Homepage highlights require a confident topical classification.
      r.classification?.confidence !== 'low',
  );
  const chosen: BioRecord[] = [];
  const usedCats = new Set<string>();
  const usedEvidence = new Map<string, number>();
  const pool = [...eligible].sort((a, b) => b.score - a.score);
  while (chosen.length < n && pool.length) {
    let bestIdx = -1;
    let best = -Infinity;
    pool.forEach((r, i) => {
      const primary = r.categories[0];
      let adj = r.score;
      if (usedCats.has(primary)) adj -= 1.5;
      adj -= (usedEvidence.get(r.evidence) ?? 0) * 0.5;
      if (adj > best) {
        best = adj;
        bestIdx = i;
      }
    });
    const [pick] = pool.splice(bestIdx, 1);
    chosen.push(pick);
    usedCats.add(pick.categories[0]);
    usedEvidence.set(pick.evidence, (usedEvidence.get(pick.evidence) ?? 0) + 1);
  }
  return chosen;
}

/**
 * Minimum share of the daily cap reserved for each lower-weighted evidence class (used only when
 * that many records of the class exist). Without reservation, a pure score cut keeps only journal
 * articles: on 2026-11-19 all 203 bioRxiv and 10 medRxiv preprints were cut by the 200-record cap.
 */
export const EVIDENCE_QUOTAS: Partial<Record<BioRecord['evidence'], number>> = {
  PREPRINT: 0.25,
  'CLINICAL TRIAL': 0.1,
  'PATENT APPLICATION': 0.1,
  'REGULATORY UPDATE': 0.05,
  'COMPANY ANNOUNCEMENT': 0.05,
};

export function capBalanced<T extends Pick<BioRecord, 'id' | 'evidence' | 'score'>>(records: T[], max: number): { kept: T[]; dropped: T[] } {
  const sorted = [...records].sort((a, b) => b.score - a.score);
  if (sorted.length <= max) return { kept: sorted, dropped: [] };
  const keptIds = new Set<string>();
  for (const [ev, share] of Object.entries(EVIDENCE_QUOTAS)) {
    const quota = Math.floor(max * (share ?? 0));
    for (const r of sorted.filter((x) => x.evidence === ev).slice(0, quota)) keptIds.add(r.id);
  }
  for (const r of sorted) {
    if (keptIds.size >= max) break;
    keptIds.add(r.id);
  }
  return { kept: sorted.filter((r) => keptIds.has(r.id)), dropped: sorted.filter((r) => !keptIds.has(r.id)) };
}
