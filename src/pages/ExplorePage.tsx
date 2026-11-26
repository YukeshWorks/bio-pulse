import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  assessRestriction,
  autocomplete,
  getInatInfo,
  sentenceCase,
  type InatInfo,
  cached,
  BROWSE_CATEGORIES,
  canShowSuppliers,
  getCategories,
  getDescriptions,
  getFacts,
  getOrganisms,
  getSynonyms,
  indiaStatus,
  lookupCompound,
  OBTAINING_OVERVIEW,
  type CompoundIdentity,
  type Description,
  type Kingdom,
  type LegalStatus,
  type Organism,
  type Supplier,
} from '../lib/compound';
import { Reveal, useInView } from '../lib/motion';

type Load<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'error' };

function useLoad<T>(fn: (() => Promise<T>) | null, deps: unknown[]): Load<T> {
  const [s, set] = useState<Load<T>>({ state: 'loading' });
  useEffect(() => {
    if (!fn) return;
    let alive = true;
    set({ state: 'loading' });
    fn().then(
      (data) => alive && set({ state: 'ok', data }),
      () => alive && set({ state: 'error' }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return fn ? s : { state: 'loading' };
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <Reveal as="section" className="card p-5 sm:p-6">
      <h2 id={id} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </Reveal>
  );
}

const Skeleton = ({ h = 'h-24' }: { h?: string }) => <div className={`skeleton ${h} rounded-xl`} />;
const Failed = ({ what }: { what: string }) => <p className="text-sm text-ev-preprint">Could not load {what} right now. Please try again later.</p>;

// ---------- Search box with suggestions ----------
function CompoundSearch({ initial, big = false }: { initial: string; big?: boolean }) {
  const [, setParams] = useSearchParams();
  const [value, setValue] = useState(initial);
  const [sugs, setSugs] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setValue(initial), [initial]);

  const go = (q: string) => {
    const v = q.trim();
    setSugs([]);
    if (v) setParams({ q: v });
  };
  const onChange = (v: string) => {
    setValue(v);
    setActive(-1);
    clearTimeout(timer.current);
    if (v.trim().length < 2) return setSugs([]);
    timer.current = setTimeout(() => {
      autocomplete(v).then(setSugs, () => setSugs([]));
    }, 250);
  };

  return (
    <form
      role="search"
      className="relative"
      onSubmit={(e) => {
        e.preventDefault();
        go(active >= 0 ? sugs[active] : value);
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative block flex-1">
          <span className="sr-only">Compound name</span>
          <input
            className={`input pl-11 ${big ? 'h-14 text-lg' : 'h-12 text-base'}`}
            type="search"
            autoComplete="off"
            placeholder="Type a compound, e.g. caffeine, curcumin, menthol…"
            value={value}
            maxLength={120}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (!sugs.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(sugs.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(-1, a - 1));
              } else if (e.key === 'Escape') setSugs([]);
            }}
            aria-autocomplete="list"
            aria-controls="compound-suggestions"
            aria-expanded={sugs.length > 0}
          />
          <svg viewBox="0 0 20 20" className={`pointer-events-none absolute left-4 h-5 w-5 text-fg-subtle ${big ? 'top-[18px]' : 'top-3.5'}`} fill="currentColor" aria-hidden>
            <path d="M8.5 3a5.5 5.5 0 014.38 8.82l3.65 3.65-1.06 1.06-3.65-3.65A5.5 5.5 0 118.5 3zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
          </svg>
          {sugs.length > 0 && (
            <ul id="compound-suggestions" role="listbox" className="animate-menu absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 shadow-xl">
              {sugs.map((s, i) => (
                <li key={s} role="option" aria-selected={i === active}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(s)} className={`block w-full px-4 py-2.5 text-left text-sm ${i === active ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:bg-ink-700 hover:text-fg'}`}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </label>
        <button type="submit" className={`rounded-lg bg-accent px-7 font-semibold text-ink-950 transition hover:brightness-110 active:scale-[0.98] ${big ? 'h-14 text-base' : 'h-12 text-sm'}`}>
          Explore
        </button>
      </div>
    </form>
  );
}

// ---------- Landing ----------
function Landing() {
  const [, setParams] = useSearchParams();
  return (
    <div className="space-y-10">
      <section className="card relative overflow-hidden p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="text-sm font-semibold text-accent">Compound explorer</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Which plants, animals and microbes make a compound?</h1>
          <p className="mt-3 text-[17px] leading-relaxed text-fg-muted">
            Type any natural compound to see what it is, the living things it has been found in (with photos and scientific names), whether it is legal, how it is generally obtained, and where researchers can buy it.
          </p>
          <div className="mt-6">
            <CompoundSearch initial="" big />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg-subtle">Try:</span>
            {['Caffeine', 'Curcumin', 'Capsaicin', 'Menthol', 'Quercetin', 'Artemisinin'].map((x) => (
              <button key={x} type="button" onClick={() => setParams({ q: x })} className="rounded-full border border-ink-600 bg-ink-850 px-3 py-1.5 text-sm text-fg-muted transition hover:-translate-y-0.5 hover:border-accent/60 hover:text-fg">
                {x}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="browse-title">
        <h2 id="browse-title" className="mb-4 text-xl font-semibold tracking-tight">
          Browse by category
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BROWSE_CATEGORIES.map((c, i) => (
            <Reveal key={c.name} delay={(i % 4) * 60} className="card card-hover p-4">
              <h3 className="font-semibold text-fg">{c.name}</h3>
              <p className="mt-0.5 text-sm text-fg-subtle">{c.blurb}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {c.examples.map((x) => (
                  <button key={x} type="button" onClick={() => setParams({ q: x })} className="rounded-full border border-ink-600 px-2.5 py-1 text-xs text-fg-muted transition hover:border-accent/60 hover:text-fg">
                    {x}
                  </button>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <p className="text-sm text-fg-subtle">
        Data: PubChem (US National Institutes of Health) and Wikidata, including the LOTUS natural-products database. Free and open. Looking for today’s biotech research?{' '}
        <Link to="/news" className="link">
          Read the daily news
        </Link>
        .
      </p>
    </div>
  );
}

// ---------- Result sections ----------
const KINGDOM_ORDER: Kingdom[] = ['Plants', 'Animals', 'Fungi', 'Bacteria', 'Other organisms'];
const KINGDOM_SINGULAR: Record<Kingdom, string> = { Plants: 'plant', Animals: 'animal', Fungi: 'fungus', Bacteria: 'bacterium', 'Other organisms': 'other organism' };
const kingdomCount = (k: Kingdom, n: number) => `${n} ${n === 1 ? KINGDOM_SINGULAR[k] : k.toLowerCase()}`;
const KINGDOM_ICON: Record<Kingdom, string> = { Plants: '🌿', Animals: '🐾', Fungi: '🍄', Bacteria: '🦠', 'Other organisms': '🔬' };

/**
 * One organism. If Wikidata has no photo, common name or group, iNaturalist fills the gaps when the
 * card scrolls into view (cached per species). Scientific names keep their correct case and italics.
 */
function OrganismCard({ o, index, onKingdom }: { o: Organism; index: number; onKingdom: (qid: string, k: Kingdom) => void }) {
  const [ref, visible] = useInView<HTMLLIElement>('200px');
  const needsInat = !o.imageUrl || !o.commonName || o.kingdom === 'Other organisms';
  const inat = useLoad<InatInfo>(visible && needsInat ? () => cached(`inat:${o.scientificName}`, () => getInatInfo(o.scientificName)) : null, [visible, o.scientificName]);
  const extra: InatInfo = inat.state === 'ok' ? inat.data : {};
  const image = o.imageUrl ?? extra.imageUrl;
  const common = o.commonName ?? extra.commonName;
  const kingdom = o.kingdom === 'Other organisms' && extra.kingdom ? extra.kingdom : o.kingdom;
  useEffect(() => {
    if (kingdom !== o.kingdom) onKingdom(o.qid, kingdom);
  }, [kingdom, o.kingdom, o.qid, onKingdom]);
  const [broken, setBroken] = useState(false);
  return (
    <li ref={ref} className="card card-hover animate-rise overflow-hidden" style={{ animationDelay: `${(index % 8) * 30}ms` }}>
      <a href={extra.url ?? o.wikidataUrl} target="_blank" rel="noopener noreferrer" className="block">
        <div className="relative flex aspect-[4/3] items-center justify-center bg-ink-800">
          {image && !broken ? (
            <img src={image} alt={common ? `${sentenceCase(common)} (${o.scientificName})` : o.scientificName} loading="lazy" className="h-full w-full object-cover" referrerPolicy="no-referrer" onError={() => setBroken(true)} title={o.imageUrl ? 'Photo: Wikimedia Commons' : extra.credit} />
          ) : needsInat && visible && inat.state === 'loading' ? (
            <span className="skeleton absolute inset-0" />
          ) : (
            <span className="text-4xl opacity-60" aria-hidden>
              {KINGDOM_ICON[kingdom]}
            </span>
          )}
        </div>
        <div className="p-3">
          {common ? (
            <>
              <p className="truncate text-sm font-semibold text-fg">{sentenceCase(common)}</p>
              <p className="truncate text-xs italic text-fg-subtle">{o.scientificName}</p>
            </>
          ) : (
            <p className="truncate text-sm font-semibold italic text-fg">{o.scientificName}</p>
          )}
          <p className="mt-1 text-[11px] text-fg-subtle">
            {KINGDOM_ICON[kingdom]} {kingdom}
          </p>
          {!o.imageUrl && extra.credit && image && <p className="mt-1 truncate text-[10px] text-fg-subtle" title={extra.credit}>Photo: {extra.credit}</p>}
        </div>
      </a>
    </li>
  );
}

function Organisms({ load, name, onKingdom }: { load: Load<Organism[]>; name: string; onKingdom: (qid: string, k: Kingdom) => void }) {
  const [tab, setTab] = useState<Kingdom | 'All'>('All');
  const [limit, setLimit] = useState(24);
  if (load.state === 'loading') return <Skeleton h="h-48" />;
  if (load.state === 'error') return <Failed what="the organisms list" />;
  const all = load.data;
  if (!all.length)
    return <p className="text-sm text-fg-muted">No living sources are recorded for {name} in the open natural-products data. It may be made only by chemists, or simply not yet recorded.</p>;
  const counts = Object.fromEntries(KINGDOM_ORDER.map((k) => [k, all.filter((o) => o.kingdom === k).length])) as Record<Kingdom, number>;
  const shown = tab === 'All' ? all : all.filter((o) => o.kingdom === tab);
  return (
    <>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by type of organism">
        {(['All', ...KINGDOM_ORDER] as const)
          .filter((k) => k === 'All' || counts[k])
          .map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => (setTab(k), setLimit(24))} className={`chip text-sm ${tab === k ? 'border-accent/60 text-fg' : ''}`}>
              {k === 'All' ? 'All' : `${KINGDOM_ICON[k]} ${k}`} <span className="tabular-nums text-fg-subtle">{k === 'All' ? all.length : counts[k]}</span>
            </button>
          ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown.slice(0, limit).map((o, i) => (
          <OrganismCard key={o.qid} o={o} index={i} onKingdom={onKingdom} />
        ))}
      </ul>
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + 48)} className="mt-4 rounded-lg border border-ink-600 px-4 py-2 text-sm text-fg-muted hover:border-accent/60 hover:text-fg">
          Show more ({shown.length - limit} more)
        </button>
      )}
      <p className="mt-4 text-xs text-fg-subtle">
        Source: LOTUS natural-products data on Wikidata, compiled from published research. “Found in” means at least one study detected it; amounts can be tiny and vary by part of the organism, region and season. Photos from Wikimedia Commons and iNaturalist (credited on each photo).
      </p>
    </>
  );
}

function Legal({ legal, name, restricted }: { legal: LegalStatus[] | null; name: string; restricted: boolean }) {
  if (legal === null) return <Failed what="legal status" />;
  const india = indiaStatus(legal);
  const others = legal.filter((l) => !india.includes(l));
  return (
    <div className="space-y-4">
      <div className={`rounded-xl border px-4 py-3 ${india.length ? 'border-ev-preprint/40 bg-ev-preprint/10' : 'border-ink-600 bg-ink-850'}`}>
        <p className="text-sm font-semibold text-fg">🇮🇳 India</p>
        {india.length ? (
          <ul className="mt-1 text-sm text-fg-muted">
            {india.map((l) => (
              <li key={l.status}>{l.status}</li>
            ))}
          </ul>
        ) : restricted ? (
          <p className="mt-1 text-sm text-fg-muted">
            No India-specific record in the open data, but {name} is controlled internationally. In India, substances like this are usually covered by the{' '}
            <a className="link" href="https://www.indiacode.nic.in/handle/123456789/1791" target="_blank" rel="noopener noreferrer">
              NDPS Act
            </a>
            , and possessing or selling them without a licence is a serious offence. Treat it as illegal unless an official source says otherwise.
          </p>
        ) : (
          <p className="mt-1 text-sm text-fg-muted">
            No India-specific record in the open data for {name}. For drugs and chemicals, India’s rules are the{' '}
            <a className="link" href="https://www.indiacode.nic.in/handle/123456789/1791" target="_blank" rel="noopener noreferrer">
              NDPS Act
            </a>{' '}
            and the{' '}
            <a className="link" href="https://cdsco.gov.in/" target="_blank" rel="noopener noreferrer">
              CDSCO
            </a>{' '}
            drug rules; food additives follow{' '}
            <a className="link" href="https://www.fssai.gov.in/" target="_blank" rel="noopener noreferrer">
              FSSAI
            </a>
            .
          </p>
        )}
      </div>
      {others.length > 0 ? (
        <ul className="divide-y divide-ink-600/50 rounded-xl border border-ink-600">
          {others.map((l) => (
            <li key={`${l.status}|${l.jurisdiction}`} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:justify-between sm:gap-4">
              <span className="text-fg">{l.jurisdiction ?? 'General'}</span>
              <span className="text-fg-muted">{l.status}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">No drug-control or medicine listings found for other countries either. That usually means it is not a regulated drug, but it can still be regulated as a food additive, pesticide or chemical.</p>
      )}
      <p className="text-xs text-fg-subtle">From Wikidata’s “legal status (medicine)” records. Laws change and records can be incomplete — this is not legal advice. Check your country’s official sources before buying, selling or carrying any substance.</p>
    </div>
  );
}

function Suppliers({ suppliers, show, restricted, unverified, name }: { suppliers: Supplier[] | null; show: boolean; restricted: boolean; unverified: boolean; name: string }) {
  if (restricted)
    return <p className="text-sm text-fg-muted">Hidden. {name} is controlled or dangerous, so BioPulse does not list where to buy it in any country.</p>;
  if (unverified || !show)
    return <p className="text-sm text-fg-muted">Hidden for now — the legal status could not be checked, so suppliers are not shown. Please try again later.</p>;
  if (!suppliers) return <Skeleton />;
  if (!suppliers.length) return <p className="text-sm text-fg-muted">PubChem lists no research suppliers for this compound.</p>;
  return (
    <>
      <ul className="flex flex-wrap gap-2">
        {suppliers.slice(0, 24).map((s) => (
          <li key={s.name}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="chip text-sm hover:border-accent/60 hover:text-fg">
                {s.name} ↗
              </a>
            ) : (
              <span className="chip text-sm">{s.name}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-fg-subtle">
        Research-chemical suppliers listed by PubChem. Most sell laboratory-grade material to labs and businesses, not food or medicine. For food, supplements or cosmetics, buy only from licensed retailers in your country and follow local rules.
      </p>
    </>
  );
}

function DidYouMean({ q }: { q: string }) {
  const [, setParams] = useSearchParams();
  const sugs = useLoad(() => autocomplete(q.slice(0, Math.max(3, q.length - 2))), [q]);
  if (sugs.state !== 'ok' || !sugs.data.length) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg-subtle">Did you mean:</span>
      {sugs.data.slice(0, 6).map((s) => (
        <button key={s} type="button" onClick={() => setParams({ q: s })} className="rounded-full border border-ink-600 px-3 py-1 text-sm text-fg-muted hover:border-accent/60 hover:text-fg">
          {s}
        </button>
      ))}
    </div>
  );
}

function Result({ q }: { q: string }) {
  const id = useLoad(() => cached(`id:${q}`, () => lookupCompound(q)), [q]);
  const ident: CompoundIdentity | null = id.state === 'ok' ? id.data : null;
  const cid = ident?.cid;
  const key = ident?.inchikey;
  const desc = useLoad<Description[]>(cid ? () => cached(`desc:${cid}`, () => getDescriptions(cid)) : null, [cid]);
  const syn = useLoad<string[]>(cid ? () => cached(`syn:${cid}`, () => getSynonyms(cid)) : null, [cid]);
  const cats = useLoad(cid ? () => cached(`cats:${cid}`, () => getCategories(cid)) : null, [cid]);
  const facts = useLoad(key ? () => cached(`facts:${key}`, () => getFacts(key)) : null, [key]);
  const orgs = useLoad<Organism[]>(key ? () => cached(`orgs:${key}`, () => getOrganisms(key)) : null, [key]);
  // Groups learned from iNaturalist (for organisms Wikidata could not place) update counts and tabs.
  const [kingdomFix, setKingdomFix] = useState<Record<string, Kingdom>>({});
  const onKingdom = useCallback((qid: string, k: Kingdom) => setKingdomFix((m) => (m[qid] === k ? m : { ...m, [qid]: k })), []);
  const orgsEff: Load<Organism[]> = orgs.state === 'ok' ? { state: 'ok', data: orgs.data.map((o) => (kingdomFix[o.qid] ? { ...o, kingdom: kingdomFix[o.qid] } : o)) } : orgs;

  const legal = facts.state === 'ok' ? facts.data.legal : facts.state === 'error' || (ident && !key) ? null : undefined;
  const restriction = useMemo(() => {
    if (!ident || syn.state === 'loading' || cats.state === 'loading' || legal === undefined) return null;
    return assessRestriction({
      names: [ident.title, ...(syn.state === 'ok' ? syn.data : [])],
      legal,
      regulatorySources: cats.state === 'ok' ? cats.data.regulatorySources : null,
    });
  }, [ident, syn, cats, legal]);

  if (id.state === 'loading')
    return (
      <div className="space-y-4">
        <Skeleton h="h-56" />
        <Skeleton h="h-40" />
      </div>
    );
  if (id.state === 'error') return <Failed what="this compound" />;
  if (!ident)
    return (
      <div className="card p-6">
        <p className="text-lg text-fg">No compound called “{q}” was found.</p>
        <p className="mt-1 text-sm text-fg-muted">Check the spelling, or try the common name (e.g. “vitamin C”) or the chemical name (e.g. “ascorbic acid”).</p>
        <DidYouMean q={q} />
      </div>
    );

  const name = ident.title || q;
  const firstDesc = desc.state === 'ok' ? desc.data[0] : undefined;
  const orgCount = orgsEff.state === 'ok' ? orgsEff.data.length : null;
  const byKingdom = orgsEff.state === 'ok' ? KINGDOM_ORDER.map((k) => [k, orgsEff.data.filter((o) => o.kingdom === k).length] as const).filter(([, n]) => n) : [];

  return (
    <div className="space-y-5">
      {/* Overview */}
      <section className="card overflow-hidden p-5 sm:p-6" aria-labelledby="compound-title">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex shrink-0 items-center justify-center rounded-xl bg-white p-2 sm:h-44 sm:w-44">
            <img src={ident.imageUrl} alt={`Chemical structure of ${name}`} className="h-40 w-40 object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 id="compound-title" className="text-3xl font-semibold tracking-tight">
              {name}
            </h1>
            <p className="mt-1 text-sm text-fg-subtle">
              {ident.formula && <>Formula {ident.formula}</>}
              {ident.weight && <> · {Number(ident.weight).toFixed(2)} g/mol</>}
              {' · '}
              <a className="link" href={ident.pubchemUrl} target="_blank" rel="noopener noreferrer">
                PubChem {ident.cid}
              </a>
            </p>
            {orgCount !== null && (
              <p className="mt-3 text-[17px] text-fg">
                Found in <strong className="text-accent">{orgCount}</strong> organism{orgCount === 1 ? '' : 's'}
                {byKingdom.length > 0 && <span className="text-fg-muted"> — {byKingdom.map(([k, n]) => kingdomCount(k, n)).join(', ')}</span>}
              </p>
            )}
            {facts.state === 'ok' && facts.data.classes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {facts.data.classes.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            )}
            {firstDesc ? (
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                {firstDesc.text}{' '}
                <span className="text-xs text-fg-subtle">
                  — {firstDesc.url ? (
                    <a className="hover:text-fg" href={firstDesc.url} target="_blank" rel="noopener noreferrer">
                      {firstDesc.source}
                    </a>
                  ) : (
                    firstDesc.source
                  )}
                </span>
              </p>
            ) : desc.state === 'loading' ? (
              <div className="mt-3">
                <Skeleton h="h-16" />
              </div>
            ) : null}
            {facts.state === 'ok' && facts.data.uses.length > 0 && (
              <p className="mt-3 text-sm text-fg-muted">
                <span className="font-medium text-fg">Used as:</span> {facts.data.uses.join(', ')}
              </p>
            )}
          </div>
        </div>
      </section>

      {restriction?.restricted && (
        <div className="rounded-xl border border-ev-reg/50 bg-ev-reg/10 px-4 py-3 text-sm text-ev-reg" role="alert">
          <p className="font-semibold">Controlled or dangerous substance</p>
          <p className="mt-1 text-fg-muted">BioPulse shows the science, natural sources and legal status for education only. It does not show where to buy it or how to extract or make it.</p>
          <ul className="mt-1 list-disc pl-5 text-fg-muted">
            {restriction.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <Section id="organisms-title" title={`Where ${name} is found in nature`} subtitle="Plants, animals, fungi and microbes in which it has been detected.">
        <Organisms load={key ? orgsEff : { state: 'ok', data: [] }} name={name} onKingdom={onKingdom} />
      </Section>

      <Section id="legal-title" title="Is it legal?" subtitle="India first, then other countries.">
        {legal === undefined ? <Skeleton /> : <Legal legal={legal} name={name} restricted={Boolean(restriction?.restricted)} />}
      </Section>

      <Section id="methods-title" title="How it is obtained" subtitle="A general overview — not instructions.">
        {restriction === null ? (
          <Skeleton />
        ) : restriction.restricted ? (
          <p className="text-sm text-fg-muted">Not shown for controlled or dangerous substances.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {OBTAINING_OVERVIEW.map((m) => (
                <div key={m.title} className="rounded-xl border border-ink-600 p-4">
                  <p className="font-medium text-fg">{m.title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{m.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm">
              <Link to={`/search?q=${encodeURIComponent(`${name} extraction production`)}`} className="link">
                Read published research on how {name} is extracted or produced →
              </Link>
            </p>
          </>
        )}
      </Section>

      <Section id="buy-title" title="Where researchers can buy it" subtitle="Laboratory suppliers, for legal compounds only.">
        {restriction === null ? (
          <Skeleton />
        ) : (
          <Suppliers suppliers={cats.state === 'ok' ? cats.data.suppliers : cats.state === 'error' ? [] : null} show={canShowSuppliers(restriction)} restricted={restriction.restricted} unverified={restriction.unverified} name={name} />
        )}
      </Section>

      {syn.state === 'ok' && syn.data.length > 1 && (
        <details className="card p-5 text-sm text-fg-muted">
          <summary className="cursor-pointer font-medium text-fg">Other names ({Math.min(syn.data.length, 30)})</summary>
          <p className="mt-2 leading-relaxed">{syn.data.slice(0, 30).join(' · ')}</p>
        </details>
      )}
    </div>
  );
}

export function ExplorePage() {
  const [params] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  return q ? (
    <div className="space-y-6">
      <CompoundSearch initial={q} />
      <Result key={q} q={q} />
    </div>
  ) : (
    <Landing />
  );
}
