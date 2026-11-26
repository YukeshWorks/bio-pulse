import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { EVIDENCE, EVIDENCE_ORDER } from '../../shared/evidence';
import { EV_DOT } from '../components/Badges';
import { BriefingHero, CoverageBanner, DiscoveryCard, RecordRow, StaleBanner, StatusStrip, VerificationLine } from '../components/Home';
import { ErrorState, Loading } from '../components/States';
import { useArchiveIndex, useLatest, useStatus } from '../lib/data';
import { FieldChart, ForYou } from '../components/Insights';
import { useView } from '../lib/view';
import { CountUp, useInView } from '../lib/motion';

/**
 * Homepage. Simple view: date + freshness, the one-sentence briefing, three top stories and a short
 * list of other new items. Detailed view adds coverage, evidence mix, verification counters and
 * per-source attribution.
 */
export function HomePage() {
  const latest = useLatest();
  const status = useStatus();
  const archive = useArchiveIndex();
  const { detailed } = useView();
  const data = latest.data;
  const byId = new Map(data?.records.map((r) => [r.id, r]) ?? []);
  const featured = new Set(data?.topDiscoveries.map((d) => d.recordId));
  const more = [...(data?.records ?? [])].filter((r) => !featured.has(r.id)).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Biotech news today</h1>
        <StatusStrip data={data} status={status.data} />
        <StaleBanner data={data} status={status.data} />
        <QuickSearch />
      </div>

      {latest.loading && <Loading />}
      {latest.error && <ErrorState error={latest.error} />}

      {data && (
        <>
          <BriefingHero data={data} />
          {detailed && <CoverageBanner data={data} />}

          {data.topDiscoveries.length > 0 && (
            <section aria-labelledby="top-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h2 id="top-title" className="text-xl font-semibold tracking-tight">
                  Top stories
                </h2>
                <Link to="/about#ranking" className="text-sm text-fg-subtle hover:text-fg">
                  How are these picked?
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {data.topDiscoveries.map((d) => {
                  const r = byId.get(d.recordId);
                  return r ? <DiscoveryCard key={d.recordId} d={d} r={r} /> : null;
                })}
              </div>
            </section>
          )}

          <ForYou records={data.records} />

          {more.length > 0 && (
            <section aria-labelledby="latest-title" className="card p-4 sm:p-6">
              <div className="mb-1 flex items-end justify-between gap-2">
                <h2 id="latest-title" className="text-xl font-semibold tracking-tight">
                  Also new today
                </h2>
                <Link to="/latest" className="link text-sm">
                  See all <CountUp value={data.records.length} /> →
                </Link>
              </div>
              <ul>
                {more.map((r, i) => (
                  <RecordRow key={r.id} r={r} index={i} />
                ))}
              </ul>
            </section>
          )}

          <FieldChart data={data} index={archive.data} />

          {detailed && data.records.length > 0 && (
            <section aria-labelledby="mix-title" className="card p-4 sm:p-5">
              <h2 id="mix-title" className="eyebrow">
                Evidence mix · {data.stats.total} published records
              </h2>
              <EvidenceBar byEvidence={data.stats.byEvidence} total={data.stats.total} />
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-fg-muted">
                {EVIDENCE_ORDER.filter((e) => data.stats.byEvidence[e]).map((e) => (
                  <li key={e} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${EV_DOT[e]}`} aria-hidden />
                    {EVIDENCE[e].short} <span className="font-mono text-fg">{data.stats.byEvidence[e]}</span>
                  </li>
                ))}
              </ul>
              <VerificationLine data={data} />
              <ul className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                {data.sources.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-600/50 px-3 py-2">
                    <span className="min-w-0 truncate text-fg-muted">{s.name}</span>
                    <span className={`shrink-0 font-mono text-[11px] ${s.status === 'ok' ? 'text-accent' : s.status === 'failed' ? 'text-ev-reg' : 'text-fg-subtle'}`}>
                      {s.status === 'ok' ? `${s.accepted} used` : s.status}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-sm text-fg-subtle">
            Data from PubMed, Europe PMC, bioRxiv, medRxiv, ClinicalTrials.gov, the FDA and EMA. Every item links to its original source.{' '}
            <Link to="/about" className="link">
              How BioPulse works
            </Link>
            {' · '}
            <a href={`${import.meta.env.BASE_URL}data/feed.xml`} className="link">
              Subscribe (RSS)
            </a>
            {' · Tip: press “/” to search.'}
            {!detailed && ' Switch to Detailed view (top right) for source health and evidence labels.'}
          </p>
        </>
      )}
    </div>
  );
}

/** Evidence mix bar: segments grow from zero when the bar scrolls into view. */
function EvidenceBar({ byEvidence, total }: { byEvidence: Record<string, number>; total: number }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label="Evidence mix">
      {EVIDENCE_ORDER.filter((e) => byEvidence[e]).map((e, i) => (
        <span
          key={e}
          className={`${EV_DOT[e]} transition-[width] duration-700 ease-out`}
          style={{ width: visible ? `${(100 * byEvidence[e]) / total}%` : '0%', transitionDelay: `${i * 80}ms` }}
          title={`${e}: ${byEvidence[e]}`}
        />
      ))}
    </div>
  );
}

/** Homepage entry point to live search across all free databases. */
function QuickSearch() {
  const [q, setQ] = useState('');
  const nav = useNavigate();
  return (
    <form
      role="search"
      className="flex max-w-2xl gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label className="flex-1">
        <span className="sr-only">Search all sources</span>
        <input className="input h-11 text-[15px]" type="search" placeholder="Search all sources — any topic, gene or project name" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button type="submit" className="h-11 rounded-lg bg-accent px-5 text-sm font-semibold text-ink-950 transition hover:brightness-110 active:scale-[0.98]">
        Search
      </button>
    </form>
  );
}
