import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CATEGORY_BY_ID } from '../../shared/categories';
import { EVIDENCE } from '../../shared/evidence';
import type { BioRecord, EvidenceClass, TextBasis } from '../../shared/schema';
import { useView } from '../lib/view';

const EV_STYLE: Record<EvidenceClass, string> = {
  'PEER-REVIEWED': 'text-ev-peer border-ev-peer/40 bg-ev-peer/10',
  PREPRINT: 'text-ev-preprint border-ev-preprint/40 bg-ev-preprint/10',
  'PATENT APPLICATION': 'text-ev-patent border-ev-patent/40 bg-ev-patent/10',
  'CLINICAL TRIAL': 'text-ev-trial border-ev-trial/40 bg-ev-trial/10',
  'REGULATORY UPDATE': 'text-ev-reg border-ev-reg/40 bg-ev-reg/10',
  'COMPANY ANNOUNCEMENT': 'text-ev-company border-ev-company/40 bg-ev-company/10',
};

export const EV_DOT: Record<EvidenceClass, string> = {
  'PEER-REVIEWED': 'bg-ev-peer',
  PREPRINT: 'bg-ev-preprint',
  'PATENT APPLICATION': 'bg-ev-patent',
  'CLINICAL TRIAL': 'bg-ev-trial',
  'REGULATORY UPDATE': 'bg-ev-reg',
  'COMPANY ANNOUNCEMENT': 'bg-ev-company',
};

export function EvidenceBadge({ evidence, patent, technical = false }: { evidence: EvidenceClass; patent?: BioRecord['patent']; technical?: boolean }) {
  const { detailed } = useView();
  const title = `${EVIDENCE[evidence].definition} ${EVIDENCE[evidence].caution}`;
  if (!detailed && !technical) {
    // Simple view: plain words with the key caveat; tap for a one-line explanation.
    const plain = evidence === 'PATENT APPLICATION' && patent?.status === 'granted' ? 'Granted patent · not proof it works' : EVIDENCE[evidence].plain;
    return <ExplainBadge evidence={evidence} label={plain} />;
  }
  const sub = evidence === 'PATENT APPLICATION' && patent?.status === 'granted' ? ' · GRANTED' : '';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-medium tracking-wide ${EV_STYLE[evidence]}`} title={title}>
      <span className={`h-1.5 w-1.5 rounded-full ${EV_DOT[evidence]}`} aria-hidden />
      {evidence}
      {sub}
    </span>
  );
}

const BASIS: Record<TextBasis, { label: string; cls: string; title: string }> = {
  source: { label: 'From source', cls: 'text-ev-peer/90 border-ev-peer/30', title: 'Quoted or extracted directly from the original source (abstract or description).' },
  metadata: { label: 'Source metadata', cls: 'text-signal/90 border-signal/30', title: 'Assembled from structured fields provided by the source (dates, IDs, status).' },
  template: { label: 'BioPulse context', cls: 'text-fg-muted border-ink-500', title: 'Generic interpretation based on the evidence type or field — not a finding of this record.' },
  ai: { label: 'AI-generated', cls: 'text-ev-patent border-ev-patent/40', title: 'Written by an AI model (Claude API) using only this record’s metadata and abstract. Verify against the original source.' },
  unavailable: { label: 'Not in source', cls: 'text-fg-subtle border-ink-600', title: 'The source metadata does not contain this information.' },
};

export function BasisLabel({ basis }: { basis: TextBasis }) {
  const b = BASIS[basis];
  return (
    <span className={`inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wider ${b.cls}`} title={b.title}>
      {b.label}
    </span>
  );
}

export function CategoryChip({ id, asLink = true }: { id: string; asLink?: boolean }) {
  const name = CATEGORY_BY_ID[id]?.short ?? id;
  if (!asLink) return <span className="chip">{name}</span>;
  return (
    <Link to={`/categories/${id}`} className="chip hover:border-accent/50 hover:text-fg">
      {name}
    </Link>
  );
}

export function PreprintWarning({ compact = false }: { compact?: boolean }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg border border-ev-preprint/30 bg-ev-preprint/[0.07] text-ev-preprint ${compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`} role="note">
      <span aria-hidden>⚠</span>
      <span>Preprint — not peer-reviewed. Findings are preliminary and may change; not for clinical decisions.</span>
    </p>
  );
}

export function PatentNotice({ patent }: { patent?: BioRecord['patent'] }) {
  const status = patent?.status === 'granted' ? `Granted patent${patent.kind ? ` (kind ${patent.kind})` : ''}` : patent?.status === 'application' ? `Patent application${patent.kind ? ` (kind ${patent.kind})` : ''}` : 'Patent document (status unknown)';
  return (
    <p className="flex items-start gap-2 rounded-lg border border-ev-patent/30 bg-ev-patent/[0.07] px-2.5 py-1.5 text-xs text-ev-patent" role="note">
      <span aria-hidden>§</span>
      <span>{status}. A patent filing is not proof of efficacy, safety or commercial success.</span>
    </p>
  );
}

export function TrialNotice({ status }: { status?: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-ev-trial/30 bg-ev-trial/[0.07] px-2.5 py-1.5 text-xs text-ev-trial" role="note">
      <span aria-hidden>ⓘ</span>
      <span>Trial registration{status ? ` · ${status}` : ''}. Registration describes a study; it does not report results.</span>
    </p>
  );
}

/**
 * Plain evidence label that opens a short "What does this mean?" explanation on click/tap.
 * The explanation is rendered in a portal with fixed positioning so neighbouring cards can never
 * cover it, and it is clamped inside the viewport.
 */
function ExplainBadge({ evidence, label }: { evidence: EvidenceClass; label: string }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  const open = pos !== null;
  const toggle = () => {
    if (open || !btn.current) return setPos(null);
    const r = btn.current.getBoundingClientRect();
    const width = 272;
    setPos({ top: r.bottom + 8, left: Math.max(12, Math.min(r.left, window.innerWidth - width - 12)) });
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e.type === 'mousedown' && (btn.current?.contains(e.target as Node) || pop.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [open]);
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-expanded={open}
        title="What does this mean?"
        onClick={toggle}
        className={`inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition hover:brightness-125 ${EV_STYLE[evidence]}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${EV_DOT[evidence]}`} aria-hidden />
        {label}
      </button>
      {open &&
        createPortal(
          <span
            ref={pop}
            role="tooltip"
            style={{ top: pos.top, left: pos.left, width: 272 }}
            className="animate-menu fixed z-[60] block rounded-xl border border-ink-500 bg-ink-800 p-3 text-left text-[13px] font-normal leading-relaxed text-fg-muted shadow-2xl"
          >
            <span className="mb-1 block font-semibold text-fg">What does this mean?</span>
            {EVIDENCE[evidence].explain}
          </span>,
          document.body,
        )}
    </>
  );
}
