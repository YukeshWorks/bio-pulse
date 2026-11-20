import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID, categoryName } from '../../shared/categories';
import type { ArchiveIndex, BioRecord, DailyDataset } from '../../shared/schema';
import { matchTopic, useLibrary } from '../lib/library';
import { useInView } from '../lib/motion';
import { TopicManager } from '../pages/SavedPage';
import { RecordRow } from './Home';

/** Bar colour validated with the dataviz palette checker against the card surface (#0a1324, dark). */
const BAR = '#0fa596';

/**
 * "Today by field": ranked horizontal bars (one hue, largest first) of each record's PRIMARY field,
 * so the parts add up to today's total. Each row is a link to that field. When the archive has
 * at least 3 days of per-field counts, a small trend line shows the last 7 days.
 */
export function FieldChart({ data, index }: { data: DailyDataset; index: ArchiveIndex | null }) {
  const [ref, visible] = useInView<HTMLDivElement>();
  const counts = new Map<string, number>();
  for (const r of data.records) {
    const primary = r.classification?.primary ?? r.categories.find((c) => c !== 'patents-inventions') ?? r.categories[0];
    counts.set(primary, (counts.get(primary) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 10);
  const otherCount = ranked.slice(10).reduce((a, [, n]) => a + n, 0);
  const rows: [string, number][] = otherCount ? [...top, ['__other', otherCount]] : top;
  const max = Math.max(1, ...rows.map(([, n]) => n));
  const total = data.records.length;

  const days = (index?.days ?? []).filter((d) => d.byCategory).slice(0, 7).reverse(); // oldest -> newest
  const showTrend = days.length >= 3;

  if (!total) return null;
  return (
    <section aria-labelledby="fields-chart-title" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="fields-chart-title" className="text-xl font-semibold tracking-tight">
          Today by field
        </h2>
        <p className="text-sm text-fg-subtle">
          Main field of each of today’s {total} records{showTrend ? ' · line = last 7 days' : ''} ·{' '}
          <Link to="/categories" className="link">
            All fields
          </Link>
        </p>
      </div>
      <div ref={ref} className="mt-4 space-y-0.5" role="list">
        {rows.map(([id, n], i) => {
          const name = id === '__other' ? `${ranked.length - 10} other fields combined` : categoryName(id);
          const pct = Math.round((100 * n) / total);
          const trend = showTrend && id !== '__other' ? days.map((d) => d.byCategory?.[id] ?? 0) : null;
          const row = (
            <>
              <span className="w-full text-sm leading-snug text-fg-muted group-hover:text-fg sm:w-64 sm:shrink-0">{name}</span>
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="relative h-2.5 flex-1">
                  <span
                    className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-700 ease-out group-hover:brightness-125"
                    style={{ width: visible ? `${(100 * n) / max}%` : '0%', background: id === '__other' ? 'var(--color-ink-500)' : BAR, transitionDelay: `${i * 60}ms` }}
                  />
                </span>
                <span className="w-16 shrink-0 text-right text-sm tabular-nums text-fg">
                  {n} <span className="text-xs text-fg-subtle">{pct}%</span>
                </span>
                {showTrend && <span className="hidden w-16 shrink-0 sm:block">{trend && <Sparkline values={trend} label={`${name}, last ${days.length} days: ${trend.join(', ')}`} />}</span>}
              </span>
            </>
          );
          const cls = 'group flex flex-col gap-1 rounded-lg px-2 py-1.5 transition-colors hover:bg-ink-800/60 sm:flex-row sm:items-center sm:gap-4';
          const title = `${name}: ${n} of ${total} records (${pct}%)`;
          return id === '__other' || !CATEGORY_BY_ID[id] ? (
            <div key={id} role="listitem" className={cls} title={title}>
              {row}
            </div>
          ) : (
            <Link key={id} role="listitem" to={`/categories/${id}`} className={cls} title={`${title} — open this field`}>
              {row}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 64;
  const h = 18;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * (w - 4) + 2},${h - 2 - (v / max) * (h - 4)}`).join(' ');
  const last = pts.split(' ').at(-1)!.split(',');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[18px] w-16" role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={pts} fill="none" stroke="var(--color-fg-subtle)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={BAR} />
    </svg>
  );
}

/**
 * "For you": today's records matching the topics this reader follows (stored in their browser).
 * Without topics it invites the reader to follow some.
 */
export function ForYou({ records }: { records: BioRecord[] }) {
  const { topics } = useLibrary();
  if (topics.length === 0) {
    return (
      <section aria-labelledby="foryou-title" className="card relative overflow-hidden p-5 sm:p-6">
        <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full bg-signal/10 blur-3xl" aria-hidden />
        <h2 id="foryou-title" className="relative text-xl font-semibold tracking-tight">
          Make it yours
        </h2>
        <p className="relative mb-4 mt-1 text-sm text-fg-muted">Follow topics you care about and BioPulse will pick out today’s matching research for you. Private — stored only in this browser.</p>
        <div className="relative">
          <TopicManager compact />
        </div>
      </section>
    );
  }
  const perTopic = topics.map((t) => ({ topic: t, hits: matchTopic(records, t, categoryName) }));
  const seen = new Set<string>();
  const matches: { r: BioRecord; topic: string }[] = [];
  for (const { topic, hits } of perTopic) for (const r of hits) if (!seen.has(r.id)) seen.add(r.id) && matches.push({ r, topic });
  matches.sort((a, b) => b.r.score - a.r.score);

  return (
    <section aria-labelledby="foryou-title" className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="foryou-title" className="text-xl font-semibold tracking-tight">
          For you
        </h2>
        <Link to="/saved" className="text-sm text-fg-subtle hover:text-fg">
          Edit topics
        </Link>
      </div>
      <ul className="mt-3 flex flex-wrap gap-2">
        {perTopic.map(({ topic, hits }) => (
          <li key={topic}>
            <Link
              to={hits.length ? `/latest?q=${encodeURIComponent(topic)}` : `/search?q=${encodeURIComponent(topic)}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition hover:-translate-y-0.5 ${hits.length ? 'border-accent/50 bg-accent/10 text-fg' : 'border-ink-600 text-fg-subtle'}`}
              title={hits.length ? `See all ${hits.length} matches today` : `No matches today — search all databases for “${topic}”`}
            >
              {topic} <span className="tabular-nums">{hits.length}</span>
            </Link>
          </li>
        ))}
      </ul>
      {matches.length === 0 ? (
        <p className="mt-4 text-sm text-fg-muted">
          No matches in today’s records. Tap a topic to search all databases for it instead.
        </p>
      ) : (
        <ul className="mt-2">
          {matches.slice(0, 5).map(({ r }, i) => (
            <RecordRow key={r.id} r={r} index={i} />
          ))}
        </ul>
      )}
    </section>
  );
}
