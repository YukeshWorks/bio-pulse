import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ArchiveIndexSchema, DailyDatasetSchema, RunStatusSchema, SourcesFileSchema } from '../shared/schema';

/**
 * Integrity gate run before data is committed and deployed (`npm run validate:data`).
 * Fails when any published JSON violates the schema, when demonstration data is present in the
 * production data directory, or when latest.json and the archive disagree.
 */
const dataDir = path.resolve(process.env.BIOPULSE_DATA_DIR ?? 'public/data');
const errors: string[] = [];

async function load(file: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    errors.push(`${file}: unreadable (${(err as Error).message})`);
    return undefined;
  }
}

function check(file: string, schema: { safeParse(v: unknown): { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, value: unknown) {
  const r = schema.safeParse(value);
  if (!r.success) errors.push(`${file}: ${r.error!.issues.slice(0, 3).map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  return r.success;
}

const latest = await load('latest.json');
if (latest !== undefined && check('latest.json', DailyDatasetSchema, latest)) {
  const l = latest as { dataset: string; date: string; generatedAt: string };
  if (l.dataset !== 'live') errors.push('latest.json: demonstration data must never be deployed as production data');
  const day = await load(`archive/${l.date}.json`);
  if (!day) errors.push(`latest.json refers to ${l.date} but archive/${l.date}.json is missing`);
  else if ((day as { generatedAt: string }).generatedAt !== l.generatedAt) errors.push(`latest.json and archive/${l.date}.json differ`);
}
const status = await load('status.json');
if (status !== undefined) check('status.json', RunStatusSchema, status);
const sources = await load('sources.json');
if (sources !== undefined) check('sources.json', SourcesFileSchema, sources);
const index = await load('archive/index.json');
if (index !== undefined) check('archive/index.json', ArchiveIndexSchema, index);

let files: string[] = [];
try {
  files = (await fs.readdir(path.join(dataDir, 'archive'))).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
} catch {
  /* no archive yet */
}
for (const f of files) {
  const v = await load(`archive/${f}`);
  if (v !== undefined && check(`archive/${f}`, DailyDatasetSchema, v) && (v as { dataset: string }).dataset !== 'live') {
    errors.push(`archive/${f}: demonstration data in production archive`);
  }
}

if (errors.length) {
  console.error(`Data validation FAILED (${errors.length} problem(s)):\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log(`Data validation passed: ${latest ? 'latest.json, ' : ''}${files.length} archive file(s)${status ? ', status.json' : ''}${sources ? ', sources.json' : ''}.`);
