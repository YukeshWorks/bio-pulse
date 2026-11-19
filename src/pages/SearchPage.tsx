import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { EmptyState } from '../components/States';
import { KIND_LABEL, LIVE_SOURCES, searchEverywhere, type LiveKind, type LiveResult, type LiveSourceId, type SourceState } from '../lib/liveSearch';
import { useReveal } from '../lib/motion';

const KIND_STYLE: Record<LiveKind, string> = {
  'peer-reviewed': 'text-ev-peer border-ev-peer/40 bg-ev-peer/10',
  preprint: 'text-ev-preprint border-ev-preprint/40 bg-ev-preprint/10',
  'journal-article': 'text-signal border-signal/40 bg-signal/10',
  trial: 'text-ev-trial border-ev-trial/40 bg-ev-trial/10',
  patent: 'text-ev-patent border-ev-patent/40 bg-ev-patent/10',
  other: 'text-fg-muted border-ink-500 bg-ink-800',
};

const SOURCE_NAME = Object.fromEntries(LIVE_SOURCES.map((s) => [s.id, s.name])) as Record<LiveSourceId, string>;
const EXAMPLES = ['CRISPR base editing', 'CAR-T solid tumors', 'mRNA vaccine', 'plastic degrading enzyme', 'organoid'];

function ResultCard({ r, index }: { r: LiveResult; index: number }) {
  const reveal = useReveal<HTMLLIElement>((index % 6) * 40);
  return (
    <li ref={reveal.ref} style={reveal.style} className={`card card-hover flex flex-col gap-1.5 p-4 ${reveal.className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${KIND_STYLE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
        <span className="text-xs text-fg-subtle">from {SOURCE_NAME[r.source]}</span>
      </div>
      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[16px] font-semibold leading-snug text-fg hover:text-signal">
        {r.title}
      </a>
      <p className="text-sm text-fg-subtle">
        {[r.authors, r.venue, r.date].filter(Boolean).join(' · ')}
        {r.extra ? ` · ${r.extra}` : ''}
      </p>
      <p className="flex flex-wrap gap-x-3 text-xs text-fg-subtle">
        {r.doi && <span className="font-mono">DOI {r.doi}</span>}
        {r.pmid && <span className="font-mono">PMID {r.pmid}</span>}
        {r.nct && <span className="font-mono">{r.nct}</span>}
        {r.alsoIn.map((a) => (
          <a key={a.source} href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-fg">
            also in {SOURCE_NAME[a.source]} ↗
          </a>
        ))}
      </p>
    </li>
  );
}

/**
 * Live search across free official/open databases. Runs only when the user submits (no request on
 * every keystroke), cancels the previous search, and shows each source's status separately.
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [enabled, setEnabled] = useState<LiveSourceId[]>(LIVE_SOURCES.map((s) => s.id));
  const [results, setResults] = useState<LiveResult[] | null>(null);
  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [kind, setKind] = useState<LiveKind | 'all'>('all');
  const [sort, setSort] = useState<'relevance' | 'newest'>('relevance');
  const ctrl = useRef<AbortController | null>(null);
  const key = enabled.join(',');

  useEffect(() => setInput(q), [q]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setResults(null);
    setStates({});
    searchEverywhere(q.trim(), enabled, {
      signal: c.signal,
      onSource: (id, s) => !c.signal.aborted && setStates((prev) => ({ ...prev, [id]: s })),
    }).then((r) => !c.signal.aborted && setResults(r.results));
    return () => c.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, key]);

  const shown = useMemo(() => {
    const list = (results ?? []).filter((r) => kind === 'all' || r.kind === kind);
    return sort === 'newest' ? [...list].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '')) : list;
  }, [results, kind, sort]);

  const kinds = useMemo(() => {
    const c: Partial<Record<LiveKind, number>> = {};
    for (const r of results ?? []) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [results]);

  const loading = q.trim().length >= 2 && results === null;
  const submit = (value: string) => {
    const v = value.trim();
    setKind('all');
    setParams(v ? { q: v } : {}, { replace: false });
  };

  return (
    <>
      <PageHeader eyebrow="Live search · free official & open databases" title="Search everywhere">
        Search any topic, technology, gene, disease or project name across Europe PMC, PubMed, ClinicalTrials.gov and OpenAlex at once. Results come straight from each database, so they include records BioPulse has never collected.
      </PageHeader>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label className="relative block flex-1">
          <span className="sr-only">Search term</span>
          <input
            className="input h-12 pl-10 text-base"
            type="search"
            autoFocus
            placeholder="e.g. CRISPR base editing, CAR-T, mRNA vaccine…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={200}
          />
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-3.5 top-4 h-4 w-4 text-fg-subtle" fill="currentColor" aria-hidden>
            <path d="M8.5 3a5.5 5.5 0 014.38 8.82l3.65 3.65-1.06 1.06-3.65-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
        </label>
        <button type="submit" className="h-12 rounded-lg bg-accent px-6 text-sm font-semibold text-ink-950 transition hover:brightness-110 active:scale-[0.98]">
          Search
        </button>
      </form>

      <fieldset className="mt-3 flex flex-wrap items-center gap-2">
        <legend className="sr-only">Sources</legend>
        {LIVE_SOURCES.map((s) => {
          const on = enabled.includes(s.id);
          const st = states[s.id];
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              title={s.covers}
              onClick={() => setEnabled((e) => (on ? (e.length > 1 ? e.filter((x) => x !== s.id) : e) : [...e, s.id]))}
              className={`chip transition ${on ? 'border-accent/60 text-fg' : 'opacity-60'}`}
            >
              {s.name}
              {on && st?.status === 'loading' && <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-accent" aria-label="loading" />}
              {on && st?.status === 'ok' && <span className="ml-1 text-fg-subtle">{st.count}</span>}
              {on && st?.status === 'error' && <span className="ml-1 text-ev-reg">!</span>}
            </button>
          );
        })}
        <span className="text-xs text-fg-subtle">Free · no account needed</span>
      </fieldset>

      {Object.entries(states).some(([, s]) => s.status === 'error') && (
        <p className="mt-3 text-sm text-ev-preprint" role="status">
          {Object.entries(states)
            .filter(([, s]) => s.status === 'error')
            .map(([id, s]) => `${SOURCE_NAME[id as LiveSourceId]} could not be reached (${s.error})`)
            .join('; ')}
          . Results from the other sources are still shown.
        </p>
      )}

      <section className="mt-6" aria-live="polite">
        {q.trim().length < 2 && (
          <div className="card p-6">
            <p className="text-fg">Try a search:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((x) => (
                <button key={x} type="button" onClick={() => submit(x)} className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-fg-muted transition hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg">
                  {x}
                </button>
              ))}
            </div>
            <ul className="mt-5 grid grid-cols-1 gap-2 text-sm text-fg-muted sm:grid-cols-2">
              {LIVE_SOURCES.map((s) => (
                <li key={s.id}>
                  <span className="font-medium text-fg">{s.name}</span> — {s.covers}{' '}
                  <a href={s.docs} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-subtle hover:text-fg">
                    (API)
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {loading && (
          <div className="space-y-3" role="status">
            <span className="sr-only">Searching…</span>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24 rounded-2xl border border-ink-600/70" style={{ animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
        )}

        {results && (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-fg-muted">
                {shown.length} result{shown.length === 1 ? '' : 's'} for <strong className="text-fg">“{q}”</strong>
              </span>
              <span className="mx-1 text-fg-subtle">·</span>
              <button type="button" className={`chip ${kind === 'all' ? 'border-accent/60 text-fg' : ''}`} onClick={() => setKind('all')} aria-pressed={kind === 'all'}>
                All
              </button>
              {(Object.keys(kinds) as LiveKind[]).map((k) => (
                <button key={k} type="button" className={`chip ${kind === k ? 'border-accent/60 text-fg' : ''}`} onClick={() => setKind(k)} aria-pressed={kind === k}>
                  {KIND_LABEL[k].split(' · ')[0]} {kinds[k]}
                </button>
              ))}
              <select className="input ml-auto w-auto py-1 text-xs" value={sort} onChange={(e) => setSort(e.target.value as 'relevance' | 'newest')} aria-label="Sort results">
                <option value="relevance">Best match</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
            {shown.length === 0 ? (
              <EmptyState title="No results">Try a broader or differently spelled term, or switch on more sources.</EmptyState>
            ) : (
              <ul className="grid grid-cols-1 gap-3">
                {shown.map((r, i) => (
                  <ResultCard key={r.key} r={r} index={i} />
                ))}
              </ul>
            )}
            <p className="mt-6 text-xs text-fg-subtle">
              Live results are shown as each database describes them. BioPulse has not checked, classified or summarised them. “Peer-reviewed” is used only for journal articles marked as such by Europe PMC or PubMed; OpenAlex journal articles are labelled without a review claim. Up to 20 results per source; duplicates found in several databases are merged.
            </p>
          </>
        )}
      </section>
    </>
  );
}
