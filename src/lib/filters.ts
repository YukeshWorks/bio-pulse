import type { BioRecord, EvidenceClass, SourceId } from '../../shared/schema';

export type SortKey = 'relevance' | 'newest' | 'oldest' | 'title';

export interface FilterState {
  q: string;
  categories: string[];
  evidence: EvidenceClass[];
  sources: SourceId[];
  from: string;
  to: string;
  sort: SortKey;
}

export const EMPTY_FILTERS: FilterState = { q: '', categories: [], evidence: [], sources: [], from: '', to: '', sort: 'relevance' };

function haystack(r: BioRecord): string {
  return [
    r.title,
    r.authors.join(' '),
    r.organization ?? '',
    r.venue ?? '',
    r.summary.text,
    r.source.name,
    Object.values(r.identifiers).join(' '),
    r.trial?.conditions?.join(' ') ?? '',
    r.trial?.interventions?.join(' ') ?? '',
    r.patent?.applicants?.join(' ') ?? '',
  ]
    .join(' ')
    .toLowerCase();
}

/** Pure filtering/sorting used by every list page (unit-tested). */
export function applyFilters<T extends BioRecord>(records: T[], f: FilterState): T[] {
  const terms = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = records.filter((r) => {
    if (f.categories.length && !r.categories.some((c) => f.categories.includes(c))) return false;
    if (f.evidence.length && !f.evidence.includes(r.evidence)) return false;
    if (f.sources.length && !f.sources.includes(r.source.id) && !r.alsoIndexedIn.some((a) => f.sources.includes(a.id))) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (terms.length) {
      const h = haystack(r);
      if (!terms.every((t) => h.includes(t))) return false;
    }
    return true;
  });
  const cmp: Record<SortKey, (a: T, b: T) => number> = {
    relevance: (a, b) => b.score - a.score || b.date.localeCompare(a.date),
    newest: (a, b) => b.date.localeCompare(a.date) || b.score - a.score,
    oldest: (a, b) => a.date.localeCompare(b.date) || b.score - a.score,
    title: (a, b) => a.title.localeCompare(b.title),
  };
  return out.sort(cmp[f.sort]);
}

export function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}
