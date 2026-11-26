/**
 * Compound explorer data layer. Free, keyless, browser-side:
 *   PubChem PUG REST / PUG View (US NIH)  — identity, structure image, description, research suppliers
 *   Wikidata SPARQL (incl. LOTUS natural-products data) — organisms that contain the compound,
 *       taxon photos, compound classes and uses, legal status by jurisdiction
 *
 * SAFETY POLICY (enforced here, not just in the UI):
 *   - Compounds that are controlled/illegal anywhere, drug precursors, or potent toxins are
 *     "restricted": no supplier lists and no extraction/production details are returned for them.
 *   - The check fails CLOSED: if legal status cannot be loaded, suppliers are hidden.
 *   - "How it is obtained" is a general educational overview plus links to published research,
 *     never a step-by-step procedure.
 */

export interface CompoundIdentity {
  cid: number;
  title: string;
  formula?: string;
  weight?: string;
  iupac?: string;
  inchikey?: string;
  smiles?: string;
  imageUrl: string;
  pubchemUrl: string;
}

export interface Description {
  text: string;
  source: string;
  url?: string;
}

export type Kingdom = 'Plants' | 'Animals' | 'Fungi' | 'Bacteria' | 'Other organisms';

export interface Organism {
  qid: string;
  scientificName: string;
  commonName?: string;
  imageUrl?: string;
  kingdom: Kingdom;
  wikidataUrl: string;
  gbifUrl: string;
}

export interface LegalStatus {
  status: string;
  jurisdiction?: string;
}

export interface Supplier {
  name: string;
  url?: string;
}

