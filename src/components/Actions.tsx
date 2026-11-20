import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BioRecord } from '../../shared/schema';
import { bibtex, copyText, plainCitation } from '../lib/cite';
import { toggleSaved, useLibrary } from '../lib/library';

// ---------- Toasts: tiny global store for "Copied" / "Saved" confirmations ----------
let toasts: { id: number; text: string }[] = [];
const toastListeners = new Set<() => void>();
let nextId = 1;
export function toast(text: string) {
  const id = nextId++;
  toasts = [...toasts, { id, text }].slice(-3);
  toastListeners.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    toastListeners.forEach((l) => l());
  }, 2400);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="animate-menu rounded-full border border-ink-500 bg-ink-800/95 px-4 py-2 text-sm text-fg shadow-lg backdrop-blur">
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------- Save star ----------
export function SaveButton({ r, compact = false }: { r: BioRecord; compact?: boolean }) {
  const { saved } = useLibrary();
  const on = saved.some((s) => s.id === r.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Remove from saved' : 'Save to reading list'}
      title={on ? 'Saved — click to remove' : 'Save to your reading list'}
      onClick={() => toast(toggleSaved(r) ? 'Saved to your reading list' : 'Removed from saved')}
      className={`inline-flex items-center gap-1 text-sm font-medium transition ${on ? 'text-ev-preprint' : 'text-fg-subtle hover:text-fg'}`}
    >
      <svg viewBox="0 0 20 20" className={`h-4 w-4 transition-transform duration-200 ${on ? 'scale-110' : ''}`} aria-hidden>
        <path
          d="M10 2.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1L10 14.3l-4.6 2.4.9-5.1L2.5 8l5.2-.8L10 2.5z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (on ? 'Saved' : 'Save')}
    </button>
  );
}

// ---------- Cite menu + share ----------
export function CiteShare({ r }: { r: BioRecord }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const copy = async (text: string, label: string) => {
    setOpen(false);
    toast((await copyText(text)) ? `${label} copied` : 'Could not copy — your browser blocked the clipboard');
  };
  const share = async () => {
    const data = { title: r.title, text: `${r.title} — via BioPulse`, url: r.url };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      return; // user cancelled the share sheet
    }
    copy(r.url, 'Link');
  };

  return (
    <div ref={ref} className="relative inline-flex items-center gap-4">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-fg-subtle transition hover:text-fg">
        Cite
      </button>
      <button type="button" onClick={share} className="text-sm font-medium text-fg-subtle transition hover:text-fg">
        Share
      </button>
      {open && (
        <div role="menu" className="animate-menu absolute bottom-full left-0 z-30 mb-2 w-60 rounded-xl border border-ink-500 bg-ink-800 p-1.5 shadow-xl">
          <p className="px-2.5 py-1.5 text-xs text-fg-subtle">Built from source metadata only</p>
          {[
            ['Copy reference', () => copy(plainCitation(r), 'Reference')],
            ['Copy BibTeX', () => copy(bibtex(r), 'BibTeX')],
            ['Copy link', () => copy(r.url, 'Link')],
          ].map(([label, fn]) => (
            <button key={label as string} role="menuitem" type="button" onClick={fn as () => void} className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-fg-muted hover:bg-ink-700 hover:text-fg">
              {label as string}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The action row shown on cards: Save · Cite · Share. */
export function RecordActions({ r }: { r: BioRecord }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-4">
      <SaveButton r={r} />
      <CiteShare r={r} />
    </span>
  );
}
