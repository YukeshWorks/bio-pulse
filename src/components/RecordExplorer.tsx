import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATEGORIES } from '../../shared/categories';
import { EVIDENCE_ORDER } from '../../shared/evidence';
import type { EvidenceClass, SourceId } from '../../shared/schema';
import { ARCHIVE_PAGE_DAYS, loadRange, useAsync, type RangeKey } from '../lib/data';
import { applyFilters, toggle, type FilterState, type SortKey } from '../lib/filters';
import { EV_DOT } from './Badges';
import { RecordCard } from './RecordCard';
import { EmptyState, ErrorState, Loading } from './States';

const SOURCES: { id: SourceId; name: string }[] = [
  { id: 'pubmed', name: 'PubMed' },
  { id: 'europepmc', name: 'Europe PMC' },
  { id: 'biorxiv', name: 'bioRxiv' },
  { id: 'medrxiv', name: 'medRxiv' },
  { id: 'clinicaltrials', name: 'ClinicalTrials.gov' },
  { id: 'fda', name: 'FDA' },
  { id: 'ema', name: 'EMA' },
  { id: 'epo', name: 'EPO' },
  { id: 'company', name: 'Company' },
];

const RANGES: { id: RangeKey; label: string }[] = [
  { id: 'latest', label: 'Latest update' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
  { id: 'all', label: 'Entire archive' },
];

function useFilterParams(): [FilterState & { range: RangeKey }, (patch: Partial<FilterState & { range: RangeKey }>) => void] {
  const [params, setParams] = useSearchParams();
  const list = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  const state = {
    q: params.get('q') ?? '',
    categories: list('cat'),
    evidence: list('ev') as EvidenceClass[],
    sources: list('src') as SourceId[],
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    sort: (params.get('sort') as SortKey) || 'relevance',
    range: (params.get('range') as RangeKey) || 'latest',
  };
  const update = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.categories.length) p.set('cat', next.categories.join(','));
    if (next.evidence.length) p.set('ev', next.evidence.join(','));
    if (next.sources.length) p.set('src', next.sources.join(','));
    if (next.from) p.set('from', next.from);
    if (next.to) p.set('to', next.to);
    if (next.sort !== 'relevance') p.set('sort', next.sort);
    if (next.range !== 'latest') p.set('range', next.range);
    setParams(p, { replace: true });
  };
  return [state, update];
}

