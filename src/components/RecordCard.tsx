import { useState } from 'react';
import type { BioRecord } from '../../shared/schema';
import { authorsLine, formatDate } from '../lib/format';
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
    <a href={r.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 text-xs font-medium text-signal hover:text-fg ${className}`}>
      View original on {r.source.name}
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
        <path d="M11 3h6v6h-2V6.41l-6.3 6.3-1.4-1.42L13.58 5H11V3zM5 5h4v2H5v8h8v-4h2v6H3V5h2z" />
      </svg>
    </a>
  );
}

export function RecordCard({ r, day, index = 0 }: { r: BioRecord; day?: string; index?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <article className="card card-hover flex flex-col gap-3 p-4 animate-rise sm:p-5" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
      <div className="flex flex-wrap items-center gap-2">
        <EvidenceBadge evidence={r.evidence} patent={r.patent} />
        {r.categories.map((c) => (
          <CategoryChip key={c} id={c} />
        ))}
        {day && <span className="ml-auto font-mono text-[10.5px] text-fg-subtle">archived {day}</span>}
      </div>
      <h3 className="text-[15.5px] font-semibold leading-snug text-fg sm:text-base">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="hover:text-signal">
          {r.title}
        </a>
      </h3>
      <RecordMeta r={r} />
      {r.evidence === 'PREPRINT' && <PreprintWarning compact />}
      {r.evidence === 'PATENT APPLICATION' && <PatentNotice patent={r.patent} />}
      {r.evidence === 'CLINICAL TRIAL' && <TrialNotice status={r.trial?.status} />}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="eyebrow">Summary</span>
          <BasisLabel basis={r.summary.basis} />
        </div>
        <p className={`text-sm leading-relaxed text-fg-muted ${r.summary.basis === 'source' ? 'border-l-2 border-ink-500 pl-3' : ''}`}>{r.summary.text}</p>
      </div>
      {r.trial && (r.trial.phase?.length || r.trial.conditions?.length) ? (
        <p className="text-xs text-fg-muted">
          {r.trial.phase?.length ? <span className="mr-3">Phase: {r.trial.phase.join(', ')}</span> : null}
          {r.trial.conditions?.length ? <span>Conditions: {r.trial.conditions.slice(0, 4).join(', ')}</span> : null}
        </p>
      ) : null}
      <button type="button" onClick={() => setOpen((o) => !o)} className="self-start text-xs font-medium text-fg-subtle hover:text-fg" aria-expanded={open}>
        {open ? '− Hide' : '+ Why it matters & limitations'}
      </button>
      {open && (
        <div className="space-y-3 rounded-xl border border-ink-600/60 bg-ink-900/50 p-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="eyebrow">Why it matters</span>
              <BasisLabel basis={r.whyItMatters.basis} />
            </div>
            <p className="text-sm text-fg-muted">{r.whyItMatters.text}</p>
          </div>
          <div className="space-y-1">
            <span className="eyebrow">Limitations & open questions</span>
            <ul className="space-y-1.5">
              {r.limitations.map((l, i) => (
                <li key={i} className="flex flex-col gap-1 text-sm text-fg-muted sm:flex-row sm:items-start sm:gap-2">
                  <BasisLabel basis={l.basis} />
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-fg-subtle">Evidence note: {r.evidenceNote}</p>
        </div>
      )}
      <div className="mt-auto flex flex-col gap-2 border-t border-ink-600/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <Identifiers r={r} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {r.alsoIndexedIn.map((a) => (
            <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-subtle hover:text-fg">
              also in {a.name}
            </a>
          ))}
          <SourceLink r={r} />
        </div>
      </div>
    </article>
  );
}
