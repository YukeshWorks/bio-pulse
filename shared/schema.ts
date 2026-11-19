import { z } from 'zod';

/**
 * BioPulse data contract. The pipeline validates every file against these schemas
 * before writing; the frontend imports only the inferred types.
 */

export const EVIDENCE_CLASSES = [
  'PEER-REVIEWED',
  'PREPRINT',
  'PATENT APPLICATION',
  'CLINICAL TRIAL',
  'REGULATORY UPDATE',
  'COMPANY ANNOUNCEMENT',
] as const;
export const EvidenceClassSchema = z.enum(EVIDENCE_CLASSES);
export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;

export const SOURCE_IDS = ['pubmed', 'europepmc', 'biorxiv', 'medrxiv', 'clinicaltrials', 'fda', 'ema', 'epo', 'company'] as const;
export const SourceIdSchema = z.enum(SOURCE_IDS);
export type SourceId = z.infer<typeof SourceIdSchema>;

/**
 * Where a piece of text came from.
 * - source:    quoted/extracted directly from the source metadata or abstract
 * - metadata:  assembled deterministically from structured source fields (dates, IDs, status)
 * - template:  deterministic BioPulse interpretation based on the evidence class (not record-specific findings)
 * - ai:        AI-generated interpretation from the supplied metadata/abstract only
 * - unavailable: the information is not present in the source metadata
 */
export const TextBasisSchema = z.enum(['source', 'metadata', 'template', 'ai', 'unavailable']);
export type TextBasis = z.infer<typeof TextBasisSchema>;

export const AttributedTextSchema = z.object({
  text: z.string().min(1),
  basis: TextBasisSchema,
});
export type AttributedText = z.infer<typeof AttributedTextSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected ISO date-time');

export const IdentifiersSchema = z.object({
  doi: z.string().regex(/^10\.\d{4,9}\/\S+$/).optional(),
  pmid: z.string().regex(/^\d{1,9}$/).optional(),
  pmcid: z.string().regex(/^PMC\d+$/).optional(),
  nct: z.string().regex(/^NCT\d{8}$/).optional(),
  patentNumber: z.string().regex(/^[A-Z]{2}\d{3,}[A-Z]\d?$/).optional(),
  /** DOI of the peer-reviewed version of a preprint, when the preprint server reports one. */
  publishedDoi: z.string().regex(/^10\.\d{4,9}\/\S+$/).optional(),
});
export type Identifiers = z.infer<typeof IdentifiersSchema>;

export const UrlCheckSchema = z.enum(['ok', 'restricted', 'unchecked', 'failed']);

export const VerificationSchema = z.object({
  urlFormatValid: z.literal(true),
  urlHostAllowed: z.literal(true),
  urlCheck: UrlCheckSchema,
  urlCheckStatus: z.number().int().optional(),
  identifierConsistent: z.literal(true),
  dateValid: z.literal(true),
  checks: z.array(z.string()),
});

/**
 * How a record's categories were assigned (added in pipeline v2; optional so v1 archives stay valid).
 * `matched` lists the terms or CPC classes that produced each category's score.
 */
export const ClassificationSchema = z.object({
  primary: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  method: z.string(),
  matched: z.record(z.string(), z.object({ score: z.number(), terms: z.array(z.string()) })),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const RecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(5),
  authors: z.array(z.string()),
  organization: z.string().optional(),
  date: isoDate,
  dateType: z.enum(['published', 'posted', 'indexed', 'first-posted', 'announced']),
  source: z.object({ id: SourceIdSchema, name: z.string() }),
  alsoIndexedIn: z.array(z.object({ id: SourceIdSchema, name: z.string(), url: z.string().url() })),
  url: z.string().url(),
  venue: z.string().optional(),
  identifiers: IdentifiersSchema,
  categories: z.array(z.string()).min(1),
  classification: ClassificationSchema.optional(),
  evidence: EvidenceClassSchema,
  evidenceNote: z.string(),
  articleTypes: z.array(z.string()).optional(),
  summary: AttributedTextSchema,
  whyItMatters: AttributedTextSchema,
  limitations: z.array(AttributedTextSchema).min(1),
  trial: z
    .object({
      phase: z.array(z.string()).optional(),
      status: z.string().optional(),
      conditions: z.array(z.string()).optional(),
      interventions: z.array(z.string()).optional(),
      sponsor: z.string().optional(),
      primaryCompletion: z.string().optional(),
      studyType: z.string().optional(),
    })
    .optional(),
  patent: z
    .object({
      kind: z.string().optional(),
      status: z.enum(['application', 'granted', 'unknown']),
      applicants: z.array(z.string()).optional(),
      cpc: z.array(z.string()).optional(),
    })
    .optional(),
  verification: VerificationSchema,
  score: z.number(),
});
export type BioRecord = z.infer<typeof RecordSchema>;

export const DiscoveryAnalysisSchema = z.object({
  whatHappened: AttributedTextSchema,
  whatWasDeveloped: AttributedTextSchema,
  whatIsNew: AttributedTextSchema,
  whyImportant: AttributedTextSchema,
  limitations: AttributedTextSchema,
  whatNext: AttributedTextSchema,
});
export type DiscoveryAnalysis = z.infer<typeof DiscoveryAnalysisSchema>;

export const DiscoverySchema = z.object({
  recordId: z.string(),
  rank: z.number().int().min(1),
  analysis: DiscoveryAnalysisSchema,
});
export type Discovery = z.infer<typeof DiscoverySchema>;