export interface Restriction {
  restricted: boolean;
  reasons: string[];
  /** true when the legal check itself failed: treat as restricted for suppliers. */
  unverified: boolean;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';

/**
 * Fetch JSON with a hard time limit so no section can spin forever. A slow or failing source makes
 * only its own section show "could not load"; legal-status failures keep suppliers hidden.
 */
async function getJson(f: Fetcher, url: string, signal?: AbortSignal, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await f(url, { signal: ctrl.signal, headers: { Accept: 'application/sparql-results+json, application/json' } });
    if (!res.ok) throw new Error(res.status === 404 ? 'not-found' : `HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (ctrl.signal.aborted && !signal?.aborted) throw new Error('timeout');
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/**
 * Remember successful results in this browser for 7 days so repeat searches are instant.
 * Storage may be unavailable (private mode): then it simply fetches every time.
 */
const CACHE_PREFIX = 'biopulse:compound:v2:';
const CACHE_TTL = 7 * 24 * 3600 * 1000;
export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const k = CACHE_PREFIX + key.toLowerCase();
  try {
    const hit = JSON.parse(localStorage.getItem(k) ?? 'null') as { at: number; v: T } | null;
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.v;
  } catch {
    /* no cache */
  }
  const v = await fn();
  try {
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), v }));
  } catch {
    /* storage full or blocked */
  }
  return v;
}

// ---------------- PubChem ----------------

export async function autocomplete(q: string, f: Fetcher = fetch, signal?: AbortSignal): Promise<string[]> {
  if (q.trim().length < 2) return [];
  const j = await getJson(f, `https://pubchem.ncbi.nlm.nih.gov/rest/autocomplete/compound/${encodeURIComponent(q.trim())}/json?limit=8`, signal);
  return arr(j?.dictionary_terms?.compound).filter((s) => typeof s === 'string');
}

export function mapIdentity(j: any): CompoundIdentity | null {
  const p = arr(j?.PropertyTable?.Properties)[0];
  const cid = Number(p?.CID);
  if (!Number.isInteger(cid) || cid <= 0) return null;
  return {
    cid,
    title: String(p.Title ?? ''),
    formula: p.MolecularFormula,
    weight: p.MolecularWeight != null ? String(p.MolecularWeight) : undefined,
    iupac: p.IUPACName,
    inchikey: typeof p.InChIKey === 'string' && /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(p.InChIKey) ? p.InChIKey : undefined,
    smiles: p.CanonicalSMILES ?? p.ConnectivitySMILES ?? p.SMILES,
    imageUrl: `${PUG}/compound/cid/${cid}/PNG?image_size=300x300`,
    pubchemUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
  };
}

export async function lookupCompound(name: string, f: Fetcher = fetch, signal?: AbortSignal): Promise<CompoundIdentity | null> {
  const props = 'Title,MolecularFormula,MolecularWeight,IUPACName,InChIKey,CanonicalSMILES';
  try {
    return mapIdentity(await getJson(f, `${PUG}/compound/name/${encodeURIComponent(name.trim())}/property/${props}/JSON`, signal));
  } catch (e) {
    if (e instanceof Error && e.message === 'not-found') return null;
    throw e;
  }
}

export function mapDescriptions(j: any): Description[] {
  return arr(j?.InformationList?.Information)
    .filter((i) => typeof i?.Description === 'string' && i.Description.length > 20)
    .map((i) => ({ text: String(i.Description).replace(/\s+/g, ' ').trim(), source: String(i.DescriptionSourceName ?? 'PubChem'), url: /^https:\/\//.test(i.DescriptionURL ?? '') ? i.DescriptionURL : undefined }))
    .slice(0, 3);
}

export async function getDescriptions(cid: number, f: Fetcher = fetch, signal?: AbortSignal): Promise<Description[]> {
  return mapDescriptions(await getJson(f, `${PUG}/compound/cid/${cid}/description/JSON`, signal));
}

export async function getSynonyms(cid: number, f: Fetcher = fetch, signal?: AbortSignal): Promise<string[]> {
  const j = await getJson(f, `${PUG}/compound/cid/${cid}/synonyms/JSON`, signal);
  return arr(arr(j?.InformationList?.Information)[0]?.Synonym).filter((s) => typeof s === 'string').slice(0, 60);
}

/** PubChem "source categories": research-chemical vendors, plus regulatory sources used as a safety signal. */
export function mapCategories(j: any): { suppliers: Supplier[]; regulatorySources: string[] } {
  const cats = arr(j?.SourceCategories?.Categories);
  const vendors = cats.find((c) => /chemical vendors/i.test(c?.Category ?? ''));
  const seen = new Set<string>();
  const suppliers: Supplier[] = [];
  for (const s of arr(vendors?.Sources)) {
    const name = String(s?.SourceName ?? '').trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const url = typeof s?.SourceRecordURL === 'string' && /^https:\/\//.test(s.SourceRecordURL) ? s.SourceRecordURL : undefined;
    suppliers.push({ name, url });
  }
  const regulatorySources = cats
    .flatMap((c) => arr(c?.Sources).map((s) => String(s?.SourceName ?? '')))
    .filter((n) => /\bDEA\b|drug enforcement|UNODC|EMCDDA|EUDA|controlled substance|narcotic/i.test(n));
  return { suppliers: suppliers.slice(0, 40), regulatorySources: [...new Set(regulatorySources)] };
}

export async function getCategories(cid: number, f: Fetcher = fetch, signal?: AbortSignal) {
  return mapCategories(await getJson(f, `https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/categories/compound/${cid}/JSON`, signal));
}

// ---------------- Wikidata (LOTUS natural products, legal status, classes) ----------------
// Fast path (verified against the live services): the Action API finds the item by InChIKey and
// reads only the needed claims; SPARQL is used only for taxon details by item id (VALUES), which is
// quick. The earlier InChIKey + label-join SPARQL query could hang for over 60 s.

const KINGDOMS: Record<string, Kingdom> = { Q756: 'Plants', Q729: 'Animals', Q764: 'Fungi', Q10876: 'Bacteria' };
const INCHIKEY = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;
const QID = /^Q\d+$/;

/** InChIKeys are inserted into search text, so only the strict format is ever accepted. */
export function assertInchiKey(k: string) {
  if (!INCHIKEY.test(k)) throw new Error('invalid InChIKey');
}

const bindings = (j: any): any[] => arr(j?.results?.bindings);
const val = (b: any, k: string): string | undefined => (typeof b?.[k]?.value === 'string' ? b[k].value : undefined);
const qidOf = (uri?: string) => (uri && /\/entity\/(Q\d+)$/.exec(uri)?.[1]) || undefined;

/** Commons file URL -> small https thumbnail. */
export function thumb(commonsUrl?: string, width = 240): string | undefined {
  if (!commonsUrl) return undefined;
  const u = commonsUrl.replace(/^http:/, 'https:');
  return /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(u) ? `${u}?width=${width}` : undefined;
}

const wdApi = (params: Record<string, string>) => `https://www.wikidata.org/w/api.php?${new URLSearchParams({ ...params, format: 'json', origin: '*' })}`;

export function searchItemUrl(inchikey: string): string {
  assertInchiKey(inchikey);
  return wdApi({ action: 'query', list: 'search', srsearch: `haswbstatement:P235=${inchikey}`, srlimit: '1' });
}

export function mapItemSearch(j: any): string | null {
  const t = arr(j?.query?.search)[0]?.title;
  return typeof t === 'string' && QID.test(t) ? t : null;
}

export interface ClaimRef {
  id: string;
  jurisdictions: string[];
}

/** wbgetclaims -> item ids of the claim values (+ "applies to jurisdiction" qualifiers). */
export function mapClaims(j: any, prop: string): ClaimRef[] {
  return arr(j?.claims?.[prop])
    .filter((c) => c?.rank !== 'deprecated')
    .map((c) => ({
      id: c?.mainsnak?.datavalue?.value?.id,
      jurisdictions: arr(c?.qualifiers?.P1001).map((q) => q?.datavalue?.value?.id).filter((x) => typeof x === 'string' && QID.test(x)),
    }))
    .filter((c) => typeof c.id === 'string' && QID.test(c.id));
}

export function mapLabels(j: any): Map<string, string> {
  const m = new Map<string, string>();
  for (const [id, e] of Object.entries<any>(j?.entities ?? {})) {
    const l = e?.labels?.en?.value;
    if (typeof l === 'string') m.set(id, l);
  }
  return m;
}

export function taxaQuery(qids: string[]): string {
  const ids = qids.filter((q) => QID.test(q));
  return `SELECT ?taxon ?name ?common ?image ?k WHERE {
  VALUES ?taxon { ${ids.map((q) => `wd:${q}`).join(' ')} }
  ?taxon wdt:P225 ?name .
  OPTIONAL { ?taxon wdt:P1843 ?common . FILTER(LANG(?common) = "en") }
  OPTIONAL { ?taxon wdt:P18 ?image }
  OPTIONAL { VALUES ?k { wd:Q756 wd:Q729 wd:Q764 wd:Q10876 } ?taxon wdt:P171* ?k }
}`;
}

export function mapOrganisms(j: any): Organism[] {
  const byQid = new Map<string, Organism>();
  for (const b of bindings(j)) {
    const qid = qidOf(val(b, 'taxon'));
    const name = val(b, 'name');
    if (!qid || !name) continue;
    const kingdom = KINGDOMS[qidOf(val(b, 'k')) ?? ''];
    const existing = byQid.get(qid);
    if (existing) {
      existing.commonName ??= val(b, 'common');
      existing.imageUrl ??= thumb(val(b, 'image'));
      if (kingdom && existing.kingdom === 'Other organisms') existing.kingdom = kingdom;
      continue;
    }
    byQid.set(qid, {
      qid,
      scientificName: name,
      commonName: val(b, 'common'),
      imageUrl: thumb(val(b, 'image')),
      kingdom: kingdom ?? 'Other organisms',
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      gbifUrl: `https://www.gbif.org/species/search?q=${encodeURIComponent(name)}`,
    });
  }
  return [...byQid.values()].sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || a.scientificName.localeCompare(b.scientificName));
}

// --- loaders (memoised per InChIKey so organisms and facts share one item lookup) ---
const itemCache = new Map<string, Promise<string | null>>();
export function findItem(inchikey: string, f: Fetcher = fetch): Promise<string | null> {
  const key = inchikey;
  if (!itemCache.has(key)) {
    const p = getJson(f, searchItemUrl(inchikey)).then(mapItemSearch);
    p.catch(() => itemCache.delete(key));
    itemCache.set(key, p);
  }
  return itemCache.get(key)!;
}
export const __clearItemCache = () => itemCache.clear();

async function claims(qid: string, prop: string, f: Fetcher, signal?: AbortSignal) {
  return mapClaims(await getJson(f, wdApi({ action: 'wbgetclaims', entity: qid, property: prop }), signal), prop);
}

async function labels(qids: string[], f: Fetcher, signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = [...new Set(qids)].filter((q) => QID.test(q));
  for (let i = 0; i < uniq.length; i += 50) {
    const j = await getJson(f, wdApi({ action: 'wbgetentities', ids: uniq.slice(i, i + 50).join('|'), props: 'labels', languages: 'en' }), signal);
    mapLabels(j).forEach((v, k) => out.set(k, v));
  }
  return out;
}

export async function getOrganisms(inchikey: string, f: Fetcher = fetch, signal?: AbortSignal): Promise<Organism[]> {
  const item = await findItem(inchikey, f);
  if (!item) return [];
  const taxa = [...new Set((await claims(item, 'P703', f, signal)).map((c) => c.id))].slice(0, 400);
  if (!taxa.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < taxa.length; i += 100) chunks.push(taxa.slice(i, i + 100));
  try {
    const results = await Promise.all(chunks.map((c) => getJson(f, `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(taxaQuery(c))}`, signal, 15_000)));
    const merged = { results: { bindings: results.flatMap((r) => bindings(r)) } };
    const orgs = mapOrganisms(merged);
    if (orgs.length) return orgs;
  } catch {
    /* fall through to the label-only fallback below */
  }
  // Fallback without the query service: names only (no photos or kingdom grouping).
  const names = await labels(taxa, f, signal);
  return mapOrganisms({ results: { bindings: taxa.filter((q) => names.has(q)).map((q) => ({ taxon: { value: `http://www.wikidata.org/entity/${q}` }, name: { value: names.get(q) } })) } });
}

export async function getFacts(inchikey: string, f: Fetcher = fetch, signal?: AbortSignal): Promise<{ classes: string[]; uses: string[]; legal: LegalStatus[] }> {
  const item = await findItem(inchikey, f);
  if (!item) return { classes: [], uses: [], legal: [] }; // not on Wikidata: no records (other safety checks still apply)
  const [p31, p279, p366, p3493] = await Promise.all(['P31', 'P279', 'P366', 'P3493'].map((p) => claims(item, p, f, signal)));
  const names = await labels([...p31, ...p279, ...p366, ...p3493].flatMap((c) => [c.id, ...c.jurisdictions]), f, signal);
  const lab = (c: ClaimRef) => names.get(c.id);
  const legal: LegalStatus[] = [];
  for (const c of p3493) {
    const status = lab(c);
    if (!status) continue;
    const jurs = c.jurisdictions.map((q) => names.get(q)).filter(Boolean) as string[];
    if (jurs.length) for (const j of jurs) legal.push({ status, jurisdiction: j });
    else legal.push({ status });
  }
  return {
    classes: [...new Set([...p31, ...p279].map(lab).filter(Boolean) as string[])].slice(0, 12),
    uses: [...new Set(p366.map(lab).filter(Boolean) as string[])].slice(0, 12),
    legal,
  };
}

// ---------------- Safety ----------------

/**
 * Names (lower-case) of internationally controlled drugs, common precursors and potent toxins.
 * Matching any PubChem title/synonym marks the compound restricted. This list is a conservative
 * backstop; Wikidata legal status and PubChem regulatory sources are also checked.
 */
export const RESTRICTED_NAMES = new Set([
  // opioids & opiates
  'morphine', 'heroin', 'diacetylmorphine', 'codeine', 'thebaine', 'oripavine', 'oxycodone', 'hydrocodone', 'fentanyl', 'carfentanil', 'methadone', 'opium', 'tramadol', 'buprenorphine', 'pethidine', 'meperidine', 'tapentadol',
  // stimulants
  'cocaine', 'ecgonine', 'amphetamine', 'methamphetamine', 'cathinone', 'cathine', 'methcathinone', 'mephedrone', 'mdpv', 'methylphenidate', 'ephedrine', 'pseudoephedrine', 'norephedrine', 'phenylpropanolamine',
  // psychedelics & dissociatives
  'lsd', 'lysergide', 'lysergic acid diethylamide', 'lysergic acid', 'ergine', 'psilocybin', 'psilocin', 'mescaline', 'dmt', 'n,n-dimethyltryptamine', '5-meo-dmt', 'bufotenine', 'ibogaine', 'mdma', 'mda', 'mdea', 'ketamine', 'phencyclidine', 'pcp', 'salvinorin a', 'dom', '2c-b',
  // cannabinoids
  'tetrahydrocannabinol', 'thc', 'dronabinol', 'delta-9-tetrahydrocannabinol', 'cannabis', 'hashish', 'jwh-018',
  // depressants
  'ghb', 'gamma-hydroxybutyric acid', 'sodium oxybate', 'gamma-butyrolactone', 'gbl', 'methaqualone', 'flunitrazepam', 'diazepam', 'alprazolam', 'phenobarbital',
  // precursors
  'safrole', 'isosafrole', 'piperonal', 'phenylacetone', 'p2p', '1-phenyl-2-propanone', 'n-acetylanthranilic acid', 'anthranilic acid', 'acetic anhydride', 'piperonyl methyl ketone', '3,4-mdp-2-p', 'ergometrine', 'ergotamine', 'nphp', '4-anpp',
  // potent toxins / chemical-weapons related
  'ricin', 'abrin', 'saxitoxin', 'tetrodotoxin', 'aconitine', 'strychnine', 'batrachotoxin', 'conotoxin', 'botulinum toxin', 'palytoxin', 'maitotoxin', 'brevetoxin', 'cicutoxin', 'coniine', 'amatoxin', 'alpha-amanitin', 'colchicine', 'nicotine sulfate', 'sarin', 'soman', 'tabun', 'vx', 'sulfur mustard', 'cyanide', 'hydrogen cyanide', 'amygdalin',
]);

const LEGAL_RESTRICTED = /schedule|controlled|prohibited|illegal|narcotic|psychotropic|class [abc]\b|anlage|banned|precursor|list [i1]\b|\bsch\.|NDPS|\bS[89]\b/i;
/** Labels that only mean pharmacy/prescription medicine (not illegal): AU S2–S4, India Schedule G/H/H1, OTC, Rx. */
const MEDICINE_ONLY = /(\b(S|Schedule )[234]\b.*Australia|Australia.*\b(S|Schedule )[234]\b|Schedule (G|H1?)\b|over[- ]the[- ]counter|\bOTC\b|prescription|\bRx\b|\bGSL\b|\bPOM\b|pharmacy)/i;

/** True when a legal-status label means the compound is controlled, prohibited or a regulated precursor. */
export function isRestrictiveStatus(status: string): boolean {
  if (MEDICINE_ONLY.test(status) && !/Schedule X|NDPS|\bS[89]\b|Schedule I\b|controlled|narcotic|psychotropic|prohibited/i.test(status)) return false;
  return LEGAL_RESTRICTED.test(status);
}

export function assessRestriction(input: { names: string[]; legal: LegalStatus[] | null; regulatorySources: string[] | null }): Restriction {
  const reasons: string[] = [];
  const hit = input.names.map((n) => n.toLowerCase().trim()).find((n) => RESTRICTED_NAMES.has(n));
  if (hit) reasons.push(`“${hit}” is on BioPulse’s list of controlled drugs, precursors and dangerous toxins`);
  const legalHits = (input.legal ?? []).filter((l) => isRestrictiveStatus(l.status));
  if (legalHits.length) reasons.push(`Listed as ${legalHits[0].status}${legalHits[0].jurisdiction ? ` (${legalHits[0].jurisdiction})` : ''}${legalHits.length > 1 ? ` and ${legalHits.length - 1} more` : ''}`);
  if (input.regulatorySources?.length) reasons.push(`Tracked by drug-control sources (${input.regulatorySources.slice(0, 2).join(', ')})`);
  const unverified = input.legal === null || input.regulatorySources === null;
  return { restricted: reasons.length > 0, reasons, unverified };
}

/** Suppliers may be shown only for a compound positively checked as not restricted. */
export const canShowSuppliers = (r: Restriction) => !r.restricted && !r.unverified;

// ---------------- Plain-language helpers ----------------

export function indiaStatus(legal: LegalStatus[] | null): LegalStatus[] {
  return (legal ?? []).filter((l) => /india/i.test(l.jurisdiction ?? '') || /india|NDPS/i.test(l.status));
}

/** General, non-procedural overview of how natural compounds are obtained (educational). */
export const OBTAINING_OVERVIEW = [
  { title: 'From living sources', text: 'Many natural compounds are isolated from plants, fungi, microbes or animals, usually by separating them with solvents and then purifying them in a laboratory.' },
  { title: 'Chemical synthesis', text: 'Most compounds sold for research or industry are made in chemical plants from simpler starting materials, which gives purer and more consistent products.' },
  { title: 'Biotechnology', text: 'Some are produced by engineered yeast or bacteria in fermentation tanks (for example several vitamins and flavours), which can be more sustainable.' },
];

export const BROWSE_CATEGORIES: { name: string; blurb: string; examples: string[] }[] = [
  { name: 'Vitamins', blurb: 'Nutrients the body needs in small amounts', examples: ['Ascorbic acid', 'Cholecalciferol', 'Riboflavin', 'Retinol'] },
  { name: 'Spices & flavours', blurb: 'What gives food its taste and smell', examples: ['Capsaicin', 'Piperine', 'Vanillin', 'Cinnamaldehyde', 'Menthol'] },
  { name: 'Plant colours', blurb: 'Pigments in fruits, vegetables and flowers', examples: ['Curcumin', 'Beta-carotene', 'Lycopene', 'Chlorophyll a'] },
  { name: 'Medicines from nature', blurb: 'Drugs discovered in plants and microbes', examples: ['Artemisinin', 'Quinine', 'Paclitaxel', 'Salicylic acid', 'Penicillin G'] },
  { name: 'Antioxidants', blurb: 'Studied for protecting cells', examples: ['Quercetin', 'Resveratrol', 'Epigallocatechin gallate', 'Astaxanthin'] },
  { name: 'Scents & oils', blurb: 'Fragrance molecules from essential oils', examples: ['Limonene', 'Linalool', 'Eugenol', 'Geraniol'] },
  { name: 'Everyday stimulants', blurb: 'Found in drinks people use daily', examples: ['Caffeine', 'Theobromine', 'Theanine'] },
  { name: 'From animals & the sea', blurb: 'Compounds made by animals and marine life', examples: ['Taurine', 'Squalene', 'Melatonin', 'Fucoxanthin'] },
];
