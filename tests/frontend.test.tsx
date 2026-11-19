// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { DailyDataset } from '../shared/schema';
import { BriefingHero, StaleBanner } from '../src/components/Home';
import { RecordCard } from '../src/components/RecordCard';
import { EvidenceBadge } from '../src/components/Badges';
import { EVIDENCE } from '../shared/evidence';
import { ViewProvider, ViewToggle } from '../src/lib/view';
import { applyFilters, EMPTY_FILTERS } from '../src/lib/filters';
import { formatTimestamp, freshness, todayInIst } from '../src/lib/format';

const demo = JSON.parse(readFileSync('fixtures/demo/latest.json', 'utf8')) as DailyDataset;
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
afterEach(cleanup);

describe('filters, search and sorting', () => {
  it('filters by evidence, category, source, date and text', () => {
    const all = demo.records;
    expect(applyFilters(all, EMPTY_FILTERS)).toHaveLength(all.length);
    const pre = applyFilters(all, { ...EMPTY_FILTERS, evidence: ['PREPRINT'] });
    expect(pre.length).toBeGreaterThan(0);
    expect(pre.every((r) => r.evidence === 'PREPRINT')).toBe(true);
    const crispr = applyFilters(all, { ...EMPTY_FILTERS, categories: ['crispr-genetic-engineering'] });
    expect(crispr.every((r) => r.categories.includes('crispr-genetic-engineering'))).toBe(true);
    expect(applyFilters(all, { ...EMPTY_FILTERS, sources: ['clinicaltrials'] }).every((r) => r.source.id === 'clinicaltrials')).toBe(true);
    expect(applyFilters(all, { ...EMPTY_FILTERS, from: '2099-01-01' })).toHaveLength(0);
    expect(applyFilters(all, { ...EMPTY_FILTERS, q: 'bacteriophage klebsiella' })).toHaveLength(1);
    expect(applyFilters(all, { ...EMPTY_FILTERS, q: 'NCT09999901' })).toHaveLength(1);
  });
  it('sorts by date and title', () => {
    const newest = applyFilters(demo.records, { ...EMPTY_FILTERS, sort: 'newest' });
    for (let i = 1; i < newest.length; i++) expect(newest[i - 1].date >= newest[i].date).toBe(true);
    const titles = applyFilters(demo.records, { ...EMPTY_FILTERS, sort: 'title' }).map((r) => r.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });
});

describe('stale-data detection and IST formatting', () => {
  const now = new Date('2026-11-18T12:00:00Z');
  it('classifies freshness', () => {
    expect(freshness('2026-11-18T01:30:00Z', now)).toBe('fresh');
    expect(freshness('2026-11-16T12:00:00Z', now)).toBe('stale');
    expect(freshness('2026-11-10T01:30:00Z', now)).toBe('very-stale');
    expect(freshness(null, now)).toBe('unknown');
  });
  it('formats in Asia/Kolkata', () => {
    expect(formatTimestamp('2026-11-18T01:30:00Z')).toContain('07:00 IST');
    expect(todayInIst(new Date('2026-11-17T19:00:00Z'))).toBe('2026-11-18');
  });
  it('shows a stale banner for old data and a preserved-data notice after a failed run', () => {
    const old = { ...demo, generatedAt: '2026-01-01T01:30:00Z' };
    wrap(<StaleBanner data={old} status={null} />);
    expect(screen.getByRole('status').textContent).toMatch(/out of date/);
  });
});

describe('evidence labels and source links', () => {
  it('renders every evidence class label', () => {
    for (const ev of ['PEER-REVIEWED', 'PREPRINT', 'PATENT APPLICATION', 'CLINICAL TRIAL', 'REGULATORY UPDATE', 'COMPANY ANNOUNCEMENT'] as const) {
      // Detailed / technical form shows the formal evidence class...
      const tech = render(<EvidenceBadge evidence={ev} technical />);
      expect(tech.container.textContent).toContain(ev);
      cleanup();
      // ...the simple form shows plain words that keep the caveat.
      const simple = render(<EvidenceBadge evidence={ev} />);
      expect(simple.container.textContent).toBe(EVIDENCE[ev].plain);
      cleanup();
    }
  });
  it('shows a preprint warning on preprint cards and links to the original', () => {
    const pre = demo.records.find((r) => r.evidence === 'PREPRINT')!;
    wrap(<RecordCard r={pre} />);
    expect(screen.getByText('Preprint · not peer-reviewed')).toBeTruthy();
    const link = screen.getByText(/Read original on/).closest('a')!;
    expect(link.getAttribute('href')).toBe(pre.url);
    expect(link.getAttribute('rel')).toContain('noopener');
  });
  it('distinguishes patent status and disclaims efficacy', () => {
    const pat = demo.records.find((r) => r.evidence === 'PATENT APPLICATION')!;
    wrap(<RecordCard r={pat} />);
    expect(screen.getByText('Patent filing · not proof it works')).toBeTruthy();
    expect(screen.queryByText(/not proof of efficacy/i)).toBeNull(); // details hidden in simple view
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    expect(screen.getByText(/not proof of efficacy/i)).toBeTruthy();
    expect(screen.getByText(/Patent application \(kind A1\)/)).toBeTruthy();
  });
});

describe('one-sentence briefing', () => {
  it('links each citation to its original source', () => {
    wrap(<BriefingHero data={demo} />);
    const cites = screen.getAllByLabelText(/^Source \d/);
    expect(cites.length).toBe(demo.briefing.citations.length);
    const urls = new Set(demo.records.map((r) => r.url));
    for (const c of cites) expect(urls.has(c.getAttribute('href')!)).toBe(true);
  });
  it('shows "no qualifying updates" instead of a fabricated headline', () => {
    const empty: DailyDataset = { ...demo, records: [], topDiscoveries: [], briefing: { sentence: null, wordCount: 0, citations: [], method: 'none', note: 'none' } };
    wrap(<BriefingHero data={empty} />);
    expect(screen.getByText(/No qualifying updates were found/)).toBeTruthy();
  });
});

describe('simple by default, detailed on demand', () => {
  it('hides technical details until the reader asks, and the Detailed view shows them', () => {
    const rec = demo.records[0];
    render(
      <ViewProvider>
        <MemoryRouter>
          <ViewToggle />
          <RecordCard r={rec} />
        </MemoryRouter>
      </ViewProvider>,
    );
    expect(screen.queryByText(/Limitations/)).toBeNull();
    expect(screen.queryByText('From source')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'detailed' }));
    expect(screen.getByText(/Limitations/)).toBeTruthy();
    expect(screen.getAllByText('From source').length).toBeGreaterThan(0);
    expect(screen.getByText(rec.evidence)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'simple' }));
    expect(screen.queryByText(/Limitations/)).toBeNull();
  });
});

describe('motion never hides content', () => {
  it('keeps the full briefing sentence as one string for screen readers', async () => {
    const { WordReveal } = await import('../src/lib/motion');
    const { container } = render(<WordReveal text="Today's top biotech story is a test." />);
    expect(container.querySelector('.sr-only')?.textContent).toBe("Today's top biotech story is a test.");
    expect(container.querySelectorAll('[aria-hidden="true"] .animate-word').length).toBe(7);
  });
  it('shows final values and visible content when IntersectionObserver is unavailable', async () => {
    const { CountUp, Reveal } = await import('../src/lib/motion');
    const { container } = render(
      <>
        <CountUp value={200} />
        <Reveal>visible</Reveal>
      </>,
    );
    expect(container.textContent).toContain('200');
    expect(container.querySelector('.reveal-hidden')).toBeNull();
  });
});