export const BriefingSchema = z.object({
  /** null when no qualifying records exist — the UI must then show the "no qualifying updates" message. */
  sentence: z.string().nullable(),
  wordCount: z.number().int().min(0),
  citations: z.array(z.string()),
  method: z.enum(['ai', 'deterministic', 'none']),
  note: z.string(),
});
export type Briefing = z.infer<typeof BriefingSchema>;

export const SourceRunStatusSchema = z.object({
  id: SourceIdSchema,
  name: z.string(),
  status: z.enum(['ok', 'empty', 'failed', 'skipped']),
  fetched: z.number().int().min(0),
  accepted: z.number().int().min(0),
  rejected: z.number().int().min(0),
  durationMs: z.number().min(0),
  error: z.string().optional(),
  note: z.string().optional(),
  /** Rejections by reason code for this source (e.g. non-https-url, not-biotech-relevant). */
  rejectReasons: z.record(z.string(), z.number().int()).optional(),
  /** Valid records dropped only because of the daily volume cap (not a quality rejection). */
  capped: z.number().int().min(0).optional(),
});
export type SourceRunStatus = z.infer<typeof SourceRunStatusSchema>;

export const DailyDatasetSchema = z
  .object({
    schemaVersion: z.literal(1),
    dataset: z.enum(['live', 'demo']),
    date: isoDate,
    timezone: z.literal('Asia/Kolkata'),
    generatedAt: isoDateTime,
    window: z.object({ from: isoDate, to: isoDate }),
    briefing: BriefingSchema,
    topDiscoveries: z.array(DiscoverySchema).max(3),
    records: z.array(RecordSchema),
    stats: z.object({
      total: z.number().int().min(0),
      byEvidence: z.record(z.string(), z.number().int()),
      byCategory: z.record(z.string(), z.number().int()),
      bySource: z.record(z.string(), z.number().int()),
    }),
    sources: z.array(SourceRunStatusSchema),
    rejected: z.object({ count: z.number().int().min(0), reasons: z.record(z.string(), z.number().int()) }),
    ai: z.object({
      enabled: z.boolean(),
      used: z.boolean(),
      model: z.string().optional(),
      note: z.string(),
      /** disabled: no key; used: all AI fields accepted; partial: some fields failed validation;
       *  fallback: response refused/truncated/invalid; failed: request error. */
      status: z.enum(['disabled', 'used', 'partial', 'fallback', 'failed', 'not-needed']).optional(),
      failure: z.string().optional(),
    }),
    /** Honest verification counters: metadata validation is not the same as a live link check. */
    verificationSummary: z
      .object({
        collected: z.number().int().min(0),
        metadataValidated: z.number().int().min(0),
        published: z.number().int().min(0),
        linkOk: z.number().int().min(0),
        linkRestricted: z.number().int().min(0),
        linkFailed: z.number().int().min(0),
        linkNotChecked: z.number().int().min(0),
      })
      .optional(),
    /** Reproducibility manifest (no secrets). */
    run: z
      .object({
        pipelineVersion: z.string(),
        commit: z.string().optional(),
        workflowRun: z.string().optional(),
        config: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
      })
      .optional(),
    notice: z.string().optional(),
  })
  .superRefine((d, ctx) => {
    const ids = new Set(d.records.map((r) => r.id));
    if (ids.size !== d.records.length) ctx.addIssue({ code: 'custom', message: 'duplicate record ids' });
    for (const c of d.briefing.citations) {
      if (!ids.has(c)) ctx.addIssue({ code: 'custom', message: `briefing cites unknown record ${c}` });
    }
    for (const t of d.topDiscoveries) {
      if (!ids.has(t.recordId)) ctx.addIssue({ code: 'custom', message: `top discovery references unknown record ${t.recordId}` });
    }
    if (d.records.length === 0 && d.briefing.sentence !== null) {
      ctx.addIssue({ code: 'custom', message: 'briefing sentence present without any records' });
    }
    if (d.briefing.sentence !== null && d.briefing.citations.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'briefing sentence must cite at least one record' });
    }
  });
export type DailyDataset = z.infer<typeof DailyDatasetSchema>;

export const ArchiveIndexSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: isoDateTime,
  days: z.array(
    z.object({
      date: isoDate,
      total: z.number().int().min(0),
      byEvidence: z.record(z.string(), z.number().int()),
      briefing: z.string().nullable(),
    }),
  ),
});
export type ArchiveIndex = z.infer<typeof ArchiveIndexSchema>;

export const RunStatusSchema = z.object({
  schemaVersion: z.literal(1),
  lastAttempt: isoDateTime,
  lastAttemptDate: isoDate,
  outcome: z.enum(['published', 'published-empty', 'preserved-previous']),
  lastSuccessfulUpdate: isoDateTime.nullable(),
  lastSuccessfulDate: isoDate.nullable(),
  message: z.string(),
  sources: z.array(SourceRunStatusSchema),
  history: z.array(
    z.object({
      at: isoDateTime,
      outcome: z.enum(['published', 'published-empty', 'preserved-previous']),
      records: z.number().int().min(0),
      failedSources: z.array(z.string()),
    }),
  ),
});
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const SourceMetaSchema = z.object({
  id: SourceIdSchema,
  name: z.string(),
  publisher: z.string(),
  kind: z.string(),
  evidence: z.array(EvidenceClassSchema),
  homepage: z.string().url(),
  apiDocs: z.string().url(),
  access: z.string(),
  requiresCredentials: z.boolean(),
  enabled: z.boolean(),
  notes: z.string(),
  lastStatus: SourceRunStatusSchema.optional(),
});
export const SourcesFileSchema = z.object({
  schemaVersion: z.literal(1),
  updatedAt: isoDateTime,
  sources: z.array(SourceMetaSchema),
});
export type SourceMeta = z.infer<typeof SourceMetaSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
