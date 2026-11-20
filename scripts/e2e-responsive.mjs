/**
 * End-to-end check of the production build (`npm run build && npm run test:e2e`).
 * Serves dist/ with a static server, maps /data/* to the DEMO fixtures (test-only, never deployed),
 * and verifies with Chromium (Playwright) at phone, tablet and desktop widths that:
 *   - every route renders without console errors,
 *   - there is no horizontal overflow (mobile responsiveness),
 *   - the homepage shows the one-sentence briefing, three discoveries and source links,
 *   - every record card links to an https original source,
 *   - the "no data yet" state renders when data is missing.
 */
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const DEMO = path.resolve('fixtures/demo');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function serve(dataDir) {
  return createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const file = url.startsWith('/data/') ? (dataDir ? path.join(dataDir, url.slice(6)) : null) : path.join(DIST, url === '/' ? 'index.html' : url);
    try {
      if (!file) throw new Error('no data');
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
}

/** Synthetic responses for the four live-search APIs (no real network in tests). */
const LIVE = {
  'www.ebi.ac.uk': { resultList: { result: [{ id: '99100001', source: 'MED', pmid: '99100001', doi: '10.5555/live.1', title: 'TEST CRISPR base editing in vivo', journalTitle: 'Test Journal', firstPublicationDate: '2026-11-10' }, { id: 'PPR900001', source: 'PPR', title: 'TEST preprint on base editing', firstPublicationDate: '2026-11-12' }] } },
  esearch: { esearchresult: { idlist: ['99100002'] } },
  esummary: { result: { uids: ['99100002'], '99100002': { title: 'TEST PubMed article', sortpubdate: '2026/11/11 00:00', pubtype: ['Journal Article'], authors: [], articleids: [] } } },
  'clinicaltrials.gov': { studies: [{ protocolSection: { identificationModule: { nctId: 'NCT09999911', briefTitle: 'TEST base editing trial' }, statusModule: { overallStatus: 'RECRUITING' } } }] },
  'api.openalex.org': { results: [{ id: 'https://openalex.org/W9990002', display_name: 'TEST OpenAlex article', type: 'article', primary_location: { source: { type: 'journal' } } }] },
};
async function mockLiveApis(page) {
  await page.route(/ebi\.ac\.uk|eutils\.ncbi|clinicaltrials\.gov\/api|api\.openalex\.org/, (route) => {
    const u = route.request().url();
    const body = u.includes('esearch') ? LIVE.esearch : u.includes('esummary') ? LIVE.esummary : LIVE[new URL(u).host];
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body ?? {}) });
  });
}

const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

const ROUTES = ['/', '/search', '/search?q=base%20editing', '/saved', '/latest', '/papers', '/patents', '/trials', '/categories', '/categories/crispr-genetic-engineering', '/archive', '/archive/2026-11-18', '/about'];
const WIDTHS = [320, 390, 768, 1280];
const failures = [];
const fail = (m) => {
  failures.push(m);
  console.error(`✗ ${m}`);
};

const srv = serve(DEMO);
const port = await listen(srv);
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await mockLiveApis(page);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const route of ROUTES) {
      errors.length = 0;
      await page.goto(`http://127.0.0.1:${port}/#${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) fail(`${route} @${width}px overflows horizontally by ${overflow}px`);
      if (errors.length) fail(`${route} @${width}px console errors: ${errors.join(' | ')}`);
      const bad = await page.$$eval('article a[href]', (as) => as.map((a) => a.getAttribute('href')).filter((h) => h && !h.startsWith('https://') && !h.startsWith('#')));
      if (bad.length) fail(`${route} @${width}px has non-https source links: ${bad.slice(0, 3).join(', ')}`);
    }
    await page.goto(`http://127.0.0.1:${port}/#/`, { waitUntil: 'networkidle' });
    const briefing = await page.textContent('#briefing-title');
    if (!/one sentence/i.test(briefing ?? '')) fail(`home @${width}px: briefing heading missing`);
    const cards = await page.$$('section[aria-labelledby="top-title"] article');
    if (cards.length !== 3) fail(`home @${width}px: expected 3 discoveries, found ${cards.length}`);
    await page.goto(`http://127.0.0.1:${port}/#/search?q=base%20editing`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const live = await page.$$eval('section[aria-live] li a[href^="https://"]', (as) => as.length);
    if (live < 3) fail(`search @${width}px: expected live results, found ${live} links`);
    await page.close();
    console.log(`✓ ${ROUTES.length} routes checked at ${width}px`);
  }

  // Missing-data state: no data directory at all.
  const empty = serve(null);
  const p2 = await listen(empty);
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`http://127.0.0.1:${p2}/#/`, { waitUntil: 'networkidle' });
  if (!(await page.$('text=No data has been published yet'))) fail('missing-data state not rendered');
  else console.log('✓ missing-data state renders without placeholder content');
  empty.close();
} finally {
  await browser.close();
  srv.close();
}

if (failures.length) {
  console.error(`\n${failures.length} e2e check(s) failed.`);
  process.exit(1);
}
console.log('\nAll responsive e2e checks passed.');
