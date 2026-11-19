import { Link, useParams } from 'react-router-dom';
import { EVIDENCE_ORDER } from '../../shared/evidence';
import { EV_DOT } from '../components/Badges';
import { BriefingHero, DiscoveryCard } from '../components/Home';
import { PageHeader } from '../components/Layout';
import { RecordCard } from '../components/RecordCard';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { useArchiveDay, useArchiveIndex } from '../lib/data';
import { Reveal } from '../lib/motion';
import { formatDate, formatTimestamp } from '../lib/format';

export function ArchivePage() {
  const index = useArchiveIndex();
  return (
    <>
      <PageHeader eyebrow="History" title="Daily Archive">
        Every successful daily update is preserved as a dated JSON file. Failed runs never overwrite an archived day.
      </PageHeader>
      {index.loading && <Loading />}
      {index.error && <ErrorState error={index.error} />}
      {index.data && index.data.days.length === 0 && <EmptyState title="The archive is empty">The first archived day will appear after the first successful pipeline run.</EmptyState>}
      {index.data && index.data.days.length > 0 && (
        <ol className="grid grid-cols-1 gap-3">
          {index.data.days.map((d, i) => (
            <Reveal as="li" key={d.date} delay={(i % 8) * 40}>
              <Link to={`/archive/${d.date}`} className="card card-hover flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="shrink-0 sm:w-40">
                  <p className="font-mono text-sm text-fg">{d.date}</p>
                  <p className="text-xs text-fg-subtle">{formatDate(d.date, { weekday: 'long' })}</p>
                </div>
                <p className="min-w-0 flex-1 text-sm text-fg-muted">{d.briefing ?? <span className="italic text-fg-subtle">No qualifying updates were found.</span>}</p>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex h-1.5 w-24 overflow-hidden rounded-full bg-ink-700" aria-hidden>
                    {EVIDENCE_ORDER.filter((e) => d.byEvidence[e]).map((e) => (
                      <span key={e} className={EV_DOT[e]} style={{ width: `${(100 * d.byEvidence[e]) / Math.max(d.total, 1)}%` }} />
                    ))}
                  </div>
                  <span className="font-mono text-xs text-fg-muted">{d.total} records</span>
                </div>
              </Link>
            </Reveal>
          ))}
        </ol>
      )}
    </>
  );
}

export function ArchiveDayPage() {
  const { date } = useParams();
  const day = useArchiveDay(date);
  const data = day.data;
  const byId = new Map(data?.records.map((r) => [r.id, r]) ?? []);
  return (
    <>
      <PageHeader eyebrow={<Link to="/archive" className="hover:text-fg">← Daily Archive</Link>} title={date ? formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Archive'}>
        {data && <>Generated {formatTimestamp(data.generatedAt)} · window {data.window.from} → {data.window.to} · {data.stats.total} records</>}
      </PageHeader>
      {day.loading && <Loading />}
      {day.error && <ErrorState error={day.error} />}
      {data && (
        <div className="space-y-8">
          <BriefingHero data={data} />
          {data.topDiscoveries.length > 0 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {data.topDiscoveries.map((d) => {
                const r = byId.get(d.recordId);
                return r ? <DiscoveryCard key={d.recordId} d={d} r={r} /> : null;
              })}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[...data.records].sort((a, b) => b.score - a.score).map((r, i) => (
              <RecordCard key={r.id} r={r} index={i} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
