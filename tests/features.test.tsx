// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { XMLParser } from 'fast-xml-parser';
import type { ArchiveIndex, DailyDataset } from '../shared/schema';
import { categoryName } from '../shared/categories';
import { EVIDENCE } from '../shared/evidence';
import { bibtex, exportAll, plainCitation, ris } from '../src/lib/cite';
import { __resetLibrary, addTopic, isSaved, matchTopic, removeTopic, toggleSaved, useLibrary } from '../src/lib/library';
import { buildFeed, siteUrl } from '../pipeline/lib/feed';
import { FieldChart, ForYou } from '../src/components/Insights';
import { EvidenceBadge } from '../src/components/Badges';
import { RecordCard } from '../src/components/RecordCard';
import { SavedPage } from '../src/pages/SavedPage';

const demo = JSON.parse(readFileSync('fixtures/demo/latest.json', 'utf8')) as DailyDataset;
const peer = demo.records.find((r) => r.evidence === 'PEER-REVIEWED' && r.identifiers.doi)!;
const pre = demo.records.find((r) => r.evidence === 'PREPRINT')!;
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  __resetLibrary();
});
afterEach(cleanup);

describe('citations (metadata only, nothing invented)', () => {
  it('builds a readable reference with DOI link', () => {
    const c = plainCitation(peer);
    expect(c).toContain(peer.title.replace(/\.$/, ''));
    expect(c).toContain(`(${peer.date.slice(0, 4)})`);
    expect(c).toContain(`https://doi.org/${peer.identifiers.doi}`);
  });
  it('marks preprints and never adds missing fields', () => {
    const c = plainCitation({ ...pre, authors: [], organization: undefined, venue: undefined });
    expect(c).toMatch(/\[Preprint, not peer-reviewed\]/);
    expect(c).not.toMatch(/undefined|null/);
  });
  it('exports valid-looking BibTeX and RIS', () => {
    const b = bibtex(peer);
    expect(b).toMatch(/^@article\{\w+_[a-z0-9]+,\n/);
    expect(b).toContain(`doi = {${peer.identifiers.doi}}`);
    expect(bibtex(pre)).toMatch(/^@misc\{/);
    const r = ris(peer);
    expect(r.split('\n')[0]).toBe('TY  - JOUR');
    expect(r.trim().endsWith('ER  -')).toBe(true);
    expect(exportAll([peer, pre], 'ris').match(/^TY {2}- /gm)).toHaveLength(2);
  });
  it('escapes BibTeX special characters', () => {
    expect(bibtex({ ...peer, title: 'A & B {test} 50% $x' })).toContain('title = {A \\& B test 50\\% \\$x}');
  });
});

describe('personal library (browser only)', () => {
  it('saves and unsaves records, persisting to localStorage', () => {
    expect(toggleSaved(peer)).toBe(true);
    expect(isSaved(peer.id)).toBe(true);
    expect(JSON.parse(localStorage.getItem('biopulse:library:v1')!).saved[0].id).toBe(peer.id);
    expect(toggleSaved(peer)).toBe(false);
    expect(isSaved(peer.id)).toBe(false);
  });
  it('follows topics without duplicates and matches all words', () => {
    addTopic('  gene   editing ');
    addTopic('GENE EDITING');
    function Probe() {
      return <span data-testid="t">{useLibrary().topics.join('|')}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('t').textContent).toBe('gene editing');
    act(() => removeTopic('gene editing'));
    expect(screen.getByTestId('t').textContent).toBe('');
    const hits = matchTopic(demo.records, 'wheat drought', categoryName);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((r) => /wheat/i.test(r.title + r.summary.text))).toBe(true);
    expect(matchTopic(demo.records, 'zzzz-nothing', categoryName)).toEqual([]);
  });
  it('save button on a card toggles and shows saved state', () => {
    wrap(<RecordCard r={peer} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save to reading list' }));
    expect(screen.getByRole('button', { name: 'Remove from saved' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('saved page lists items and offers exports', () => {
    toggleSaved(peer);
    wrap(<SavedPage />);
    expect(screen.getByText(peer.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'RIS' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'BibTeX' })).toBeTruthy();
  });
});

describe('"What does this mean?" explanations', () => {
  it('opens a plain explanation when a label is tapped and closes on Escape', () => {
    render(<EvidenceBadge evidence="PREPRINT" />);
    fireEvent.click(screen.getByRole('button', { name: /Preprint/ }));
    expect(screen.getByRole('tooltip').textContent).toContain(EVIDENCE.PREPRINT.explain);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('For you', () => {
  it('invites the reader to follow topics when none are set', () => {
    wrap(<ForYou records={demo.records} />);
    expect(screen.getByText('Make it yours')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '+ CRISPR' }));
    expect(screen.getByText('For you')).toBeTruthy();
  });
  it('shows matching records and counts per topic', () => {
    addTopic('wheat');
    wrap(<ForYou records={demo.records} />);
    expect(screen.getByRole('link', { name: /wheat 1/ })).toBeTruthy();
    expect(screen.getAllByRole('listitem').some((li) => /wheat/i.test(li.textContent ?? ''))).toBe(true);
  });
});

describe('Today by field chart', () => {
  it('ranks primary fields, adds up to the day total and links each field', () => {
    wrap(<FieldChart data={demo} index={null} />);
    const rows = screen.getAllByRole('listitem');
    const nums = rows.map((r) => Number(/(\d+)\s*\d+%/.exec(r.textContent ?? '')?.[1]));
    expect(nums.reduce((a, b) => a + b, 0)).toBe(demo.records.length);
    for (let i = 1; i < nums.length; i++) {
      if (!/other fields combined/.test(rows[i].textContent ?? '')) expect(nums[i - 1]).toBeGreaterThanOrEqual(nums[i]);
    }
    expect(rows.filter((r) => r.tagName === 'A').length).toBeGreaterThan(0);
  });
  it('shows trend lines only with at least 3 days of history', () => {
    const day = (d: string, n: number) => ({ date: d, total: n, byEvidence: {}, byCategory: { 'crispr-genetic-engineering': n }, briefing: null });
    const idx: ArchiveIndex = { schemaVersion: 1, updatedAt: '2026-11-20T00:00:00Z', days: [day('2026-11-18', 3), day('2026-11-17', 2), day('2026-11-16', 1)] };
    const { container } = wrap(<FieldChart data={demo} index={idx} />);
    expect(container.querySelectorAll('svg[role="img"]').length).toBeGreaterThan(0);
    cleanup();
    const { container: c2 } = wrap(<FieldChart data={demo} index={{ ...idx, days: idx.days.slice(0, 2) }} />);
    expect(c2.querySelectorAll('svg[role="img"]').length).toBe(0);
  });
});

describe('RSS feed', () => {
  it('derives the GitHub Pages URL and builds well-formed, escaped RSS', () => {
    expect(siteUrl({ GITHUB_REPOSITORY: 'YukeshWorks/bio-pulse' })).toBe('https://yukeshworks.github.io/bio-pulse/');
    expect(siteUrl({ BIOPULSE_SITE_URL: 'https://biopulse.example.org' })).toBe('https://biopulse.example.org/');
    const live: DailyDataset = { ...demo, dataset: 'live', briefing: { ...demo.briefing, sentence: 'Tom & Jerry <b>study</b> “quoted”' } };
    const xml = buildFeed([live, demo], 'https://x.github.io/bio-pulse/', new Date('2026-11-20T00:00:00Z'));
    const doc = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const items = [doc.rss.channel.item].flat();
    expect(items).toHaveLength(1); // demo data never enters the feed
    expect(items[0].link).toBe(`https://x.github.io/bio-pulse/#/archive/${demo.date}`);
    expect(xml).toContain('Tom &amp;amp; Jerry &amp;lt;b&amp;gt;');
    expect(xml).not.toContain('<b>study</b>');
  });
});
