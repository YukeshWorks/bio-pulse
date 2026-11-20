import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DailyDatasetSchema, type DailyDataset } from '../shared/schema';
import { buildFeed, siteUrl } from './lib/feed';
import { listArchiveDates, paths, writeTextAtomic } from './lib/storage';

/** Rebuild data/feed.xml from the last 14 archived days (`npm run feed`). Read-only for archives. */
const dataDir = path.resolve(process.env.BIOPULSE_DATA_DIR ?? 'public/data');
const days: DailyDataset[] = [];
for (const date of (await listArchiveDates(dataDir)).reverse().slice(0, 14)) {
  const parsed = DailyDatasetSchema.safeParse(JSON.parse(await fs.readFile(paths(dataDir).archiveDay(date), 'utf8')));
  if (parsed.success && parsed.data.dataset === 'live') days.push(parsed.data);
}
await writeTextAtomic(paths(dataDir).feed, buildFeed(days, siteUrl(process.env), new Date()));
console.log(`feed.xml written with ${days.length} day(s) for ${siteUrl(process.env)}`);
