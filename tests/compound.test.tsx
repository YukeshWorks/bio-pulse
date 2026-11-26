// @vitest-environment jsdom
/** Compound explorer tests with SYNTHETIC API responses (no network). */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __clearItemCache,
  assertInchiKey,
  assessRestriction,
  canShowSuppliers,
  getFacts,
  getOrganisms,
  indiaStatus,
  isRestrictiveStatus,
  mapCategories,
  mapClaims,
  mapDescriptions,
  mapIdentity,
  mapItemSearch,
  mapLabels,
  mapOrganisms,
  searchItemUrl,
  taxaQuery,
  thumb,
} from '../src/lib/compound';
import { ExplorePage } from '../src/pages/ExplorePage';

const CAFFEINE_KEY = 'RYYVLZVUVIJVGH-UHFFFAOYSA-N';
const MORPHINE_KEY = 'BQJCRHHNABKAKU-KBQPJGBKSA-N';
const props = (cid: number, title: string, key: string) => ({ PropertyTable: { Properties: [{ CID: cid, Title: title, MolecularFormula: 'C8H10N4O2', MolecularWeight: '194.19', IUPACName: 'x', InChIKey: key, CanonicalSMILES: 'C' }] } });
const ent = (q: string) => ({ value: `http://www.wikidata.org/entity/${q}` });
const taxaSparql = { results: { bindings: [
  { taxon: ent('Q1'), name: { value: 'Coffea arabica' }, common: { value: 'Arabica coffee' }, image: { value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Coffee.jpg' }, k: ent('Q756') },
  { taxon: ent('Q2'), name: { value: 'Camellia sinensis' }, common: { value: 'tea plant' }, k: ent('Q756') },
  { taxon: ent('Q3'), name: { value: 'Apis mellifera' }, k: ent('Q729') },
] } };
const claim = (id: string, jur?: string) => ({ mainsnak: { datavalue: { value: { id } } }, rank: 'normal', ...(jur ? { qualifiers: { P1001: [{ datavalue: { value: { id: jur } } }] } } : {}) });
const LABELS: Record<string, string> = { Q1: 'Coffea arabica', Q2: 'Camellia sinensis', Q3: 'Apis mellifera', Q10: 'purine alkaloid', Q11: 'stimulant', Q20: 'Schedule II', Q21: 'United States' };
const vendors = { SourceCategories: { Categories: [{ Category: 'Chemical Vendors', Sources: [{ SourceName: 'Sigma-Aldrich', SourceRecordURL: 'https://www.sigmaaldrich.com/x' }, { SourceName: 'TCI', SourceRecordURL: 'javascript:alert(1)' }, { SourceName: 'Sigma-Aldrich' }] }] } };

/** Routes a fake fetch for PubChem, the Wikidata Action API and the query service. */
function fakeApis(opts: { morphine?: boolean; legalFail?: boolean; sparqlFail?: boolean; hang?: string } = {}) {
  return async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (opts.hang && u.includes(opts.hang)) return new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    const title = opts.morphine ? 'Morphine' : 'Caffeine';
    if (u.includes('/property/')) return json(props(opts.morphine ? 5288826 : 2519, title, opts.morphine ? MORPHINE_KEY : CAFFEINE_KEY));
    if (u.includes('/description/')) return json({ InformationList: { Information: [{ Description: `${title} is a natural compound described for testing purposes.`, DescriptionSourceName: 'Test Source' }] } });
    if (u.includes('/synonyms/')) return json({ InformationList: { Information: [{ Synonym: [title] }] } });
    if (u.includes('pug_view/categories')) return json(vendors);
    if (u.includes('/autocomplete/')) return json({ dictionary_terms: { compound: ['caffeine'] } });
    if (u.includes('api.inaturalist.org')) return json({ results: [] });
    if (u.includes('list=search')) return json({ query: { search: [{ title: 'Q100' }] } });
    if (u.includes('action=wbgetclaims')) {
      const p = /property=(P\d+)/.exec(u)![1];
      if (p === 'P3493' && opts.legalFail) return json({}, 500);
      const c: Record<string, unknown[]> = { P703: [claim('Q1'), claim('Q2'), claim('Q3')], P31: [claim('Q10')], P279: [], P366: [claim('Q11')], P3493: opts.morphine ? [claim('Q20', 'Q21')] : [] };
      return json({ claims: { [p]: c[p] } });
    }
    if (u.includes('action=wbgetentities')) {
      const ids = /ids=([^&]+)/.exec(u)![1].split('|');
      return json({ entities: Object.fromEntries(ids.map((id) => [id, { labels: LABELS[id] ? { en: { value: LABELS[id] } } : {} }])) });
    }
    if (u.includes('query.wikidata.org')) return opts.sparqlFail ? json({}, 503) : json(taxaSparql);
    return json({}, 404);
  };
}

describe('mappers', () => {
  it('maps PubChem identity and rejects malformed InChIKeys', () => {
    expect(mapIdentity(props(2519, 'Caffeine', CAFFEINE_KEY))).toMatchObject({ cid: 2519, title: 'Caffeine', inchikey: CAFFEINE_KEY, pubchemUrl: 'https://pubchem.ncbi.nlm.nih.gov/compound/2519' });
    expect(mapIdentity(props(1, 'X', 'bad" } DROP'))?.inchikey).toBeUndefined();
    expect(mapIdentity({})).toBeNull();
  });
  it('maps item search, claims (with jurisdictions) and labels', () => {
    expect(mapItemSearch({ query: { search: [{ title: 'Q60235' }] } })).toBe('Q60235');
    expect(mapItemSearch({ query: { search: [{ title: 'Property:P1' }] } })).toBeNull();
    expect(mapClaims({ claims: { P3493: [claim('Q20', 'Q21'), { ...claim('Q22'), rank: 'deprecated' }, { mainsnak: {} }] } }, 'P3493')).toEqual([{ id: 'Q20', jurisdictions: ['Q21'] }]);
    expect(mapLabels({ entities: { Q1: { labels: { en: { value: 'x' } } }, Q2: {} } }).get('Q1')).toBe('x');
  });
  it('groups organisms by kingdom with safe https thumbnails', () => {
    const o = mapOrganisms(taxaSparql);
    expect(o.map((x) => x.kingdom).sort()).toEqual(['Animals', 'Plants', 'Plants']);
    expect(o[0].imageUrl).toBe('https://commons.wikimedia.org/wiki/Special:FilePath/Coffee.jpg?width=240');
    expect(thumb('https://evil.example.com/x.jpg')).toBeUndefined();
  });
  it('maps descriptions and suppliers (https links only, deduplicated)', () => {
    expect(mapDescriptions({ InformationList: { Information: [{ Description: 'Caffeine is a stimulant found in coffee.', DescriptionSourceName: 'X', DescriptionURL: 'http://insecure' }] } })[0].url).toBeUndefined();
    expect(mapCategories(vendors).suppliers).toEqual([{ name: 'Sigma-Aldrich', url: 'https://www.sigmaaldrich.com/x' }, { name: 'TCI', url: undefined }]);
  });
  it('only ever inserts validated ids into queries', () => {
    expect(searchItemUrl(CAFFEINE_KEY)).toContain('haswbstatement%3AP235%3DRYYVLZVUVIJVGH-UHFFFAOYSA-N');
    expect(() => searchItemUrl('" OR 1')).toThrow();
    expect(() => assertInchiKey('abc')).toThrow();
    expect(taxaQuery(['Q1', 'Q2"}', 'X'])).toContain('VALUES ?taxon { wd:Q1 }');
  });
});

describe('loaders', () => {
  afterEach(() => __clearItemCache());
  it('loads facts with legal jurisdictions via the Action API', async () => {
    const f = await getFacts(MORPHINE_KEY, fakeApis({ morphine: true }));
    expect(f).toEqual({ classes: ['purine alkaloid'], uses: ['stimulant'], legal: [{ status: 'Schedule II', jurisdiction: 'United States' }] });
  });
  it('loads organisms; falls back to names only if the query service fails', async () => {
    expect((await getOrganisms(CAFFEINE_KEY, fakeApis())).length).toBe(3);
    __clearItemCache();
    const fb = await getOrganisms(CAFFEINE_KEY, fakeApis({ sparqlFail: true }));
    expect(fb.map((o) => o.scientificName).sort()).toEqual(['Apis mellifera', 'Camellia sinensis', 'Coffea arabica']);
    expect(fb.every((o) => o.kingdom === 'Other organisms' && !o.imageUrl)).toBe(true);
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

function mockApis(kind: 'caffeine' | 'morphine' | 'legalfail' | 'hang') {
  vi.stubGlobal('fetch', fakeApis({ morphine: kind === 'morphine', legalFail: kind === 'legalfail', hang: kind === 'hang' ? 'P3493' : undefined }));
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
    vi.useRealTimers();
    __clearItemCache();
    localStorage.clear();
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

  it('never spins forever: a hanging legal source times out and suppliers stay hidden', async () => {
    mockApis('hang');
    page('caffeine');
    await screen.findByText('Arabica coffee');
    await screen.findByText(/Could not load legal status/, {}, { timeout: 15_000 });
    expect(screen.queryByRole('link', { name: /Sigma-Aldrich/ })).toBeNull();
  }, 20_000);

  it('remembers results: a second visit makes no network requests', async () => {
    mockApis('caffeine');
    page('caffeine');
    await screen.findByRole('link', { name: /Sigma-Aldrich/ });
    cleanup();
    __clearItemCache();
    const spy = vi.fn(async () => new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', spy);
    page('caffeine');
    await screen.findByText('Arabica coffee');
    await screen.findByRole('link', { name: /Sigma-Aldrich/ });
    expect(spy).not.toHaveBeenCalled();
  });

  it('explains when a compound is not found', async () => {
    vi.stubGlobal('fetch', async (u: string) => (String(u).includes('autocomplete') ? Response.json({ dictionary_terms: { compound: ['caffeine'] } }) : new Response('{}', { status: 404 })));
    page('caffine');
    await screen.findByText(/No compound called “caffine” was found/);
    await screen.findByRole('button', { name: 'caffeine' });
  });
});

describe('safety: name variants and procedure searches (regression for DL-methamphetamine)', () => {
  it('matches stereo, salt and hydrate variants but not look-alikes', async () => {
    const { matchRestrictedName } = await import('../src/lib/compound');
    for (const [n, want] of [['DL-methamphetamine', 'methamphetamine'], ['(+)-cocaine hydrochloride', 'cocaine'], ['Morphine sulfate', 'morphine'], ['Ephedrine HCl', 'ephedrine'], ['d-amphetamine sulfate', 'amphetamine'], ['Codeine phosphate hemihydrate', 'codeine'], ['LSD', 'lsd']] as const) expect(matchRestrictedName(n), n).toBe(want);
    for (const n of ['Caffeine', 'Procaine', 'Domperidone', 'Nicotinamide', 'Curcumin']) expect(matchRestrictedName(n), n).toBeUndefined();
  });
  it('flags DL-methamphetamine as restricted even without legal records', () => {
    const r = assessRestriction({ names: ['DL-methamphetamine'], legal: [], regulatorySources: [] });
    expect(r.restricted).toBe(true);
    expect(canShowSuppliers(r)).toBe(false);
  });
  it('refuses production searches for restricted compounds only', async () => {
    const { isRestrictedProcedureQuery } = await import('../src/lib/compound');
    for (const q of ['DL-methamphetamine extraction production', 'how to make cocaine', 'opium poppy cultivation', 'synthesis of fentanyl']) expect(isRestrictedProcedureQuery(q), q).toBe(true);
    for (const q of ['caffeine extraction', 'morphine biosynthesis in poppy', 'methamphetamine neurotoxicity', 'CRISPR base editing']) expect(isRestrictedProcedureQuery(q), q).toBe(false);
  });
});

describe('organism photos from iNaturalist', () => {
  it('accepts only an exact name match with an https iNaturalist image', async () => {
    const { mapInat, sentenceCase } = await import('../src/lib/compound');
    const res = { results: [{ id: 898697, name: 'Senegalia berlandieri', iconic_taxon_name: 'Plantae', preferred_common_name: 'Guajillo', default_photo: { medium_url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpeg', attribution: '(c) someone, CC BY-NC' } }] };
    expect(mapInat(res, 'Senegalia berlandieri')).toMatchObject({ commonName: 'Guajillo', kingdom: 'Plants', url: 'https://www.inaturalist.org/taxa/898697', imageUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/1/medium.jpeg' });
    expect(mapInat(res, 'Senegalia greggii')).toEqual({});
    expect(mapInat({ results: [{ ...res.results[0], default_photo: { medium_url: 'http://evil.example/x.jpg' } }] }, 'Senegalia berlandieri').imageUrl).toBeUndefined();
    expect(sentenceCase('tea plant')).toBe('Tea plant');
  });
});
