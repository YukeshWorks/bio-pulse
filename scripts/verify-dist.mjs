/**
 * Verifies the GitHub Pages build output (`npm run verify:dist`):
 *  - dist/index.html exists and references assets with relative paths (works under /<repo>/),
 *  - .nojekyll is present so Pages serves files verbatim,
 *  - no demonstration data or fixtures leaked into the build,
 *  - any bundled data/latest.json is live (not demo) data.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const errors = [];

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

if (!(await exists(path.join(dist, 'index.html')))) {
  console.error('dist/index.html missing — run `npm run build` first.');
  process.exit(1);
}
const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
if (/(src|href)="\/assets\//.test(html)) errors.push('index.html references absolute /assets/ paths; GitHub Pages project sites need relative paths');
if (!/(src|href)="\.\/assets\/[^"]+\.js"/.test(html)) errors.push('index.html does not reference a bundled script under ./assets/');
if (!(await exists(path.join(dist, '.nojekyll')))) errors.push('.nojekyll missing');

const files = await walk(dist);
if (files.some((f) => f.includes(`${path.sep}demo-data${path.sep}`) || f.includes(`${path.sep}fixtures${path.sep}`))) errors.push('demo fixtures found in dist/');

const latestPath = path.join(dist, 'data', 'latest.json');
if (await exists(latestPath)) {
  const latest = JSON.parse(await fs.readFile(latestPath, 'utf8'));
  if (latest.dataset !== 'live') errors.push('dist/data/latest.json is not live data');
  if (!(await exists(path.join(dist, 'data', 'archive', `${latest.date}.json`)))) errors.push('archive file for latest date missing from dist');
} else {
  console.log('Note: no data/latest.json in build yet (the site will show "No data has been published yet").');
}

const totalKb = Math.round((await Promise.all(files.map((f) => fs.stat(f)))).reduce((a, s) => a + s.size, 0) / 1024);

if (errors.length) {
  console.error(`dist verification FAILED:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`dist verification passed (${files.length} files, ${totalKb} KB).`);
