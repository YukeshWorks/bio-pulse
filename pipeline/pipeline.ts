import { promises as fs } from 'node:fs';
import {
  DailyDatasetSchema,
  RunStatusSchema,
  SourcesFileSchema,
  type BioRecord,
  type Classification,
  type DailyDataset,
  type Discovery,
  type RunStatus,
  type SourceId,
  type SourceRunStatus,
  type SourcesFile,
} from '../shared/schema';
import { COLLECTORS } from './collectors';
import type { PipelineConfig } from './config';
import { runAi, type AiCaller } from './lib/ai';
import { deterministicBriefing } from './lib/briefing';
import { classifyDetailed } from './lib/classify';
import { addDays, istDate } from './lib/dates';
import { dedupe, type MergedRecord } from './lib/dedupe';
import { contextFor, deterministicAnalysis, limitationsFor, sourceSummary } from './lib/enrich';
import type { HttpClient } from './lib/http';
import { dedupeKeys, recordId } from './lib/ids';
import type { Logger } from './lib/log';
import { capBalanced, pickTop, scoreRecord } from './lib/rank';
import { paths, readArchiveDay, readLatest, readStatus, rebuildArchiveIndex, writeJsonAtomic } from './lib/storage';
import { checkUrlLive, validateRaw } from './lib/validate';
import { SOURCE_META } from './sources-meta';
import type { Collector, CollectorContext, RawRecord } from './types';

export interface PipelineOptions {
  config: PipelineConfig;
  http: HttpClient;
  /** Separate client for live URL checks (defaults to `http`). */
  urlHttp?: HttpClient;
  log: Logger;
  env: Record<string, string | undefined>;
  now?: Date;
  collectors?: Collector[];
  aiCaller?: AiCaller;
  collectorTimeoutMs?: number;
}

export interface PipelineResult {
  outcome: RunStatus['outcome'];
  runDate: string;
  dataset: DailyDataset | null;
  status: RunStatus;
  message: string;
}

export const PIPELINE_VERSION = '2.0.0';

