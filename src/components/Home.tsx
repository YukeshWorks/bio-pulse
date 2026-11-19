import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID } from '../../shared/categories';
import type { BioRecord, DailyDataset, Discovery, RunStatus, TextBasis } from '../../shared/schema';
import { formatDate, formatTimestamp, freshness, relativeAge, todayInIst } from '../lib/format';
import { BasisLabel, CategoryChip, EvidenceBadge, PatentNotice, PreprintWarning, TrialNotice } from './Badges';
import { Identifiers, RecordMeta, SourceLink } from './RecordCard';

export function StatusStrip({ data, status }: { data: DailyDataset | null; status: RunStatus | null }) {
  const last = status?.lastSuccessfulUpdate ?? data?.generatedAt ?? null;
  const f = freshness(last);
  const failed = status?.sources.filter((s) => s.status === 'failed') ?? data?.sources.filter((s) => s.status === 'failed') ?? [];
  const dot = f === 'fresh' ? 'bg-accent animate-pulse-dot' : f === 'stale' ? 'bg-ev-preprint' : 'bg-ev-reg';
  return (
    <div className="flex flex-col gap-3 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
      <div className="flex items-center gap-2">
        <span className="eyebrow">Today</span>
        <span className="font-medium text-fg">{formatDate(todayInIst(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
        <span className="text-fg-subtle">(IST)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span className="eyebrow">Last successful update</span>
        <span className="text-fg">{last ? formatTimestamp(last) : '—'}</span>
        {last && <span className="text-fg-subtle">({relativeAge(last)})</span>}
      </div>
      {failed.length > 0 && (
        <Link to="/about#source-status" className="flex items-center gap-1.5 text-ev-preprint hover:underline">
          ⚠ {failed.length} source{failed.length > 1 ? 's' : ''} failed in the last run
        </Link>
      )}
    </div>
  );
}

export function StaleBanner({ data, status }: { data: DailyDataset | null; status: RunStatus | null }) {
  const last = status?.lastSuccessfulUpdate ?? data?.generatedAt ?? null;
  const f = freshness(last);
  if (f === 'fresh' || f === 'unknown') {
    if (status?.outcome === 'preserved-previous' && status.lastAttemptDate !== status.lastSuccessfulDate) {
      return <Banner tone="warn">The most recent run ({formatTimestamp(status.lastAttempt)}) could not fetch reliable data. Showing the last successful update instead. {status.message}</Banner>;
    }
    return null;
  }
  return (
    <Banner tone={f === 'very-stale' ? 'danger' : 'warn'}>
      Stale data: the last successful update was {last ? relativeAge(last) : 'unknown'}. Scheduled updates may be failing{status?.message ? ` — ${status.message}` : ''}.
    </Banner>
  );
}

function Banner({ tone, children }: { tone: 'warn' | 'danger'; children: React.ReactNode }) {
  const cls = tone === 'danger' ? 'border-ev-reg/40 bg-ev-reg/10 text-ev-reg' : 'border-ev-preprint/40 bg-ev-preprint/10 text-ev-preprint';
  return (
    <div className={`mb-6 rounded-xl border px-4 py-3 text-sm ${cls}`} role="status">
      {children}
    </div>
  );
}

export function BriefingHero({ data }: { data: DailyDataset }) {
  const byId = new Map(data.records.map((r) => [r.id, r]));
  const cited = data.briefing.citations.map((id) => byId.get(id)).filter((r): r is BioRecord => Boolean(r));
  return (
    <section aria-labelledby="briefing-title" className="card grid-bg relative overflow-hidden p-5 sm:p-8 animate-rise">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="briefing-title" className="eyebrow text-accent">
            Today&apos;s biotechnology in one sentence
          </h2>
          <span className="font-mono text-[10.5px] text-fg-subtle">· {formatDate(data.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        </div>
        {data.briefing.sentence ? (
          <>
            <p className="mt-4 font-serif text-[22px] font-medium leading-snug text-fg sm:text-[30px] sm:leading-[1.25]">
              {data.briefing.sentence}
              {cited.map((r, i) => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="ml-1 align-super font-mono text-xs text-accent hover:text-fg" title={`Source ${i + 1}: ${r.title}`} aria-label={`Source ${i + 1}: ${r.title}`}>
                  [{i + 1}]
                </a>
              ))}
            </p>
            <ol className="mt-5 space-y-1.5">
              {cited.map((r, i) => (
                <li key={r.id} className="flex flex-col gap-1 text-xs text-fg-muted sm:flex-row sm:items-center sm:gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-accent">[{i + 1}]</span>
                    <EvidenceBadge evidence={r.evidence} patent={r.patent} />
                  </span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate hover:text-fg">
                    {r.title} — {r.source.name}
                  </a>
                </li>
              ))}
            </ol>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
              <BasisLabel basis={data.briefing.method === 'ai' ? 'ai' : 'metadata'} />
              {data.briefing.note}
              <span aria-hidden>·</span>
              <AiStatus ai={data.ai} />
            </p>
          </>
        ) : (
          <div className="mt-4">
            <p className="font-serif text-[22px] leading-snug text-fg-muted sm:text-[28px]">No qualifying updates were found for this date.</p>
            <p className="mt-3 max-w-2xl text-sm text-fg-subtle">
              BioPulse only publishes a headline when it is supported by verified source records. {data.notice ?? ''} Browse the{' '}
              <Link to="/archive" className="link">
                daily archive
              </Link>{' '}
              for earlier updates.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

const QUESTIONS: [keyof Discovery['analysis'], string][] = [
  ['whatHappened', 'What happened?'],
  ['whatWasDeveloped', 'What was developed?'],
  ['whatIsNew', 'What is new?'],
  ['whyImportant', 'Why is it important?'],
  ['limitations', 'What are the limitations?'],
  ['whatNext', 'What could happen next?'],
];

export function DiscoveryCard({ d, r }: { d: Discovery; r: BioRecord }) {
  return (
    <article className="card flex flex-col p-5 animate-rise" style={{ animationDelay: `${d.rank * 70}ms` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-3xl font-medium text-ink-500" aria-label={`Rank ${d.rank}`}>
          0{d.rank}
        </span>
        <EvidenceBadge evidence={r.evidence} patent={r.patent} />
      </div>
      <h3 className="mt-3 text-[15.5px] font-semibold leading-snug text-fg">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
          {r.title}
        </a>
      </h3>
      <div className="mt-2">
        <RecordMeta r={r} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {r.categories.map((c) => (
          <CategoryChip key={c} id={c} />
        ))}
      </div>
      <div className="mt-3">
        {r.evidence === 'PREPRINT' && <PreprintWarning compact />}
        {r.evidence === 'PATENT APPLICATION' && <PatentNotice patent={r.patent} />}
        {r.evidence === 'CLINICAL TRIAL' && <TrialNotice status={r.trial?.status} />}
      </div>
      <details className="group mt-3" open={d.rank === 1}>
        <summary className="cursor-pointer list-none text-xs font-medium text-fg-subtle hover:text-fg">
          <span className="group-open:hidden">+ Evidence breakdown (6 questions)</span>
          <span className="hidden group-open:inline">− Hide breakdown</span>
        </summary>
        <dl className="mt-3 space-y-3">
          {QUESTIONS.map(([k, q]) => (
            <Answer key={k} q={q} text={d.analysis[k].text} basis={d.analysis[k].basis} />
          ))}
        </dl>
      </details>
      <div className="mt-auto flex flex-col gap-2 border-t border-ink-600/50 pt-3">
        <Identifiers r={r} />
        <SourceLink r={r} />
      </div>
    </article>
  );
}

function Answer({ q, text, basis }: { q: string; text: string; basis: TextBasis }) {
  return (
    <div>
      <dt className="flex flex-wrap items-center gap-2 text-xs font-semibold text-fg">
        {q} <BasisLabel basis={basis} />
      </dt>
      <dd className={`mt-1 text-[13px] leading-relaxed ${basis === 'unavailable' ? 'italic text-fg-subtle' : 'text-fg-muted'}`}>{text}</dd>
    </div>
  );
}

export function CategoryNav({ counts }: { counts: Record<string, number> }) {
  const ids = Object.keys(CATEGORY_BY_ID);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {ids.map((id) => (
        <Link key={id} to={`/categories/${id}`} className="card card-hover flex items-center justify-between gap-2 px-3 py-2.5">
          <span className="min-w-0 truncate text-[13px] text-fg-muted">{CATEGORY_BY_ID[id].short}</span>
          <span className={`font-mono text-xs ${counts[id] ? 'text-accent' : 'text-fg-subtle'}`}>{counts[id] ?? 0}</span>
        </Link>
      ))}
    </div>
  );
}

/**
 * Partial-coverage warning: lists source families that failed, were skipped or contributed nothing
 * today, so readers know what the day's picture does NOT include.
 */
export function CoverageBanner({ data }: { data: DailyDataset }) {
  const missing = data.sources.filter((s) => s.status === 'failed' || s.status === 'skipped' || s.accepted === 0);
  if (missing.length === 0) return null;
  const why = (s: DailyDataset['sources'][number]) =>
    s.status === 'failed'
      ? 'failed'
      : s.status === 'skipped'
        ? 'not configured'
        : s.fetched === 0
          ? 'no new items'
          : s.capped
            ? 'cut by daily cap'
            : s.rejectReasons
              ? 'none passed checks'
              : 'none published'; // v1 status files do not record why
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-850/70 px-4 py-3 text-xs text-fg-muted" role="note">
      <span className="font-semibold text-fg">Coverage incomplete today.</span> No records from:{' '}
      {missing.map((s, i) => (
        <span key={s.id}>
          {i > 0 && ', '}
          {s.name} <span className="text-fg-subtle">({why(s)})</span>
        </span>
      ))}
      .{' '}
      <Link to="/about#source-status" className="link">
        Source health
      </Link>
    </div>
  );
}

export function VerificationLine({ data }: { data: DailyDataset }) {
  const v = data.verificationSummary;
  if (!v) return <p className="mt-3 text-xs text-fg-subtle">{data.stats.total} records passed metadata validation (official host, HTTPS, identifiers, dates).</p>;
  return (
    <p className="mt-3 text-xs text-fg-subtle" title="Metadata validation and link checks confirm that a record and its link are genuine. They do not verify the scientific claims.">
      {v.collected} collected → {v.metadataValidated} passed metadata validation → {v.published} published · links live-checked: {v.linkOk} ok
      {v.linkRestricted ? `, ${v.linkRestricted} restricted` : ''}, {v.linkNotChecked} not checked. Checks confirm records and links, not scientific claims.
    </p>
  );
}

const AI_LABEL: Record<string, string> = {
  disabled: 'AI off (no API key) — deterministic text',
  'not-needed': 'AI not needed',
  used: 'AI used',
  partial: 'AI used; some fields replaced by deterministic text after failing validation',
  fallback: 'AI output rejected — deterministic text used',
  failed: 'AI request failed — deterministic text used',
};

export function AiStatus({ ai }: { ai: DailyDataset['ai'] }) {
  const status = ai.status ?? (ai.used ? 'used' : ai.enabled ? 'fallback' : 'disabled');
  return (
    <span className="text-[11px] text-fg-subtle" title={ai.note}>
      {AI_LABEL[status]}
      {ai.model && status !== 'disabled' ? ` · ${ai.model}` : ''}
      {ai.failure ? ` · ${ai.failure}` : ''}
    </span>
  );
}
