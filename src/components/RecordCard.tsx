import { useState } from 'react';
import type { BioRecord } from '../../shared/schema';
import { authorsLine, formatDate } from '../lib/format';
import { useView } from '../lib/view';
import { BasisLabel, CategoryChip, EvidenceBadge, PatentNotice, PreprintWarning, TrialNotice } from './Badges';

const DATE_LABEL: Record<BioRecord['dateType'], string> = {
  published: 'Published',
  posted: 'Posted',
  indexed: 'Indexed',
  'first-posted': 'First posted',
  announced: 'Announced',
};

export function Identifiers({ r }: { r: BioRecord }) {
  const ids = r.identifiers;
  const items: { label: string; value: string; href?: string }[] = [];
  if (ids.doi) items.push({ label: 'DOI', value: ids.doi, href: `https://doi.org/${ids.doi}` });
  if (ids.pmid) items.push({ label: 'PMID', value: ids.pmid, href: `https://pubmed.ncbi.nlm.nih.gov/${ids.pmid}/` });
  if (ids.pmcid) items.push({ label: 'PMCID', value: ids.pmcid });
  if (ids.nct) items.push({ label: 'NCT', value: ids.nct, href: `https://clinicaltrials.gov/study/${ids.nct}` });
  if (ids.patentNumber) items.push({ label: 'Patent', value: ids.patentNumber });
  if (ids.publishedDoi) items.push({ label: 'Published as', value: ids.publishedDoi, href: `https://doi.org/${ids.publishedDoi}` });
  if (!items.length) return null;
  // Demonstration records use fictional identifiers: never link them to real resolvers.
  const demo = r.url.startsWith('https://example.org/');
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-fg-subtle">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 gap-1.5">
          <dt>{i.label}</dt>
          <dd className="min-w-0 truncate text-fg-muted">
            {i.href && !demo ? (
              <a href={i.href} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
                {i.value}
              </a>
            ) : (
              i.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RecordMeta({ r }: { r: BioRecord }) {
  return (
    <p className="text-xs text-fg-subtle">
      <span className="text-fg-muted">{authorsLine(r.authors, r.organization)}</span>
      {r.venue && <> · <span className="italic">{r.venue}</span></>}
      {' · '}
      {DATE_LABEL[r.dateType]} <time dateTime={r.date}>{formatDate(r.date)}</time>
    </p>
  );
}

export function SourceLink({ r, className = '' }: { r: BioRecord; className?: string }) {
  return (
    <a href={r.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-sm font-medium text-signal hover:text-fg ${className}`}>
      Read original on {r.source.name}
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M11 3h6v6h-2V6.41l-6.3 6.3-1.4-1.42L13.58 5H11V3zM5 5h4v2H5v8h8v-4h2v6H3V5h2z" />
      </svg>
    </a>
  );
}

const LINK_STATUS: Record<BioRecord['verification']['urlCheck'], { label: string; cls: string; title: string }> = {
  ok: { label: 'Link live-checked', cls: 'text-accent', title: 'The original URL responded successfully when BioPulse checked it during the daily run. This confirms the link works, not the science.' },
  restricted: { label: 'Link reachable (restricted)', cls: 'text-fg-muted', title: 'The source server responded but refused an automated check (e.g. 403/429). The link host and identifiers passed validation.' },
  unchecked: { label: 'Metadata validated · link not live-checked', cls: 'text-fg-subtle', title: 'Official host, HTTPS, identifier/URL consistency and date passed validation. BioPulse live-checks only the highest-ranked links each day.' },
  failed: { label: 'Link check failed', cls: 'text-ev-reg', title: 'The link could not be reached during the daily run (network error).' },
};

/** Verification status of a record: metadata validation vs live link check (never scientific verification). */
export function LinkStatus({ r }: { r: BioRecord }) {
  const s = LINK_STATUS[r.verification.urlCheck];
  return (
    <span className={`text-[11px] ${s.cls}`} title={s.title}>
      {r.verification.urlCheck === 'ok' ? '✓ ' : ''}
      {s.label}
    </span>
  );
}

function WhyCategory({ r }: { r: BioRecord }) {
  const c = r.classification;
  if (!c) return null;
  return (
    <details className="text-xs text-fg-subtle">
      <summary className="cursor-pointer hover:text-fg">
        Why this category? <span className={c.confidence === 'low' ? 'text-ev-preprint' : ''}>({c.confidence} confidence)</span>
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {Object.entries(c.matched).map(([id, m]) => (
          <li key={id}>
            <span className="text-fg-muted">{id}</span> — matched {m.terms.join(', ')} (score {m.score})
          </li>
        ))}
      </ul>
      <p className="mt-1">Assigned by transparent keyword/CPC rules ({c.method}), not by expert review.</p>
    </details>
  );
}

/** Everything beyond the plain summary: shown on demand ("More details") or always in Detailed mode. */
export function RecordDetails({ r }: { r: BioRecord }) {
  const { detailed } = useView();
  return (
    <div className="space-y-3 rounded-xl border border-ink-600/60 bg-ink-900/50 p-3 text-sm">
      {r.evidence === 'PREPRINT' && <PreprintWarning compact />}
      {r.evidence === 'PATENT APPLICATION' && <PatentNotice patent={r.patent} />}
      {r.evidence === 'CLINICAL TRIAL' && <TrialNotice status={r.trial?.status} />}
      <p className="text-fg-muted">
        {authorsLine(r.authors, r.organization)}
        {r.venue && <> · <span className="italic">{r.venue}</span></>}
      </p>
      {r.trial && (r.trial.phase?.length || r.trial.conditions?.length) ? (
        <p className="text-fg-muted">
          {r.trial.phase?.length ? <span className="mr-3">Phase: {r.trial.phase.join(', ')}</span> : null}
          {r.trial.conditions?.length ? <span>Conditions: {r.trial.conditions.slice(0, 4).join(', ')}</span> : null}
        </p>
      ) : null}
      <div>
        <p className="flex items-center gap-2 font-medium text-fg">
          Why it matters {detailed && <BasisLabel basis={r.whyItMatters.basis} />}
        </p>
        <p className="mt-0.5 text-fg-muted">{r.whyItMatters.text}</p>
      </div>
      <div>
        <p className="font-medium text-fg">Limitations</p>
        <ul className="mt-0.5 list-disc space-y-1 pl-5 text-fg-muted">
          {r.limitations.map((l, i) => (
            <li key={i}>
              {detailed && (
                <span className="mr-1.5 align-middle">
                  <BasisLabel basis={l.basis} />
                </span>
              )}
              {l.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.categories.map((c) => (
          <CategoryChip key={c} id={c} />
        ))}
      </div>
      <WhyCategory r={r} />
      <div className="flex flex-col gap-1 border-t border-ink-600/50 pt-2">
        <Identifiers r={r} />
        <LinkStatus r={r} />
        {r.alsoIndexedIn.map((a) => (
          <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-subtle hover:text-fg">
            Also in {a.name} ↗
          </a>
        ))}
        {detailed && <p className="text-xs text-fg-subtle">Evidence note: {r.evidenceNote}</p>}
      </div>
    </div>
  );
}

/**
 * Record card. Simple by default: plain evidence label, title, source/date, a two-line summary and
 * the original link. "More details" reveals authors, why it matters, limitations, identifiers,
 * link-check status and category reasoning. Detailed mode opens the details by default.
 */
export function RecordCard({ r, day, index = 0 }: { r: BioRecord; day?: string; index?: number }) {
  const { detailed } = useView();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? detailed;
  return (
    <article className="card card-hover flex flex-col gap-2.5 p-4 animate-rise sm:p-5" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceBadge evidence={r.evidence} patent={r.patent} />
        {day && <span className="ml-auto text-xs text-fg-subtle">archived {day}</span>}
      </div>
      <h3 className="text-[17px] font-semibold leading-snug text-fg">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
          {r.title}
        </a>
      </h3>
      <p className="text-sm text-fg-subtle">
        {r.source.name} · {DATE_LABEL[r.dateType].toLowerCase()} <time dateTime={r.date}>{formatDate(r.date)}</time>
      </p>
      <p className={`text-[15px] leading-relaxed text-fg-muted ${open ? '' : 'line-clamp-2'}`}>
        {detailed && (
          <span className="mr-1.5 align-middle">
            <BasisLabel basis={r.summary.basis} />
          </span>
        )}
        {r.summary.text}
      </p>
      {open && <RecordDetails r={r} />}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <SourceLink r={r} />
        <button type="button" onClick={() => setToggled(!open)} className="text-sm font-medium text-fg-subtle hover:text-fg" aria-expanded={open}>
          {open ? 'Less' : 'More details'}
        </button>
      </div>
    </article>
  );
}
