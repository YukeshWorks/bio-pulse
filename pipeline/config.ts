import path from 'node:path';

export interface FeedConfig {
  name: string;
  url: string;
}

export interface PipelineConfig {
  dataDir: string;
  /** Days of history (ending on the run date) requested from literature sources; overlap is removed against the archive. */
  lookbackDays: number;
  /** Patent offices publish weekly, so patents use a longer window. */
  patentLookbackDays: number;
  /** Days of previous archives used to suppress records that were already published. */
  seenWindowDays: number;
  maxRecordsPerDay: number;
  pubmedPerCategory: number;
  europePmcMax: number;
  preprintMaxPages: number;
  trialsMax: number;
  verifyUrls: boolean;
  /** Maximum number of record URLs checked live per run (highest-ranked first). */
  verifyUrlLimit: number;
  /** Top discoveries and briefing citations must have a live-verified URL. */
  requireVerifiedFeatured: boolean;
  regulatoryFeeds: { fda: FeedConfig[]; ema: FeedConfig[] };
  companyFeeds: FeedConfig[];
  epo: { query: string; maxResults: number };
  ai: { enabled: boolean; model: string; effort: 'low' | 'medium' | 'high'; maxRecords: number };
}

function intEnv(env: Record<string, string | undefined>, key: string, fallback: number): number {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

function boolEnv(env: Record<string, string | undefined>, key: string, fallback: boolean): boolean {
  const v = env[key]?.toLowerCase();
  if (v === undefined || v === '') return fallback;
  return v === '1' || v === 'true' || v === 'yes';
}

function parseFeeds(raw: string | undefined): FeedConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((f): f is FeedConfig => typeof f?.name === 'string' && typeof f?.url === 'string' && /^https:\/\//.test(f.url))
      .map((f) => ({ name: f.name, url: f.url }));
  } catch {
    return [];
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): PipelineConfig {
  return {
    dataDir: path.resolve(env.BIOPULSE_DATA_DIR ?? 'public/data'),
    lookbackDays: intEnv(env, 'BIOPULSE_LOOKBACK_DAYS', 2),
    patentLookbackDays: intEnv(env, 'BIOPULSE_PATENT_LOOKBACK_DAYS', 7),
    seenWindowDays: intEnv(env, 'BIOPULSE_SEEN_WINDOW_DAYS', 10),
    maxRecordsPerDay: intEnv(env, 'BIOPULSE_MAX_RECORDS', 200),
    pubmedPerCategory: intEnv(env, 'BIOPULSE_PUBMED_PER_CATEGORY', 12),
    europePmcMax: intEnv(env, 'BIOPULSE_EUROPEPMC_MAX', 150),
    preprintMaxPages: intEnv(env, 'BIOPULSE_PREPRINT_MAX_PAGES', 10),
    trialsMax: intEnv(env, 'BIOPULSE_TRIALS_MAX', 100),
    verifyUrls: boolEnv(env, 'BIOPULSE_VERIFY_URLS', true),
    verifyUrlLimit: intEnv(env, 'BIOPULSE_VERIFY_URL_LIMIT', 60),
    requireVerifiedFeatured: boolEnv(env, 'BIOPULSE_REQUIRE_VERIFIED_FEATURED', true),
    regulatoryFeeds: {
      fda: [
        { name: 'FDA Press Releases', url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml' },
        { name: "FDA What's New: Vaccines, Blood & Biologics", url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/biologics/rss.xml' },
      ],
      ema: [{ name: 'EMA News and press releases', url: 'https://www.ema.europa.eu/en/news.xml' }],
    },
    companyFeeds: parseFeeds(env.BIOPULSE_COMPANY_FEEDS),
    epo: {
      // Biotechnology-relevant CPC groups: C12N (microorganisms/enzymes/genetic engineering), C12P (fermentation),
      // C12Q (measuring/testing with enzymes/nucleic acids), C07K (peptides), A61K39 (antigens/vaccines),
      // A61K48 (gene therapy), G16B (bioinformatics).
      query: env.BIOPULSE_EPO_QUERY ?? '(cpc=C12N or cpc=C12P or cpc=C12Q or cpc=C07K or cpc=A61K39 or cpc=A61K48 or cpc=G16B)',
      maxResults: intEnv(env, 'BIOPULSE_EPO_MAX', 50),
    },
    ai: {
      enabled: Boolean(env.ANTHROPIC_API_KEY) && !boolEnv(env, 'BIOPULSE_AI_DISABLE', false),
      model: env.BIOPULSE_AI_MODEL || 'claude-opus-5-5',
      effort: (['low', 'medium', 'high'] as const).find((e) => e === env.BIOPULSE_AI_EFFORT) ?? 'medium',
      maxRecords: intEnv(env, 'BIOPULSE_AI_MAX_RECORDS', 20),
    },
  };
}
