import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID } from '../../shared/categories';
import type { BioRecord, DailyDataset, Discovery, RunStatus, TextBasis } from '../../shared/schema';
import { formatDate, formatTimestamp, freshness, relativeAge, todayInIst } from '../lib/format';
import { useView } from '../lib/view';
import { PulseLine, useReveal, WordReveal } from '../lib/motion';
import { BasisLabel, EvidenceBadge } from './Badges';
import { RecordDetails, SourceLink } from './RecordCard';

/** One plain line: today's date and how fresh the data is. Technical detail only in Detailed mode. */
export function StatusStrip({ data, status }: { data: DailyDataset | null; status: RunStatus | null }) {
  const { detailed } = useView();
  const last = status?.lastSuccessfulUpdate ?? data?.generatedAt ?? null;
  const f = freshness(last);
  const failed = status?.sources.filter((s) => s.status === 'failed') ?? data?.sources.filter((s) => s.status === 'failed') ?? [];
  const dot = f === 'fresh' ? 'bg-accent animate-pulse-dot' : f === 'stale' ? 'bg-ev-preprint' : 'bg-ev-reg';
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
      <span>{formatDate(todayInIst(), { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      <span aria-hidden className="text-fg-subtle">·</span>
      <span className="inline-flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
        {last ? `Updated ${relativeAge(last)}` : 'Not updated yet'}
        {detailed && last && <span className="text-fg-subtle">({formatTimestamp(last)})</span>}
      </span>
      {failed.length > 0 && (
        <Link to="/about#source-status" className="text-fg-subtle underline decoration-dotted hover:text-fg">
          {detailed ? `${failed.length} source${failed.length > 1 ? 's' : ''} failed in the last run` : 'Some sources were unavailable'}
        </Link>
      )}
    </p>
  );
}

export function StaleBanner({ data, status }: { data: DailyDataset | null; status: RunStatus | null }) {
  const last = status?.lastSuccessfulUpdate ?? data?.generatedAt ?? null;
  const f = freshness(last);
  if (f === 'fresh' || f === 'unknown') {
    if (status?.outcome === 'preserved-previous' && status.lastAttemptDate !== status.lastSuccessfulDate) {
      return <Banner tone="warn">Today’s update could not get reliable data, so you are seeing the last good update.</Banner>;
    }
    return null;
  }
  return <Banner tone={f === 'very-stale' ? 'danger' : 'warn'}>This page is out of date — the last successful update was {last ? relativeAge(last) : 'unknown'}.</Banner>;
}

function Banner({ tone, children }: { tone: 'warn' | 'danger'; children: React.ReactNode }) {
  const cls = tone === 'danger' ? 'border-ev-reg/40 bg-ev-reg/10 text-ev-reg' : 'border-ev-preprint/40 bg-ev-preprint/10 text-ev-preprint';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`} role="status">
      {children}
    </div>
  );
}

export function BriefingHero({ data }: { data: DailyDataset }) {
  const { detailed } = useView();
  const byId = new Map(data.records.map((r) => [r.id, r]));
  const cited = data.briefing.citations.map((id) => byId.get(id)).filter((r): r is BioRecord => Boolean(r));
  return (
    <section aria-labelledby="briefing-title" className="card relative overflow-hidden p-5 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      <div className="relative">
        <div className="flex items-center gap-4">
          <h2 id="briefing-title" className="shrink-0 text-sm font-semibold text-accent">
            Today in biotech, in one sentence
          </h2>
          {/* Decorative heartbeat on its own row so it never overlaps text. */}
          <PulseLine className="h-8 w-36 min-w-0 shrink text-accent/80 sm:w-56" />
        </div>
        {data.briefing.sentence ? (
          <>
            <p className="mt-3 max-w-4xl text-[21px] font-medium leading-snug text-fg sm:text-[26px]">
              <WordReveal text={data.briefing.sentence} />
            </p>
            <p className="mt-4 text-sm text-fg-subtle">Based on: </p>
            <ol className="mt-1 space-y-1">
              {cited.map((r, i) => (
                <li key={r.id} className="text-sm">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" aria-label={`Source ${i + 1}: ${r.title}`} className="text-signal hover:text-fg">
                    {i + 1}. {r.title}
                  </a>{' '}
                  <span className="text-fg-subtle">— {r.source.name}</span>
                </li>
              ))}
            </ol>
            {detailed && (
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-fg-subtle">
                <BasisLabel basis={data.briefing.method === 'ai' ? 'ai' : 'metadata'} />
                {data.briefing.note}
                <span aria-hidden>·</span>
                <AiStatus ai={data.ai} />
              </p>
            )}
          </>
        ) : (
          <div className="mt-3">
            <p className="text-[21px] leading-snug text-fg-muted sm:text-[26px]">No qualifying updates were found for this date.</p>
            <p className="mt-3 max-w-2xl text-sm text-fg-subtle">
              BioPulse only writes a headline when real, checked sources support it. See the{' '}
              <Link to="/archive" className="link">
                daily archive
              </Link>{' '}
              for earlier days.
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

/** A top story: simple at first glance, the six-question breakdown and full details on demand. */
export function DiscoveryCard({ d, r }: { d: Discovery; r: BioRecord }) {
  const { detailed } = useView();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? detailed;
  const reveal = useReveal<HTMLElement>((d.rank - 1) * 110);
  return (
    <article ref={reveal.ref} className={`card card-hover flex flex-col gap-2.5 p-5 ${reveal.className}`} style={reveal.style}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg-subtle">Story {d.rank}</span>
        <EvidenceBadge evidence={r.evidence} patent={r.patent} />
      </div>
      <h3 className="text-[18px] font-semibold leading-snug text-fg">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
          {r.title}
        </a>
      </h3>
      <p className="text-sm text-fg-subtle">
        {r.source.name} · {formatDate(r.date)}
        {r.categories[0] && r.categories[0] !== 'patents-inventions' ? ` · ${CATEGORY_BY_ID[r.categories[0]]?.name ?? ''}` : ''}
      </p>
      <p className={`text-[15px] leading-relaxed text-fg-muted ${open ? '' : 'line-clamp-3'}`}>{r.summary.text}</p>
      {open && (
        <div className="animate-expand space-y-3">
          <dl className="mt-1 space-y-3">
            {QUESTIONS.map(([k, q]) => (
              <Answer key={k} q={q} text={d.analysis[k].text} basis={d.analysis[k].basis} showBasis={detailed} />
            ))}
          </dl>
          <RecordDetails r={r} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        <SourceLink r={r} />
        <button type="button" onClick={() => setToggled(!open)} className="text-sm font-medium text-fg-subtle hover:text-fg" aria-expanded={open}>
          {open ? 'Less' : 'More details'}
        </button>
      </div>
    </article>
  );
}

function Answer({ q, text, basis, showBasis }: { q: string; text: string; basis: TextBasis; showBasis: boolean }) {
  return (
    <div>
      <dt className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
        {q} {showBasis && <BasisLabel basis={basis} />}
      </dt>
      <dd className={`mt-0.5 text-sm leading-relaxed ${basis === 'unavailable' ? 'italic text-fg-subtle' : 'text-fg-muted'}`}>{text}</dd>
    </div>
  );
}

/** Compact one-line list of further records for the homepage. */
export function RecordRow({ r, index = 0 }: { r: BioRecord; index?: number }) {
  const reveal = useReveal<HTMLLIElement>(index * 45);
  return (
    <li
      ref={reveal.ref}
      style={reveal.style}
      className={`group flex flex-col gap-1 border-b border-ink-600/50 py-3 transition-colors last:border-0 hover:bg-ink-800/40 sm:flex-row sm:items-baseline sm:gap-4 sm:rounded-lg sm:px-2 ${reveal.className}`}
    >
      <span className="shrink-0 sm:w-56">
        <EvidenceBadge evidence={r.evidence} patent={r.patent} />
      </span>
      <span className="min-w-0 flex-1">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[15px] font-medium leading-snug text-fg hover:text-signal">
          {r.title}
          <span aria-hidden className="ml-1 inline-block text-signal opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100">
            ↗
          </span>
        </a>
        <span className="block text-xs text-fg-subtle">
          {r.source.name} · {formatDate(r.date)}
        </span>
      </span>
    </li>
  );
}

export function CategoryNav({ counts }: { counts: Record<string, number> }) {
  const ids = Object.keys(CATEGORY_BY_ID).filter((id) => counts[id]);
  return (
    <div className="flex flex-wrap gap-2">
      {ids.map((id) => (
        <Link key={id} to={`/categories/${id}`} className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-fg-muted transition duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg">
          {CATEGORY_BY_ID[id].name} <span className="text-fg-subtle">{counts[id]}</span>
        </Link>
      ))}
      <Link to="/categories" className="px-2 py-1.5 text-sm text-signal hover:text-fg">
        All fields →
      </Link>
    </div>
  );
}

/** Partial-coverage warning (Detailed mode). */
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
    <div className="rounded-xl border border-ink-600 bg-ink-850/70 px-4 py-3 text-sm text-fg-muted" role="note">
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
