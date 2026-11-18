import type { EvidenceClass, Identifiers, SourceId } from '../shared/schema';
import type { HttpClient } from './lib/http';
import type { PipelineConfig } from './config';
import type { Logger } from './lib/log';

/**
 * A record as produced by a collector, before validation, deduplication and enrichment.
 * `abstract` is used transiently for classification and summarisation; only a short
 * attributed excerpt is ever written to the published JSON.
 */
export interface RawRecord {
  sourceId: SourceId;
  sourceName: string;
  title: string;
  authors: string[];
  organization?: string;
  /** YYYY-MM-DD, or null when the source did not provide a parseable date (record is rejected). */
  date: string | null;
  dateType: 'published' | 'posted' | 'indexed' | 'first-posted' | 'announced';
  url: string;
  venue?: string;
  identifiers: Identifiers;
  abstract?: string;
  keywords?: string[];
  /** Source subject collections, e.g. bioRxiv category. */
  subjects?: string[];
  evidence: EvidenceClass;
  articleTypes?: string[];
  trial?: {
    phase?: string[];
    status?: string;
    conditions?: string[];
    interventions?: string[];
    interventionTypes?: string[];
    sponsor?: string;
    primaryCompletion?: string;
    studyType?: string;
  };
  patent?: {
    kind?: string;
    status: 'application' | 'granted' | 'unknown';
    applicants?: string[];
    cpc?: string[];
  };
  /** Host allowed for this record's URL when it comes from a user-configured feed. */
  allowedHost?: string;
}

export interface CollectorContext {
  runDate: string;
  now: Date;
  http: HttpClient;
  config: PipelineConfig;
  log: Logger;
  env: Record<string, string | undefined>;
}

export interface CollectorResult {
  records: RawRecord[];
  /** Non-fatal problems (e.g. one of several queries failed). */
  warnings: string[];
}

export interface Collector {
  id: SourceId;
  name: string;
  /** Returns a reason string when the collector must be skipped (e.g. missing credentials). */
  skipReason(ctx: CollectorContext): string | null;
  collect(ctx: CollectorContext): Promise<CollectorResult>;
}
