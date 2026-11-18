import { Link } from 'react-router-dom';
import { EVIDENCE_ORDER } from '../../shared/evidence';
import { BriefingHero, CategoryNav, DiscoveryCard, StaleBanner, StatusStrip } from '../components/Home';
import { EV_DOT } from '../components/Badges';
import { RecordCard } from '../components/RecordCard';
import { ErrorState, Loading } from '../components/States';
import { useLatest, useStatus } from '../lib/data';

export function HomePage() {
  const latest = useLatest();
  const status = useStatus();
  const data = latest.data;
  const byId = new Map(data?.records.map((r) => [r.id, r]) ?? []);
  const featured = new Set(data?.topDiscoveries.map((d) => d.recordId));
  const recent = [...(data?.records ?? [])].filter((r) => !featured.has(r.id)).sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score).slice(0, 6);

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <StatusStrip data={data} status={status.data} />
        <StaleBanner data={data} status={status.data} />
      </div>

      {latest.loading && <Loading />}
      {latest.error && <ErrorState error={latest.error} />}

      {data && (
        <>
          <BriefingHero data={data} />

          {data.topDiscoveries.length > 0 && (
            <section aria-labelledby="top-title">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="eyebrow">Ranked by evidence strength and metadata completeness</p>
                  <h2 id="top-title" className="mt-1 text-xl font-semibold tracking-tight">
                    Three most important updates
                  </h2>
                </div>
                <Link to="/about#ranking" className="text-xs text-fg-subtle hover:text-fg">
                  How are these chosen?
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

          {data.records.length > 0 && (
            <section aria-labelledby="mix-title" className="card p-4 sm:p-5">
              <h2 id="mix-title" className="eyebrow">
                Evidence mix · {data.stats.total} verified records
              </h2>
              <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label="Evidence mix">
                {EVIDENCE_ORDER.filter((e) => data.stats.byEvidence[e]).map((e) => (
                  <span key={e} className={EV_DOT[e]} style={{ width: `${(100 * data.stats.byEvidence[e]) / data.stats.total}%` }} title={`${e}: ${data.stats.byEvidence[e]}`} />
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-fg-muted">
                {EVIDENCE_ORDER.filter((e) => data.stats.byEvidence[e]).map((e) => (
                  <li key={e} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${EV_DOT[e]}`} aria-hidden />
                    {e.toLowerCase()} <span className="font-mono text-fg">{data.stats.byEvidence[e]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {recent.length > 0 && (
            <section aria-labelledby="latest-title">
              <div className="mb-4 flex items-end justify-between gap-2">
                <h2 id="latest-title" className="text-xl font-semibold tracking-tight">
                  Latest research & invention updates
                </h2>
                <Link to="/latest" className="link text-sm">
                  All {data.records.length} →
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {recent.map((r, i) => (
                  <RecordCard key={r.id} r={r} index={i} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="cat-title">
            <h2 id="cat-title" className="mb-4 text-xl font-semibold tracking-tight">
              Browse by field
            </h2>
            <CategoryNav counts={data.stats.byCategory} />
          </section>

          <section aria-labelledby="attr-title" className="card p-5">
            <h2 id="attr-title" className="eyebrow">
              Scientific source attribution
            </h2>
            <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {data.sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-ink-600/50 px-3 py-2">
                  <span className="min-w-0 truncate text-fg-muted">{s.name}</span>
                  <span className={`shrink-0 font-mono text-[11px] ${s.status === 'ok' ? 'text-accent' : s.status === 'failed' ? 'text-ev-reg' : 'text-fg-subtle'}`}>
                    {s.status === 'ok' ? `${s.accepted} used` : s.status}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-subtle">
              Records are metadata from public APIs and official feeds; summaries are short attributed excerpts. Full sources and methodology on{' '}
              <Link to="/about" className="link">
                About & Sources
              </Link>
              .
            </p>
          </section>
        </>
      )}
    </div>
  );
}
