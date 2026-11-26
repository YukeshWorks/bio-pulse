// @vitest-environment jsdom
/** Compound explorer tests with SYNTHETIC API responses (no network). */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertInchiKey,
  assessRestriction,
  canShowSuppliers,
  factsQuery,
  indiaStatus,
  isRestrictiveStatus,
  mapCategories,
  mapDescriptions,
  mapFacts,
  mapIdentity,
  mapKingdoms,
  mapOrganisms,
  organismsQuery,
  thumb,
} from '../src/lib/compound';
import { ExplorePage } from '../src/pages/ExplorePage';

const CAFFEINE_KEY = 'RYYVLZVUVIJVGH-UHFFFAOYSA-N';
const MORPHINE_KEY = 'BQJCRHHNABKAKU-KBQPJGBKSA-N';
const props = (cid: number, title: string, key: string) => ({ PropertyTable: { Properties: [{ CID: cid, Title: title, MolecularFormula: 'C8H10N4O2', MolecularWeight: '194.19', IUPACName: 'x', InChIKey: key, CanonicalSMILES: 'C' }] } });
const sparqlOrgs = { results: { bindings: [
  { taxon: { value: 'http://www.wikidata.org/entity/Q1' }, name: { value: 'Coffea arabica' }, common: { value: 'Arabica coffee' }, image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Coffee.jpg' } },
  { taxon: { value: 'http://www.wikidata.org/entity/Q2' }, name: { value: 'Camellia sinensis' }, common: { value: 'tea plant' } },
  { taxon: { value: 'http://www.wikidata.org/entity/Q3' }, name: { value: 'Apis mellifera' } },
] } };
const sparqlKingdoms = { results: { bindings: [
  { taxon: { value: 'http://www.wikidata.org/entity/Q1' }, k: { value: 'http://www.wikidata.org/entity/Q756' } },
  { taxon: { value: 'http://www.wikidata.org/entity/Q2' }, k: { value: 'http://www.wikidata.org/entity/Q756' } },
  { taxon: { value: 'http://www.wikidata.org/entity/Q3' }, k: { value: 'http://www.wikidata.org/entity/Q729' } },
] } };
const facts = (legal: { s: string; j?: string }[]) => ({ results: { bindings: [
  { kind: { value: 'class' }, label: { value: 'alkaloid' } },
  { kind: { value: 'use' }, label: { value: 'stimulant' } },
  ...legal.map((l) => ({ kind: { value: 'legal' }, label: { value: l.s }, ...(l.j ? { jur: { value: l.j } } : {}) })),
] } });
const vendors = { SourceCategories: { Categories: [{ Category: 'Chemical Vendors', Sources: [{ SourceName: 'Sigma-Aldrich', SourceRecordURL: 'https://www.sigmaaldrich.com/x' }, { SourceName: 'TCI', SourceRecordURL: 'javascript:alert(1)' }, { SourceName: 'Sigma-Aldrich' }] }] } };

describe('mappers', () => {
  it('maps PubChem identity and rejects malformed InChIKeys', () => {
    expect(mapIdentity(props(2519, 'Caffeine', CAFFEINE_KEY))).toMatchObject({ cid: 2519, title: 'Caffeine', inchikey: CAFFEINE_KEY, pubchemUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/2519' });
    expect(mapIdentity(props(1, 'X', 'bad" } DROP'))?.inchikey).toBeUndefined();
    expect(mapIdentity({})).toBeNull();
  });
  it('groups organisms by kingdom with safe https thumbnails', () => {
    const o = mapOrganisms(sparqlOrgs, mapKingdoms(sparqlKingdoms));
    expect(o.map((x) => x.kingdom).sort()).toEqual(['Animals', 'Plants', 'Plants']);
    expect(o[0].imageUrl).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Coffee.jpg?width=240');
    expect(thumb('https://evil.example.com/x.jpg')).toBeUndefined();
    expect(mapOrganisms(sparqlOrgs).every((x) => x.kingdom === 'Other organisms')).toBe(true);
  });
  it('maps facts, descriptions and suppliers (https links only, deduplicated)', () => {
    const f = mapFacts(facts([{ s: 'Schedule I', j: 'United States' }]));
    expect(f).toMatchObject({ classes: ['alkaloid'], uses: ['stimulant'], legal: [{ status: 'Schedule I', jurisdiction: 'United States' }] });
    expect(mapDescriptions({ InformationList: { Information: [{ Description: 'Caffeine is a stimulant found in coffee.', DescriptionSourceName: 'X', DescriptionURL: 'http://insecure' }] } })[0].url).toBeUndefined();
    const c = mapCategories(vendors);
    expect(c.suppliers).toEqual([{ name: 'Sigma-Aldrich', url: 'https://www.sigmaaldrich.com/x' }, { name: 'TCI', url: undefined }]);
  });
  it('only ever inserts a strictly formatted InChIKey into SPARQL', () => {
    expect(organismsQuery(CAFFEINE_KEY)).toContain(`"${CAFFEINE_KEY}"`);
    expect(() => factsQuery('" } ; DELETE')).toThrow();
    expect(() => assertInchiKey('abc')).toThrow();
  });
});

describe('safety rules', () => {
  it('treats controlled, prohibited and precursor statuses as restricted, medicine-only labels as not', () => {
    for (const s of ['Schedule I', 'Schedule II (US)', 'Class A (UK)', 'Prohibited (S9)', 'S8 (Australia)', 'Anlage I (Germany)', 'NDPS Act (India)', 'Schedule X (India)', 'Psychotropic substance']) expect(isRestrictiveStatus(s), s).toBe(true);
    for (const s of ['S2 (Australia)', 'Schedule 4 (Australia)', 'Schedule H (India)', 'OTC (US)', 'Prescription only', 'GSL (UK)', 'POM (UK)']) expect(isRestrictiveStatus(s), s).toBe(false);
  });
  it('restricts by name list, legal status or drug-control sources, and fails closed', () => {
    expect(assessRestriction({ names: ['Morphine'], legal: [], regulatorySources: [] }).restricted).toBe(true);
    expect(assessRestriction({ names: ['Ricin'], legal: [], regulatorySources: [] }).restricted).toBe(true);
    expect(assessRestriction({ names: ['X'], legal: [{ status: 'Schedule I', jurisdiction: 'US' }], regulatorySources: [] }).restricted).toBe(true);
    expect(assessRestriction({ names: ['X'], legal: [], regulatorySources: ['DEA Controlled Substances'] }).restricted).toBe(true);
    const ok = assessRestriction({ names: ['Caffeine'], legal: [], regulatorySources: [] });
    expect(ok.restricted).toBe(false);
    expect(canShowSuppliers(ok)).toBe(true);
    const unknown = assessRestriction({ names: ['Caffeine'], legal: null, regulatorySources: [] });
    expect(canShowSuppliers(unknown)).toBe(false); // legal check failed -> suppliers hidden
  });
  it('picks out India-specific statuses', () => {
    expect(indiaStatus([{ status: 'NDPS Act', jurisdiction: 'India' }, { status: 'Schedule I', jurisdiction: 'United States' }])).toHaveLength(1);
  });
});

function mockApis(kind: 'caffeine' | 'morphine' | 'legalfail') {
  const key = kind === 'morphine' ? MORPHINE_KEY : CAFFEINE_KEY;
  const title = kind === 'morphine' ? 'Morphine' : 'Caffeine';
  vi.stubGlobal('fetch', async (url: string) => {
    const u = String(url);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (u.includes('/property/')) return json(props(kind === 'morphine' ? 5288826 : 2519, title, key));
    if (u.includes('/description/')) return json({ InformationList: { Information: [{ Description: `${title} is a natural compound described for testing purposes.`, DescriptionSourceName: 'Test Source' }] } });
    if (u.includes('/synonyms/')) return json({ InformationList: { Information: [{ Synonym: [title] }] } });
    if (u.includes('pug_view/categories')) return json(vendors);
    if (u.includes('query.wikidata.org')) {
      const q = decodeURIComponent(u);
      if (q.includes('P3493')) return kind === 'legalfail' ? json({}, 500) : json(facts(kind === 'morphine' ? [{ s: 'Schedule II', j: 'United States' }] : []));
      if (q.includes('P171*')) return json(sparqlKingdoms);
      return json(sparqlOrgs);
    }
    return json({}, 404);
  });
}

const page = (q: string) =>
  render(
    <MemoryRouter initialEntries={[`/?q=${q}`]}>
      <ExplorePage />
    </MemoryRouter>,
  );

describe('Explore page', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the landing page with categories when nothing is searched', () => {
    render(
      <MemoryRouter>
        <ExplorePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Which plants, animals and microbes make a compound/)).toBeTruthy();
    expect(screen.getByText('Browse by category')).toBeTruthy();
  });

  it('caffeine: organisms by kingdom, India legal note and research suppliers', async () => {
    mockApis('caffeine');
    page('caffeine');
    await screen.findByRole('heading', { name: 'Caffeine' });
    await screen.findByText('Arabica coffee');
    expect(screen.getByText(/2 plants, 1 animal\b/)).toBeTruthy();
    expect(screen.getByText(/No India-specific record/)).toBeTruthy();
    await screen.findByRole('link', { name: /Sigma-Aldrich/ });
    expect(screen.getByText(/Read published research on how Caffeine/)).toBeTruthy();
    expect(screen.queryByText(/Controlled or dangerous substance/)).toBeNull();
  });

  it('morphine: restricted — no suppliers and no methods, even though PubChem lists vendors', async () => {
    mockApis('morphine');
    page('morphine');
    await screen.findByText(/Controlled or dangerous substance/);
    await waitFor(() => expect(screen.getByText(/does not list where to buy it/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Sigma-Aldrich/ })).toBeNull();
    expect(screen.getByText(/Not shown for controlled or dangerous substances/)).toBeTruthy();
    expect(screen.queryByText(/Read published research on how/)).toBeNull();
    expect(screen.getByText(/controlled internationally/)).toBeTruthy();
  });

  it('fails closed: if legal status cannot load, suppliers stay hidden', async () => {
    mockApis('legalfail');
    page('caffeine');
    await screen.findByText(/Could not load legal status/);
    await waitFor(() => expect(screen.getByText(/legal status could not be checked/)).toBeTruthy());
    expect(screen.queryByRole('link', { name: /Sigma-Aldrich/ })).toBeNull();
  });

  it('explains when a compound is not found', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 404 }));
    page('notacompoundxyz');
    await screen.findByText(/No compound called “notacompoundxyz” was found/);
  });
});
