import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { DATA_MODE } from '../lib/data';
import { ViewToggle } from '../lib/view';
import { BackToTop } from '../lib/motion';
import { Toaster } from './Actions';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-ink-800" />
        <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="none" className="stroke-ink-500" />
        <path d="M4 17h5l2.5-6 4 12 3-9 2 3H28" pathLength={1} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="draw-path text-accent" />
      </svg>
      <span className="leading-none">
        <span className="block text-[17px] font-semibold tracking-tight text-fg">
          Bio<span className="text-accent">Pulse</span>
        </span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.18em] text-fg-subtle">Biotechnology Daily Intelligence</span>
      </span>
    </span>
  );
}

export const NAV = [
  { to: '/', label: 'Explore', end: true },
  { to: '/news', label: 'News' },
  { to: '/latest', label: 'Latest' },
  { to: '/papers', label: 'Papers' },
  { to: '/trials', label: 'Trials' },
  { to: '/patents', label: 'Patents' },
  { to: '/search', label: 'Search' },
  { to: '/saved', label: 'Saved' },
  { to: '/about', label: 'About' },
];

function Header() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [loc.pathname]);
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-md px-3 py-1.5 text-[15px] font-medium transition-colors ${isActive ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:bg-ink-800 hover:text-fg'}`;
  return (
    <header className="sticky top-0 z-40 border-b border-ink-600/60 bg-ink-900/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" aria-label="BioPulse home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="hidden lg:block">
          <ViewToggle />
        </div>
        <button
          type="button"
          className="rounded-lg border border-ink-600 p-2 text-fg-muted hover:text-fg lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="animate-menu border-t border-ink-600/60 px-4 pb-4 pt-2 lg:hidden" aria-label="Main">
          <div className="mb-3">
            <ViewToggle />
          </div>
          <div className="grid grid-cols-2 gap-1">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={linkCls}>
                {n.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-ink-600/60 bg-ink-950/60">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-fg-muted">
            Automated, evidence-labelled monitoring of biotechnology research. BioPulse stores metadata and short attributed excerpts only, and links every item to its original source.
          </p>
        </div>
        <div>
          <p className="eyebrow">Scientific sources</p>
          <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
            <li><a className="hover:text-fg" href="https://pubmed.ncbi.nlm.nih.gov/" target="_blank" rel="noopener noreferrer">PubMed (NCBI/NLM)</a></li>
            <li><a className="hover:text-fg" href="https://europepmc.org/" target="_blank" rel="noopener noreferrer">Europe PMC (EMBL-EBI)</a></li>
            <li><a className="hover:text-fg" href="https://www.biorxiv.org/" target="_blank" rel="noopener noreferrer">bioRxiv</a> · <a className="hover:text-fg" href="https://www.medrxiv.org/" target="_blank" rel="noopener noreferrer">medRxiv</a> (preprints)</li>
            <li><a className="hover:text-fg" href="https://clinicaltrials.gov/" target="_blank" rel="noopener noreferrer">ClinicalTrials.gov</a></li>
            <li><a className="hover:text-fg" href="https://www.fda.gov/" target="_blank" rel="noopener noreferrer">U.S. FDA</a> · <a className="hover:text-fg" href="https://www.ema.europa.eu/" target="_blank" rel="noopener noreferrer">EMA</a></li>
            <li><a className="hover:text-fg" href="https://www.epo.org/" target="_blank" rel="noopener noreferrer">European Patent Office (OPS)</a></li>
          </ul>
        </div>
        <div>
          <p className="eyebrow">Integrity</p>
          <p className="mt-3 text-sm text-fg-muted">
            BioPulse is an automated index, not medical advice. Preprints are not peer-reviewed; patent filings and trial registrations are not evidence of efficacy. Always consult the original source.
          </p>
          <Link to="/about" className="link mt-3 inline-block text-sm">
            Methodology & sources →
          </Link>
          <p className="mt-3 flex flex-wrap gap-x-3 text-sm text-fg-muted">
            <Link to="/categories" className="hover:text-fg">Fields</Link>
            <Link to="/archive" className="hover:text-fg">Daily archive</Link>
            <Link to="/news" className="hover:text-fg">Daily news</Link>
          </p>
          <a href={`${import.meta.env.BASE_URL}data/feed.xml`} className="mt-3 flex items-center gap-2 text-sm text-ev-preprint hover:text-fg">
            <RssIcon /> Subscribe to the daily briefing (RSS, free)
          </a>
        </div>
      </div>
      <p className="border-t border-ink-600/40 py-4 text-center text-xs text-fg-subtle">Data and records belong to their respective publishers. BioPulse links to originals and does not republish full text.</p>
    </footer>
  );
}

function DemoBanner() {
  if (DATA_MODE !== 'demo') return null;
  return (
    <div className="border-b border-ev-preprint/40 bg-ev-preprint/15 px-4 py-2 text-center text-xs font-semibold tracking-wide text-ev-preprint sm:text-sm" role="alert">
      DEMONSTRATION DATA — fictional records for development only. Nothing on this page is real or current research.
    </div>
  );
}

export function RssIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M4 4a12 12 0 0112 12h-2.5A9.5 9.5 0 004 6.5V4zm0 5a7 7 0 017 7H8.5A4.5 4.5 0 004 11.5V9zm1.5 4.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
    </svg>
  );
}

/** Press "/" anywhere (outside a text field) to jump to search. */
function useSlashToSearch() {
  const nav = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      const input = document.querySelector<HTMLInputElement>('input[type="search"]');
      if (input) input.focus();
      else nav('/search');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);
}

export function Layout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  useSlashToSearch();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-ink-700 focus:px-3 focus:py-2">
        Skip to content
      </a>
      <DemoBanner />
      <Header />
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 sm:pt-8">
        {/* Keyed by route so each page change fades in. */}
        <div key={loc.pathname} className="animate-page-in">
          {children}
        </div>
      </main>
      <Footer />
      <BackToTop />
      <Toaster />
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 animate-rise">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm text-fg-muted sm:text-[15px]">{children}</div>}
    </div>
  );
}
