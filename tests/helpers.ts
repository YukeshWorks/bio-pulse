/**
 * SYNTHETIC TEST FIXTURES. All identifiers below are fake (DOI prefix 10.5555 is reserved for
 * testing; PMIDs 990000xx and NCT099999xx do not refer to real records). They exist only to
 * exercise parsing, validation and deduplication logic offline.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, type PipelineConfig } from '../pipeline/config';
import { createHttpClient, type FetchLike } from '../pipeline/lib/http';

export const RUN_NOW = new Date('2026-11-18T01:30:00Z'); // 07:00 IST on 2026-11-18
export const RUN_DATE = '2026-11-18';

export function pubmedEfetchXml(articles: { pmid: string; title: string; abstract?: string; doi?: string; types?: string[]; year?: string; month?: string; day?: string; journal?: string }[]): string {
  return `<?xml version="1.0" ?>
<!DOCTYPE PubmedArticleSet PUBLIC "-//NLM//DTD PubMedArticle, 1st January 2025//EN" "https://dtd.nlm.nih.gov/ncbi/pubmed/out/pubmed_250101.dtd">
<PubmedArticleSet>
${articles
  .map(
    (a) => `<PubmedArticle><MedlineCitation Status="Publisher" Owner="NLM"><PMID Version="1">${a.pmid}</PMID>
<Article PubModel="Electronic"><Journal><Title>${a.journal ?? 'Journal of Synthetic Test Biology'}</Title></Journal>
<ArticleTitle>${a.title}</ArticleTitle>
${a.abstract ? `<Abstract><AbstractText Label="RESULTS">${a.abstract}</AbstractText></Abstract>` : ''}
<AuthorList><Author><LastName>Rivera</LastName><ForeName>Ana</ForeName><AffiliationInfo><Affiliation>Test Institute of Biotechnology</Affiliation></AffiliationInfo></Author><Author><LastName>Okafor</LastName><ForeName>Chidi</ForeName></Author></AuthorList>
<PublicationTypeList>${(a.types ?? ['Journal Article']).map((t) => `<PublicationType UI="D0">${t}</PublicationType>`).join('')}</PublicationTypeList>
${a.doi ? `<ELocationID EIdType="doi" ValidYN="Y">${a.doi}</ELocationID>` : ''}
<ArticleDate DateType="Electronic"><Year>${a.year ?? '2026'}</Year><Month>${a.month ?? '11'}</Month><Day>${a.day ?? '17'}</Day></ArticleDate>
</Article><KeywordList><Keyword>biotechnology</Keyword></KeywordList></MedlineCitation>
<PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>11</Month><Day>17</Day></PubMedPubDate></History>
<ArticleIdList><ArticleId IdType="pubmed">${a.pmid}</ArticleId>${a.doi ? `<ArticleId IdType="doi">${a.doi}</ArticleId>` : ''}</ArticleIdList></PubmedData></PubmedArticle>`,
  )
  .join('\n')}
</PubmedArticleSet>`;
}

export const PUBMED_ARTICLES = [
  {
    pmid: '99000001',
    doi: '10.5555/test.crispr.001',
    title: 'Base editing of <i>PCSK9</i> in primate liver with an engineered CRISPR adenine base editor',
    abstract:
      'We developed an engineered adenine base editor delivered by lipid nanoparticles. Compared with previous editors, the new variant showed improved on-target editing in liver cells. However, long-term safety in larger cohorts remains unknown.',
  },
  {
    pmid: '99000002',
    doi: '10.5555/test.micro.002',
    title: 'A bacteriophage cocktail against multidrug-resistant Klebsiella in a murine infection model',
    abstract: 'Here we describe a bacteriophage cocktail targeting antimicrobial resistant bacteria. Findings were limited to a murine model.',
  },
  {
    pmid: '99000003',
    title: 'Editorial: The year in review for biotechnology',
    types: ['Editorial'],
  },
];

export const EUROPEPMC_JSON = {
  hitCount: 3,
  nextCursorMark: 'AoE=',
  resultList: {
    result: [
      // Same item as PubMed 99000001 — must merge.
      { id: '99000001', source: 'MED', pmid: '99000001', doi: '10.5555/TEST.CRISPR.001', title: 'Base editing of PCSK9 in primate liver with an engineered CRISPR adenine base editor.', authorString: 'Rivera A, Okafor C.', journalInfo: { journal: { title: 'Journal of Synthetic Test Biology' } }, firstPublicationDate: '2026-11-17', abstractText: 'We developed an engineered adenine base editor delivered by lipid nanoparticles.' },
      { id: 'PPR990001', source: 'PPR', doi: '10.5555/test.preprint.epmc', title: 'Machine learning guided protein design of thermostable enzymes for industrial biocatalysis', authorString: 'Chen L, Novak P.', bookOrReportDetails: { publisher: 'Research Square' }, firstPublicationDate: '2026-11-16', abstractText: 'We present a deep learning model for enzyme engineering.' },
      { id: 'X1', source: 'AGR', title: 'Ignored agricola record about crops in general', firstPublicationDate: '2026-11-16' },
    ],
  },
};

export const BIORXIV_JSON = {
  messages: [{ status: 'ok', count: 3, total: 3 }],
  collection: [
    { doi: '10.5555/test.biorxiv.001', title: 'A synthetic genetic circuit for programmable cell-free biosensors', authors: 'Smith, J.; Patel, R. K.', author_corresponding_institution: 'Test University', date: '2026-11-17', version: '1', type: 'new results', category: 'synthetic biology', abstract: 'We engineered a genetic circuit for cell-free biosensing. This is the first demonstration of this design.', published: 'NA', server: 'biorxiv' },
    { doi: '10.5555/test.biorxiv.002', title: 'Revised version should be ignored because it is version two', authors: 'Doe, J.', date: '2026-11-17', version: '2', category: 'synthetic biology', abstract: 'x', server: 'biorxiv' },
    { doi: '10.5555/test.biorxiv.003', title: 'Bird song learning in zebra finches under different light regimes', authors: 'Lee, K.', date: '2026-11-17', version: '1', category: 'animal behavior and cognition', abstract: 'Behavioural study.', server: 'biorxiv' },
  ],
};

export const CTGOV_JSON = {
  studies: [
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT09999901', briefTitle: 'CAR-T Cell Therapy for Relapsed B-cell Lymphoma (TEST)' },
        statusModule: { overallStatus: 'NOT_YET_RECRUITING', studyFirstPostDateStruct: { date: '2026-11-17' }, primaryCompletionDateStruct: { date: '2028-06' } },
        sponsorCollaboratorsModule: { leadSponsor: { name: 'Test Cell Therapeutics' } },
        descriptionModule: { briefSummary: 'This study evaluates an autologous CAR-T cell therapy in adults with relapsed lymphoma.' },
        conditionsModule: { conditions: ['B-cell Lymphoma'] },
        designModule: { phases: ['PHASE1'], studyType: 'INTERVENTIONAL' },
        armsInterventionsModule: { interventions: [{ type: 'BIOLOGICAL', name: 'TEST-CAR19' }] },
      },
    },
    {
      protocolSection: {
        identificationModule: { nctId: 'NCT09999902', briefTitle: 'Exercise Program for Knee Pain (behavioral only)' },
        statusModule: { overallStatus: 'RECRUITING', studyFirstPostDateStruct: { date: '2026-11-17' } },
        armsInterventionsModule: { interventions: [{ type: 'BEHAVIORAL', name: 'Exercise' }] },
      },
    },
  ],
};

export const FDA_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>FDA Press Releases</title>
<item><title>FDA Approves First Gene Therapy for a Rare Inherited Disorder (TEST)</title><link>https://www.fda.gov/news-events/press-announcements/test-gene-therapy</link><description>The U.S. Food and Drug Administration approved a gene therapy using an AAV vector.</description><pubDate>Tue, 17 Nov 2026 14:00:00 EST</pubDate></item>
<item><title>FDA Warns Consumers About Tobacco Products</title><link>https://www.fda.gov/news-events/press-announcements/test-tobacco</link><description>Tobacco warning.</description><pubDate>Tue, 17 Nov 2026 10:00:00 EST</pubDate></item>
<item><title>Item linking off-site must be rejected about a vaccine</title><link>https://evil.example.com/vaccine</link><description>Vaccine news.</description><pubDate>Tue, 17 Nov 2026 10:00:00 EST</pubDate></item>
</channel></rss>`;

export const EMA_RSS = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>EMA news</title>
<item><title>New mRNA vaccine recommended for approval in the EU (TEST)</title><link>https://www.ema.europa.eu/en/news/test-mrna-vaccine</link><description>EMA's human medicines committee recommended an mRNA vaccine.</description><pubDate>Mon, 16 Nov 2026 12:00:00 +0100</pubDate></item>
</channel></rss>`;

export const EPO_JSON = {
  'ops:world-patent-data': {
    'ops:biblio-search': {
      'ops:search-result': {
        'exchange-documents': [
          {
            'exchange-document': {
              '@country': 'EP',
              '@doc-number': '4999001',
              '@kind': 'A1',
              'bibliographic-data': {
                'publication-reference': { 'document-id': [{ '@document-id-type': 'docdb', country: { $: 'EP' }, 'doc-number': { $: '4999001' }, kind: { $: 'A1' }, date: { $: '20261111' } }] },
                'invention-title': [{ '@lang': 'en', $: 'Engineered Cas nuclease variants with reduced off-target activity' }],
                parties: { applicants: { applicant: [{ '@data-format': 'epodoc', 'applicant-name': { name: { $: 'TEST BIO GMBH [DE]' } } }] } },
                'patent-classifications': { 'patent-classification': [{ section: { $: 'C' }, class: { $: '12' }, subclass: { $: 'N' }, 'main-group': { $: '15' } }] },
              },
              abstract: { '@lang': 'en', p: { $: 'The invention relates to engineered CRISPR Cas nuclease variants.' } },
            },
          },
        ],
      },
    },
  },
};

type Route = { match: (url: string, init?: RequestInit) => boolean; respond: (url: string, init?: RequestInit) => Response | Promise<Response> };

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
export function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/xml' } });
}

export function mockFetch(routes: Route[]): FetchLike & { calls: string[] } {
  const calls: string[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push(url);
    const r = routes.find((x) => x.match(url, init));
    if (!r) return new Response('not found', { status: 404 });
    return r.respond(url, init);
  }) as FetchLike & { calls: string[] };
  fn.calls = calls;
  return fn;
}

/** Routes that answer every source with the synthetic fixtures above. */
export function happyRoutes(overrides: Partial<Record<'pubmed' | 'epmc' | 'biorxiv' | 'medrxiv' | 'ctgov' | 'fda' | 'ema' | 'epo' | 'urls', Route['respond']>> = {}): Route[] {
  return [
    { match: (u) => u.includes('esearch.fcgi'), respond: overrides.pubmed ?? (() => json({ esearchresult: { idlist: ['99000001', '99000002', '99000003'] } })) },
    { match: (u) => u.includes('efetch.fcgi'), respond: overrides.pubmed ?? (() => text(pubmedEfetchXml(PUBMED_ARTICLES))) },
    { match: (u) => u.includes('europepmc/webservices'), respond: overrides.epmc ?? (() => json(EUROPEPMC_JSON)) },
    { match: (u) => u.includes('api.biorxiv.org/details/biorxiv'), respond: overrides.biorxiv ?? (() => json(BIORXIV_JSON)) },
    { match: (u) => u.includes('api.biorxiv.org/details/medrxiv'), respond: overrides.medrxiv ?? (() => json({ messages: [{ status: 'no posts found' }], collection: [] })) },
    { match: (u) => u.includes('clinicaltrials.gov/api/v2'), respond: overrides.ctgov ?? (() => json(CTGOV_JSON)) },
    { match: (u) => u.includes('rss-feeds/press-releases'), respond: overrides.fda ?? (() => text(FDA_RSS)) },
    { match: (u) => u.includes('rss-feeds/biologics'), respond: overrides.fda ?? (() => text('<rss version="2.0"><channel><title>x</title></channel></rss>')) },
    { match: (u) => u.includes('ema.europa.eu/en/news.xml'), respond: overrides.ema ?? (() => text(EMA_RSS)) },
    { match: (u) => u.includes('ops.epo.org/3.2/auth'), respond: () => json({ access_token: 'test-token' }) },
    { match: (u) => u.includes('ops.epo.org/3.2/rest-services'), respond: overrides.epo ?? (() => json(EPO_JSON)) },
  ];
}

export function failingRoutes(): Route[] {
  return [{ match: () => true, respond: () => new Response('server error', { status: 503 }) }];
}

export function testHttp(fetchImpl: FetchLike) {
  return createHttpClient({ fetchImpl, sleep: async () => {}, baseBackoffMs: 0 });
}

export async function tempDataDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'biopulse-test-'));
}

export function testConfig(dataDir: string, overrides: Partial<PipelineConfig> = {}): PipelineConfig {
  const base = loadConfig({ BIOPULSE_DATA_DIR: dataDir });
  return { ...base, verifyUrls: false, requireVerifiedFeatured: false, ...overrides, ai: { ...base.ai, enabled: false, ...(overrides.ai ?? {}) } };
}

export const TEST_ENV = { EPO_OPS_KEY: 'k', EPO_OPS_SECRET: 's' };
