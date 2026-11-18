import type { SourceId } from '../../shared/schema';
import type { RawRecord } from '../types';
import { dedupeKeys } from './ids';

export interface MergedRecord extends RawRecord {
  alsoIndexedIn: { id: SourceId; name: string; url: string }[];
  mergeNotes: string[];
}

/** Lower number = preferred as the primary (displayed) source for a merged record. */
const SOURCE_PRIORITY: Record<SourceId, number> = {
  pubmed: 0, clinicaltrials: 0, fda: 0, ema: 0, epo: 0, biorxiv: 1, medrxiv: 1, europepmc: 2, company: 3,
};

/**
 * Merge records describing the same item (shared DOI, PMID, PMCID, NCT ID, patent number,
 * normalised URL or long normalised title). Uses union-find so transitive matches collapse into one.
 */
export function dedupe(records: RawRecord[]): { merged: MergedRecord[]; duplicatesRemoved: number } {
  const parent = records.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const keyOwner = new Map<string, number>();

  records.forEach((r, i) => {
    for (const k of dedupeKeys(r.identifiers, r.url, r.title, r.evidence)) {
      const owner = keyOwner.get(k);
      if (owner === undefined) keyOwner.set(k, i);
      else parent[find(i)] = find(owner);
    }
  });

  const groups = new Map<number, RawRecord[]>();
  records.forEach((r, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), r]);
  });

  const merged: MergedRecord[] = [];
  for (const group of groups.values()) merged.push(mergeGroup(group));
  return { merged, duplicatesRemoved: records.length - merged.length };
}

function mergeGroup(group: RawRecord[]): MergedRecord {
  const sorted = [...group].sort((a, b) => SOURCE_PRIORITY[a.sourceId] - SOURCE_PRIORITY[b.sourceId]);
  const primary = sorted[0];
  const notes: string[] = [];
  const identifiers = { ...primary.identifiers };
  for (const r of sorted.slice(1)) {
    for (const [k, v] of Object.entries(r.identifiers) as [keyof typeof identifiers, string | undefined][]) {
      if (v && !identifiers[k]) identifiers[k] = v;
    }
  }

  // Conservative evidence rule: if any copy is a preprint while another claims peer review, keep PREPRINT.
  let evidence = primary.evidence;
  const classes = new Set(group.map((g) => g.evidence));
  if (classes.has('PREPRINT') && classes.has('PEER-REVIEWED')) {
    evidence = 'PREPRINT';
    notes.push('Sources disagreed on peer-review status; labelled as preprint (conservative).');
  }

  const longestAbstract = group.map((g) => g.abstract ?? '').sort((a, b) => b.length - a.length)[0] || undefined;
  const alsoIndexedIn = sorted
    .slice(1)
    .filter((r, i, arr) => r.sourceId !== primary.sourceId && arr.findIndex((x) => x.sourceId === r.sourceId) === i)
    .map((r) => ({ id: r.sourceId, name: r.sourceName, url: r.url }));

  return {
    ...primary,
    identifiers,
    evidence,
    authors: primary.authors.length ? primary.authors : (sorted.find((r) => r.authors.length)?.authors ?? []),
    organization: primary.organization ?? sorted.find((r) => r.organization)?.organization,
    abstract: longestAbstract,
    keywords: [...new Set(group.flatMap((g) => g.keywords ?? []))],
    subjects: [...new Set(group.flatMap((g) => g.subjects ?? []))],
    alsoIndexedIn,
    mergeNotes: notes,
  };
}