const SOURCE_NAMES: Record<SourceId, string> = Object.fromEntries(SOURCE_META.map((s) => [s.id, s.name])) as Record<SourceId, string>;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function countBy<T>(items: T[], key: (t: T) => string | string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) for (const k of [key(it)].flat()) out[k] = (out[k] ?? 0) + 1;
  return out;
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const { config, log } = opts;
  const now = opts.now ?? new Date();
  const runDate = istDate(now);
  const collectors = opts.collectors ?? COLLECTORS;
  const ctx: CollectorContext = { runDate, now, http: opts.http, config, log, env: opts.env };
  const p = paths(config.dataDir);
  await fs.mkdir(p.archiveDir, { recursive: true });

  log.info(`BioPulse pipeline — run date ${runDate} (Asia/Kolkata), window ${addDays(runDate, -config.lookbackDays)} → ${runDate}`);

  // 1. Collect from every source independently; one failing source never stops the others.
  const statuses = new Map<SourceId, SourceRunStatus>();
  const raw: RawRecord[] = [];
  await Promise.all(
    collectors.map(async (c) => {
      const started = Date.now();
      const skip = c.skipReason(ctx);
      if (skip) {
        statuses.set(c.id, { id: c.id, name: c.name, status: 'skipped', fetched: 0, accepted: 0, rejected: 0, durationMs: 0, note: skip });
        log.info(`· ${c.name}: skipped (${skip})`);
        return;
      }
      try {
        const res = await withTimeout(c.collect(ctx), opts.collectorTimeoutMs ?? 8 * 60_000, c.name);
        raw.push(...res.records);
        for (const w of res.warnings) log.warn(`${c.name}: ${w}`);
        statuses.set(c.id, {
          id: c.id,
          name: c.name,
          status: res.records.length ? 'ok' : 'empty',
          fetched: res.records.length,
          accepted: 0,
          rejected: 0,
          durationMs: Date.now() - started,
          note: res.warnings.length ? res.warnings.slice(0, 3).join(' | ').slice(0, 500) : undefined,
        });
        log.info(`· ${c.name}: ${res.records.length} records fetched`);
      } catch (err) {
        const msg = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        statuses.set(c.id, { id: c.id, name: c.name, status: 'failed', fetched: 0, accepted: 0, rejected: 0, durationMs: Date.now() - started, error: msg });
        log.error(`Source failed — ${c.name}: ${msg}`);
      }
    }),
  );

  // 2. Static validation (URL format/host, dates, identifier consistency, evidence integrity).
  const rejectedReasons: Record<string, number> = {};
  const reject = (sourceId: SourceId, reason: string) => {
    rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + 1;
    const s = statuses.get(sourceId);
    if (s) {
      s.rejected++;
      s.rejectReasons = { ...s.rejectReasons, [reason]: (s.rejectReasons?.[reason] ?? 0) + 1 };
    }
  };
  const collected = raw.length;
  const valid: RawRecord[] = [];
  const checksByUrl = new Map<string, string[]>();
  for (const r of raw) {
    const v = validateRaw(r, runDate);
    if (!v.ok) {
      reject(r.sourceId, v.reason);
      continue;
    }
    checksByUrl.set(r.url, v.checks);
    valid.push(r);
  }

  // 3. Deduplicate across sources (DOI, PMID, PMCID, NCT, patent number, URL, title).
  const { merged, duplicatesRemoved } = dedupe(valid);
  if (duplicatesRemoved) rejectedReasons['duplicate-merged'] = duplicatesRemoved;

  // 4. Suppress items already published in recent archives (excluding today's, which is being rebuilt).
  const seen = new Set<string>();
  for (let i = 1; i <= config.seenWindowDays; i++) {
    const day = await readArchiveDay(config.dataDir, addDays(runDate, -i));
    for (const r of day?.records ?? []) for (const k of dedupeKeys(r.identifiers, r.url, r.title, r.evidence)) seen.add(k);
  }
  const fresh = merged.filter((r) => {
    const already = dedupeKeys(r.identifiers, r.url, r.title, r.evidence).some((k) => seen.has(k));
    if (already) reject(r.sourceId, 'already-published');
    return !already;
  });

  // 5. Classify into coverage categories; drop records that are not biotechnology-relevant.
  const categorized: { rec: MergedRecord; categories: string[]; classification: Classification | null }[] = [];
  for (const rec of fresh) {
    const { categories: cats, classification } = classifyDetailed(rec);
    if (cats.length === 0) {
      reject(rec.sourceId, 'not-biotech-relevant');
      continue;
    }
    categorized.push({ rec, categories: cats, classification });
  }
  const metadataValidated = categorized.length;

  // 6. Build published records with deterministic, source-grounded text.
  const abstracts = new Map<string, string | undefined>();
  let records: BioRecord[] = categorized.map(({ rec, categories, classification }) => {
    const id = recordId(rec.identifiers, rec.url);
    abstracts.set(id, rec.abstract);
    const base = {
      id,
      title: rec.title,
      authors: rec.authors.slice(0, 25),
      organization: rec.organization,
      date: rec.date!,
      dateType: rec.dateType,
      source: { id: rec.sourceId, name: SOURCE_NAMES[rec.sourceId] ?? rec.sourceName },
      alsoIndexedIn: rec.alsoIndexedIn,
      url: rec.url,
      venue: rec.venue,
      identifiers: Object.fromEntries(Object.entries(rec.identifiers).filter(([, v]) => v)) as BioRecord['identifiers'],
      categories,
      classification: classification ?? undefined,
      evidence: rec.evidence,
      evidenceNote: '',
      articleTypes: rec.articleTypes?.length ? rec.articleTypes : undefined,
      summary: sourceSummary(rec),
      whyItMatters: contextFor(categories, classification),
      limitations: limitationsFor(rec),
      trial: rec.trial ? (({ interventionTypes: _omit, ...t }) => t)(rec.trial) : undefined,
      patent: rec.patent,
      verification: {
        urlFormatValid: true as const,
        urlHostAllowed: true as const,
        urlCheck: 'unchecked' as const,
        identifierConsistent: true as const,
        dateValid: true as const,
        checks: checksByUrl.get(rec.url) ?? [],
      },
      score: 0,
    } satisfies BioRecord;
    base.evidenceNote = evidenceNote(base);
    base.score = scoreRecord(base, runDate);
    return base;
  });
  // Ids are unique after dedupe; guard anyway.
  records = [...new Map(records.map((r) => [r.id, r])).values()].sort((a, b) => b.score - a.score);

  // 8. Carry over same-day records from sources that failed in this run but succeeded earlier today.
  const existingToday = await readArchiveDay(config.dataDir, runDate);
  if (existingToday?.dataset === 'live') {
    const failed = new Set([...statuses.values()].filter((s) => s.status === 'failed').map((s) => s.id));
    const have = new Set(records.flatMap((r) => dedupeKeys(r.identifiers, r.url, r.title, r.evidence)));
    const carried = existingToday.records.filter((r) => failed.has(r.source.id) && !dedupeKeys(r.identifiers, r.url, r.title, r.evidence).some((k) => have.has(k)));
    if (carried.length) {
      log.warn(`Carried over ${carried.length} records from this morning's run for failed source(s): ${[...failed].join(', ')}`);
      records = [...records, ...carried].sort((a, b) => b.score - a.score);
    }
  }

  // 9. Cap the daily volume with per-evidence quotas, so lower-weighted classes (preprints, trials,
  //    patents) are not crowded out entirely by journal articles. Capped records are counted per source.
  if (records.length > config.maxRecordsPerDay) {
    const { kept, dropped } = capBalanced(records, config.maxRecordsPerDay);
    rejectedReasons['daily-cap'] = dropped.length;
    for (const r of dropped) {
      const s = statuses.get(r.source.id);
      if (s) s.capped = (s.capped ?? 0) + 1;
    }
    records = kept;
  }

  // 10a. Live URL check of the highest-ranked PUBLISHED records (subset, see verifyUrlLimit). 404/410 → dropped.
  //      This checks link availability only; it is not scientific verification.
  if (config.verifyUrls && records.length) {
    const http = opts.urlHttp ?? opts.http;
    const toCheck = records.slice(0, config.verifyUrlLimit);
    const results = await mapLimit(toCheck, 6, (r) => checkUrlLive(http, r.url));
    const failedIds = new Set<string>();
    toCheck.forEach((r, i) => {
      const res = results[i];
      r.verification.urlCheck = res.result;
      if (res.status) r.verification.urlCheckStatus = res.status;
      r.verification.checks.push('url-live');
      if (res.result === 'failed' && res.status !== undefined) failedIds.add(r.id);
    });
    records = records.filter((r) => {
      if (failedIds.has(r.id)) reject(r.source.id, 'url-not-found');
      return !failedIds.has(r.id);
    });
  }

  for (const r of records) {
    const s = statuses.get(r.source.id);
    if (s) s.accepted++;
  }

  const linkCount = (k: string) => records.filter((r) => r.verification.urlCheck === k).length;

  // 10. Top discoveries + one-sentence briefing (deterministic first, optional AI on top).
  const top = pickTop(records, 3, config.verifyUrls && config.requireVerifiedFeatured);
  const mergedById = new Map(categorized.map(({ rec }) => [recordId(rec.identifiers, rec.url), rec]));
  let topDiscoveries: Discovery[] = top.map((r, i) => {
    const m = mergedById.get(r.id);
    return { recordId: r.id, rank: i + 1, analysis: m ? deterministicAnalysis(m, r.categories, r.classification) : fallbackAnalysisFromRecord(r) };
  });
  let briefing = deterministicBriefing(records, top);
  const ai = await runAi(config.ai, top, records.slice(0, config.ai.maxRecords), abstracts, opts.aiCaller);
  if (ai.used) {
    if (ai.briefing) briefing = ai.briefing;
    topDiscoveries = topDiscoveries.map((d) => {
      const a = ai.analyses.get(d.recordId);
      return a ? { ...d, analysis: { whatHappened: d.analysis.whatHappened, ...a } } : d;
    });
    records = records.map((r) => {
      const s = ai.summaries.get(r.id);
      return s ? { ...r, summary: s.summary, whyItMatters: s.whyItMatters } : r;
    });
  }
  log.info(ai.note);

  // 11. Decide whether to publish.
  const sourceStatuses = collectors.map((c) => statuses.get(c.id)!).filter(Boolean);
  const attempted = sourceStatuses.filter((s) => s.status !== 'skipped');
  const failed = attempted.filter((s) => s.status === 'failed');
  const previousStatus = await readStatus(config.dataDir);
  const previousLatest = await readLatest(config.dataDir);

  let outcome: RunStatus['outcome'];
  let message: string;
  if (attempted.length === 0 || failed.length === attempted.length) {
    outcome = 'preserved-previous';
    message = `All ${attempted.length} attempted sources failed; previous data preserved.`;
  } else if (records.length === 0 && failed.length > 0) {
    outcome = 'preserved-previous';
    message = `No records and ${failed.length} failed source(s) (${failed.map((f) => f.id).join(', ')}); previous data preserved rather than publishing an empty day.`;
  } else if (records.length === 0) {
    outcome = 'published-empty';
    message = 'All sources responded but no qualifying new records were found.';
  } else {
    outcome = 'published';
    message = `Published ${records.length} metadata-validated records (${linkCount('ok') + linkCount('restricted')} links live-checked)${failed.length ? `; ${failed.length} source(s) failed: ${failed.map((f) => f.id).join(', ')}` : ''}.`;
  }

  let dataset: DailyDataset | null = null;
  const nowIso = now.toISOString();
  if (outcome !== 'preserved-previous') {
    dataset = {
      schemaVersion: 1,
      dataset: 'live',
      date: runDate,
      timezone: 'Asia/Kolkata',
      generatedAt: nowIso,
      window: { from: addDays(runDate, -config.lookbackDays), to: runDate },
      briefing,
      topDiscoveries,
      records,
      stats: {
        total: records.length,
        byEvidence: countBy(records, (r) => r.evidence),
        byCategory: countBy(records, (r) => r.categories),
        bySource: countBy(records, (r) => r.source.id),
      },
      sources: sourceStatuses,
      rejected: { count: Object.values(rejectedReasons).reduce((a, b) => a + b, 0), reasons: rejectedReasons },
      ai: { enabled: config.ai.enabled, used: ai.used, model: config.ai.enabled ? config.ai.model : undefined, note: ai.note, status: ai.status, failure: ai.failure },
      verificationSummary: {
        collected,
        metadataValidated,
        published: records.length,
        linkOk: linkCount('ok'),
        linkRestricted: linkCount('restricted'),
        linkFailed: linkCount('failed'),
        linkNotChecked: linkCount('unchecked'),
      },
      run: {
        pipelineVersion: PIPELINE_VERSION,
        commit: opts.env.GITHUB_SHA,
        workflowRun: opts.env.GITHUB_RUN_ID ? `${opts.env.GITHUB_RUN_ID}/${opts.env.GITHUB_RUN_ATTEMPT ?? '1'}` : undefined,
        config: {
          lookbackDays: config.lookbackDays,
          patentLookbackDays: config.patentLookbackDays,
          seenWindowDays: config.seenWindowDays,
          maxRecordsPerDay: config.maxRecordsPerDay,
          verifyUrls: config.verifyUrls,
          verifyUrlLimit: config.verifyUrlLimit,
          preprintMaxPages: config.preprintMaxPages,
          classification: 'keyword-rules-v2',
          aiModel: config.ai.enabled ? config.ai.model : 'none',
        },
      },
      notice: outcome === 'published-empty' ? 'No qualifying updates were found for this date. No headline has been generated.' : undefined,
    };
    // Validate before anything is written; an invalid dataset never replaces good data.
    const check = DailyDatasetSchema.safeParse(dataset);
    if (!check.success) {
      outcome = 'preserved-previous';
      message = `Generated dataset failed schema validation (${check.error.issues[0]?.message}); previous data preserved.`;
      log.error(message);
      dataset = null;
    }
  }

  if (dataset) {
    await writeJsonAtomic(p.archiveDay(runDate), dataset, { compact: true });
    await writeJsonAtomic(p.archiveIndex, await rebuildArchiveIndex(config.dataDir, now));
    await writeJsonAtomic(p.latest, dataset, { compact: true });
  }

  const status: RunStatus = {
    schemaVersion: 1,
    lastAttempt: nowIso,
    lastAttemptDate: runDate,
    outcome,
    lastSuccessfulUpdate: dataset ? nowIso : (previousStatus?.lastSuccessfulUpdate ?? previousLatest?.generatedAt ?? null),
    lastSuccessfulDate: dataset ? runDate : (previousStatus?.lastSuccessfulDate ?? previousLatest?.date ?? null),
    message,
    sources: sourceStatuses,
    history: [
      { at: nowIso, outcome, records: dataset?.records.length ?? 0, failedSources: failed.map((f) => f.id) },
      ...(previousStatus?.history ?? []),
    ].slice(0, 60),
  };
  RunStatusSchema.parse(status);
  await writeJsonAtomic(p.status, status);

  const enabledIds = new Set(collectors.map((c) => c.id));
  const sourcesFile: SourcesFile = {
    schemaVersion: 1,
    updatedAt: nowIso,
    sources: SOURCE_META.map((m) => {
      const st = statuses.get(m.id);
      return { ...m, enabled: enabledIds.has(m.id) && st?.status !== 'skipped', lastStatus: st };
    }),
  };
  SourcesFileSchema.parse(sourcesFile);
  await writeJsonAtomic(p.sources, sourcesFile);

  (outcome === 'preserved-previous' ? log.error : log.info)(`Outcome: ${outcome} — ${message}`);
  return { outcome, runDate, dataset, status, message };
}

