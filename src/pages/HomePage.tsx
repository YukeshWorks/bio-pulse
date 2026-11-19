import { Link } from 'react-router-dom';
import { EVIDENCE, EVIDENCE_ORDER } from '../../shared/evidence';
import { EV_DOT } from '../components/Badges';
import { BriefingHero, CategoryNav, CoverageBanner, DiscoveryCard, RecordRow, StaleBanner, StatusStrip, VerificationLine } from '../components/Home';
import { ErrorState, Loading } from '../components/States';
import { useLatest, useStatus } from '../lib/data';
import { useView } from '../lib/view';

/**
 * Homepage. Simple view: date + freshness, the one-sentence briefing, three top stories and a short
 * list of other new items. Detailed view adds coverage, evidence mix, verification counters and
 * per-source attribution.
 */
export function HomePage() {
  const latest = useLatest();
  const status = useStatus();
  const { detailed } = useView();
  const data = latest.data;
  const byId = new Map(data?.records.map((r) => [r.id, r]) ?? []);
  const featured = new Set(data?.topDiscoveries.map((d) => d.recordId));
  const more = [...(data?.records ?? [])].filter((r) => !featured.has(r.id)).sort((a, b) => b.score - a.score || b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <StatusStrip data={data} status={status.data} />
        <StaleBanner data={data} status={status.data} />
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

          {more.length > 0 && (
            <section aria-labelledby="latest-title" className="card p-4 sm:p-6">
              <div className="mb-1 flex items-end justify-between gap-2">
                <h2 id="latest-title" className="text-xl font-semibold tracking-tight">
                  Also new today
                </h2>
                <Link to="/latest" className="link text-sm">
                  See all {data.records.length} →
                </Link>
              </div>
              <ul>
                {more.map((r) => (
                  <RecordRow key={r.id} r={r} />
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="cat-title">
            <h2 id="cat-title" className="mb-3 text-xl font-semibold tracking-tight">
              Browse by field
            </h2>
            <CategoryNav counts={data.stats.byCategory} />
          </section>

          {detailed && data.records.length > 0 && (
            <section aria-labelledby="mix-title" className="card p-4 sm:p-5">
              <h2 id="mix-title" className="eyebrow">
                Evidence mix · {data.stats.total} published records
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
            {!detailed && ' · Switch to Detailed view (top right) for source health and evidence labels.'}
          </p>
        </>
      )}
    </div>
  );
}