export function RecordExplorer({ lockedEvidence, lockedCategory, emptyHint }: { lockedEvidence?: EvidenceClass[]; lockedCategory?: string; emptyHint?: React.ReactNode }) {
  const [f, update] = useFilterParams();
  const [limit, setLimit] = useState(30);
  const [showFilters, setShowFilters] = useState(false);
  const [maxDays, setMaxDays] = useState(ARCHIVE_PAGE_DAYS);
  const state = useAsync(() => loadRange(f.range, maxDays), [f.range, maxDays]);

  const effective: FilterState = {
    ...f,
    evidence: lockedEvidence ? (f.evidence.length ? f.evidence.filter((e) => lockedEvidence.includes(e)) : lockedEvidence) : f.evidence,
    categories: lockedCategory ? [lockedCategory] : f.categories,
  };
  const results = useMemo(() => (state.data ? applyFilters(state.data.records, effective) : []), [state.data, JSON.stringify(effective)]);
  const evidenceOptions = lockedEvidence ?? EVIDENCE_ORDER;
  const activeCount = f.categories.length + f.evidence.length + f.sources.length + (f.from ? 1 : 0) + (f.to ? 1 : 0);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="flex gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Search records</span>
            <input className="input pl-8" type="search" placeholder="Search title, author, ID…" value={f.q} onChange={(e) => update({ q: e.target.value })} />
            <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-fg-subtle" fill="currentColor" aria-hidden>
              <path d="M8.5 3a5.5 5.5 0 014.38 8.82l3.65 3.65-1.06 1.06-3.65-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          </label>
          <button type="button" className="rounded-lg border border-ink-600 px-3 text-sm text-fg-muted lg:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            Filters{activeCount ? ` (${activeCount})` : ''}
          </button>
        </div>
        <div className={`${showFilters ? 'block' : 'hidden'} mt-4 space-y-5 lg:block`}>
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-xs text-fg-subtle sm:col-span-1 lg:col-span-2">
              Dataset
              <select className="input mt-1" value={f.range} onChange={(e) => {
                  setMaxDays(ARCHIVE_PAGE_DAYS);
                  update({ range: e.target.value as RangeKey });
                }}>
                {RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 text-xs text-fg-subtle sm:col-span-1 lg:col-span-2">
              Sort
              <select className="input mt-1" value={f.sort} onChange={(e) => update({ sort: e.target.value as SortKey })}>
                <option value="relevance">Evidence score</option>
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="title">Title A–Z</option>
              </select>
            </label>
            <label className="text-xs text-fg-subtle">
              From
              <input className="input mt-1" type="date" value={f.from} onChange={(e) => update({ from: e.target.value })} />
            </label>
            <label className="text-xs text-fg-subtle">
              To
              <input className="input mt-1" type="date" value={f.to} onChange={(e) => update({ to: e.target.value })} />
            </label>
          </div>
          {evidenceOptions.length > 1 && (
            <fieldset>
              <legend className="eyebrow mb-2">Evidence</legend>
              <div className="flex flex-wrap gap-1.5">
                {evidenceOptions.map((e) => (
                  <button key={e} type="button" aria-pressed={f.evidence.includes(e)} onClick={() => update({ evidence: toggle(f.evidence, e) })} className={`chip ${f.evidence.includes(e) ? 'border-accent/60 text-fg' : ''}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${EV_DOT[e]}`} aria-hidden />
                    {e.toLowerCase()}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          {!lockedCategory && (
            <label className="block text-xs text-fg-subtle">
              Category
              <select className="input mt-1" value={f.categories[0] ?? ''} onChange={(e) => update({ categories: e.target.value ? [e.target.value] : [] })}>
                <option value="">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset>
            <legend className="eyebrow mb-2">Source</legend>
            <div className="flex flex-wrap gap-1.5">
              {SOURCES.map((s) => (
                <button key={s.id} type="button" aria-pressed={f.sources.includes(s.id)} onClick={() => update({ sources: toggle(f.sources, s.id) })} className={`chip ${f.sources.includes(s.id) ? 'border-accent/60 text-fg' : ''}`}>
                  {s.name}
                </button>
              ))}
            </div>
          </fieldset>
          {activeCount + (f.q ? 1 : 0) > 0 && (
            <button type="button" className="text-xs text-signal hover:text-fg" onClick={() => update({ q: '', categories: [], evidence: [], sources: [], from: '', to: '' })}>
              Clear all filters
            </button>
          )}
        </div>
      </aside>
      <section aria-live="polite">
        {state.loading && <Loading />}
        {state.error && <ErrorState error={state.error} />}
        {state.data && (
          <>
            <p className="mb-3 text-xs text-fg-subtle">
              {results.length} record{results.length === 1 ? '' : 's'}
              {f.range !== 'latest'
                ? ` across ${state.data.days.length} of ${state.data.totalDays} archived day${state.data.totalDays === 1 ? '' : 's'} loaded`
                : state.data.days[0]
                  ? ` · update of ${state.data.days[0]}`
                  : ''}
            </p>
            {f.range !== 'latest' && state.data.days.length < state.data.totalDays && (
              <p className="mb-3 text-xs text-fg-subtle">
                Search and filters apply to the loaded days only.{' '}
                <button type="button" className="text-signal hover:text-fg" onClick={() => setMaxDays((d) => d + ARCHIVE_PAGE_DAYS)}>
                  Load {Math.min(ARCHIVE_PAGE_DAYS, state.data.totalDays - state.data.days.length)} older day(s)
                </button>
              </p>
            )}
            {results.length === 0 ? (
              <EmptyState title="No matching records">{emptyHint ?? 'Try widening the dataset range or clearing filters. BioPulse never fills empty results with placeholder content.'}</EmptyState>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {results.slice(0, limit).map((r, i) => (
                  <RecordCard key={r.id} r={r} day={f.range !== 'latest' ? r.day : undefined} index={i} />
                ))}
                {results.length > limit && (
                  <button type="button" className="card card-hover py-3 text-sm text-fg-muted" onClick={() => setLimit((l) => l + 30)}>
                    Show more ({results.length - limit} remaining)
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