function evidenceNote(r: Pick<BioRecord, 'evidence' | 'patent' | 'identifiers'>): string {
  switch (r.evidence) {
    case 'PREPRINT':
      return `Preprint — not peer-reviewed.${r.identifiers.publishedDoi ? ` The server reports a published version (DOI ${r.identifiers.publishedDoi}).` : ''}`;
    case 'PATENT APPLICATION':
      return r.patent?.status === 'granted' ? `Granted patent (kind ${r.patent.kind}). Not evidence of efficacy.` : `Patent application${r.patent?.kind ? ` (kind ${r.patent.kind})` : ''}. Not evidence of efficacy.`;
    case 'CLINICAL TRIAL':
      return 'Trial registration — describes a study, not its results.';
    case 'REGULATORY UPDATE':
      return 'Official regulator communication.';
    case 'COMPANY ANNOUNCEMENT':
      return 'Company communication — not independently verified.';
    default:
      return 'Journal article indexed by a bibliographic database.';
  }
}

function fallbackAnalysisFromRecord(r: BioRecord): Discovery['analysis'] {
  const unavailable = (what: string) => ({ text: `${what} is not stated in the available source metadata.`, basis: 'unavailable' as const });
  return {
    whatHappened: { text: `“${r.title}” (${r.source.name}, ${r.date}).`, basis: 'metadata' },
    whatWasDeveloped: unavailable('What was developed'),
    whatIsNew: unavailable('A comparison with previous approaches'),
    whyImportant: r.whyItMatters,
    limitations: r.limitations[0],
    whatNext: unavailable('A next step'),
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

