import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ZodType } from 'zod';
import { ArchiveIndexSchema, DailyDatasetSchema, RunStatusSchema, type ArchiveIndex, type DailyDataset, type RunStatus } from '../../shared/schema';

/** Write JSON atomically (temp file + rename) so a crash never leaves a half-written file. */
export async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await fs.rename(tmp, file);
}

export async function readJson<T>(file: string, schema?: ZodType<T>): Promise<T | null> {
  try {
    const raw = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    if (!schema) return raw as T;
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const paths = (dataDir: string) => ({
  latest: path.join(dataDir, 'latest.json'),
  status: path.join(dataDir, 'status.json'),
  sources: path.join(dataDir, 'sources.json'),
  archiveDir: path.join(dataDir, 'archive'),
  archiveIndex: path.join(dataDir, 'archive', 'index.json'),
  archiveDay: (date: string) => path.join(dataDir, 'archive', `${date}.json`),
});

export async function readArchiveDay(dataDir: string, date: string): Promise<DailyDataset | null> {
  return readJson(paths(dataDir).archiveDay(date), DailyDatasetSchema);
}

export async function readLatest(dataDir: string): Promise<DailyDataset | null> {
  return readJson(paths(dataDir).latest, DailyDatasetSchema);
}

export async function readStatus(dataDir: string): Promise<RunStatus | null> {
  return readJson(paths(dataDir).status, RunStatusSchema);
}

export async function listArchiveDates(dataDir: string): Promise<string[]> {
  try {
    const files = await fs.readdir(paths(dataDir).archiveDir);
    return files
      .map((f) => /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
      .filter((d): d is string => Boolean(d))
      .sort();
  } catch {
    return [];
  }
}

/** Rebuild the archive index from the archive files on disk (source of truth). */
export async function rebuildArchiveIndex(dataDir: string, now: Date): Promise<ArchiveIndex> {
  const days: ArchiveIndex['days'] = [];
  for (const date of (await listArchiveDates(dataDir)).reverse()) {
    const d = await readArchiveDay(dataDir, date);
    if (!d || d.dataset !== 'live') continue;
    days.push({ date, total: d.stats.total, byEvidence: d.stats.byEvidence, briefing: d.briefing.sentence });
  }
  const index: ArchiveIndex = { schemaVersion: 1, updatedAt: now.toISOString(), days };
  ArchiveIndexSchema.parse(index);
  return index;
}
