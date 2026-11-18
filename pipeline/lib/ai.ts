import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { AttributedText, BioRecord, Briefing, DiscoveryAnalysis } from '../../shared/schema';
import type { PipelineConfig } from '../config';
import { BRIEFING_MAX_WORDS, BRIEFING_MIN_WORDS } from './briefing';
import { wordCount } from './text';

/**
 * Optional AI summarisation adapter (Claude API).
 *
 * - Used only when ANTHROPIC_API_KEY is configured (a Claude.ai Pro/Max subscription does NOT include API credits).
 * - Claude receives ONLY the supplied metadata and abstracts and must not add outside facts.
 * - Every output is validated: briefing length 20–30 words, citations limited to supplied record ids,
 *   no identifiers (DOI/PMID/NCT/patent numbers) or URLs that were not in the input. Anything that
 *   fails validation is discarded and the deterministic text is kept.
 */

export interface AiInputRecord {
  id: string;
  title: string;
  evidence: string;
  date: string;
  venue?: string;
  source: string;
  authorsOrOrganization: string;
  identifiers: Record<string, string | undefined>;
  categories: string[];
  abstract?: string;
  trial?: unknown;
  patent?: unknown;
}

export interface AiResult {
  briefing?: Briefing;
  analyses: Map<string, Omit<DiscoveryAnalysis, 'whatHappened'>>;
  summaries: Map<string, { summary: AttributedText; whyItMatters: AttributedText }>;
  note: string;
  used: boolean;
}

const AiOutputSchema = z.object({
  briefing: z.object({
    sentence: z.string().describe('One sentence, 20-30 words, describing what is happening in biotechnology today based only on the supplied records.'),
    cited_record_ids: z.array(z.string()).describe('IDs of the supplied records that support the sentence (1-3).'),
  }),
  discoveries: z.array(
    z.object({
      record_id: z.string(),
      what_was_developed: z.string(),
      what_is_new: z.string(),
      why_important: z.string(),
      limitations: z.string(),
      what_next: z.string(),
    }),
  ),
  summaries: z.array(
    z.object({
      record_id: z.string(),
      summary: z.string().describe('1-2 factual sentences restating the source.'),
      why_it_matters: z.string().describe('1 sentence of clearly hedged interpretation.'),
    }),
  ),
});
type AiOutput = z.infer<typeof AiOutputSchema>;

export const SYSTEM_PROMPT = `You are the scientific editor of BioPulse, a biotechnology intelligence briefing.
You will receive a JSON list of source records (metadata and, when available, abstracts). Rules:
1. Use ONLY information present in the supplied records. Do not add facts, numbers, names, institutions, dates, identifiers, URLs or results that are not in the input.
2. Preserve evidence status exactly: PREPRINT means not peer-reviewed; PATENT APPLICATION is a legal filing, not proof that anything works or will be commercialised; CLINICAL TRIAL registrations describe planned/ongoing studies, not results; COMPANY ANNOUNCEMENT is promotional and unverified.
3. If the input does not state something, write "Not stated in the source." Never guess.
4. Separate fact from interpretation: "why_important", "why_it_matters" and "what_next" are interpretation — begin them with "Interpretation:" and hedge appropriately ("may", "could").
5. The briefing sentence must be 20-30 words, plain English, and cite 1-3 supplied record IDs that directly support it. Mention evidence status when citing preprints, patents or trials.
6. Do not exaggerate ("breakthrough", "cure", "revolutionary") unless quoting the title.`;

const ID_PATTERNS = [/\b10\.\d{4,9}\/[^\s"”)]+/gi, /\bNCT\d{8}\b/gi, /\bPMC\d+\b/gi, /\b[A-Z]{2}\d{6,}[A-Z]\d?\b/g, /\bPMID:?\s*\d+/gi];

/** Reject text containing URLs or identifiers absent from the input corpus. */
export function introducesUnknownIdentifiers(text: string, corpus: string): boolean {
  if (/https?:\/\/|www\./i.test(text)) return true;
  const lowerCorpus = corpus.toLowerCase();
  for (const re of ID_PATTERNS) {
    for (const m of text.match(re) ?? []) {
      if (!lowerCorpus.includes(m.toLowerCase().replace(/^pmid:?\s*/, ''))) return true;
    }
  }
  return false;
}

export function toAiInput(r: BioRecord, abstract: string | undefined): AiInputRecord {
  return {
    id: r.id,
    title: r.title,
    evidence: r.evidence,
    date: r.date,
    venue: r.venue,
    source: r.source.name,
    authorsOrOrganization: r.authors.slice(0, 3).join(', ') || r.organization || 'Not listed',
    identifiers: r.identifiers,
    categories: r.categories,
    abstract: abstract?.slice(0, 2500),
    trial: r.trial,
    patent: r.patent,
  };
}

export function validateAiOutput(out: AiOutput, input: AiInputRecord[], topIds: string[]): Omit<AiResult, 'note' | 'used'> & { rejected: string[] } {
  const corpus = JSON.stringify(input);
  const ids = new Set(input.map((r) => r.id));
  const rejected: string[] = [];
  const clean = (s: string, label: string): string | null => {
    const t = s.trim();
    if (!t || t.length > 900) {
      rejected.push(`${label}: empty or too long`);
      return null;
    }
    if (introducesUnknownIdentifiers(t, corpus)) {
      rejected.push(`${label}: introduced identifiers/URLs not in the input`);
      return null;
    }
    return t;
  };

  let briefing: Briefing | undefined;
  const sentence = clean(out.briefing.sentence, 'briefing');
  const cites = [...new Set(out.briefing.cited_record_ids)];
  const wc = sentence ? wordCount(sentence) : 0;
  if (sentence && wc >= BRIEFING_MIN_WORDS && wc <= BRIEFING_MAX_WORDS && cites.length >= 1 && cites.length <= 3 && cites.every((c) => ids.has(c))) {
    briefing = { sentence, wordCount: wc, citations: cites, method: 'ai', note: 'AI-generated (Claude API) from the cited records’ metadata and abstracts only; validated for length, citations and identifiers.' };
  } else if (sentence) {
    rejected.push(`briefing: failed validation (words=${wc}, citations=${cites.join(',')})`);
  }

  const analyses = new Map<string, Omit<DiscoveryAnalysis, 'whatHappened'>>();
  for (const d of out.discoveries) {
    if (!topIds.includes(d.record_id)) {
      rejected.push(`discovery ${d.record_id}: not a requested record`);
      continue;
    }
    const fields = [d.what_was_developed, d.what_is_new, d.why_important, d.limitations, d.what_next].map((f, i) => clean(f, `discovery ${d.record_id} field ${i}`));
    if (fields.some((f) => f === null)) continue;
    const ai = (text: string): AttributedText => ({ text, basis: /^not stated in the source/i.test(text) ? 'unavailable' : 'ai' });
    analyses.set(d.record_id, {
      whatWasDeveloped: ai(fields[0]!),
      whatIsNew: ai(fields[1]!),
      whyImportant: ai(fields[2]!),
      limitations: ai(fields[3]!),
      whatNext: ai(fields[4]!),
    });
  }

  const summaries = new Map<string, { summary: AttributedText; whyItMatters: AttributedText }>();
  for (const s of out.summaries) {
    if (!ids.has(s.record_id)) continue;
    const sum = clean(s.summary, `summary ${s.record_id}`);
    const why = clean(s.why_it_matters, `why ${s.record_id}`);
    if (sum && why) summaries.set(s.record_id, { summary: { text: sum, basis: 'ai' }, whyItMatters: { text: why, basis: 'ai' } });
  }
  return { briefing, analyses, summaries, rejected };
}

export type AiCaller = (system: string, user: string, config: PipelineConfig['ai']) => Promise<AiOutput | null>;

/** Default caller: Claude via the official SDK with structured (schema-validated) output. */
export const claudeCaller: AiCaller = async (system, user, config) => {
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: config.model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort: config.effort, format: betaZodOutputFormat(AiOutputSchema) },
    // Server-side fallback: if the primary model declines, the API retries on a suitable fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  });
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
  return response.parsed_output ?? null;
};

export async function runAi(
  config: PipelineConfig['ai'],
  top: BioRecord[],
  candidates: BioRecord[],
  abstracts: Map<string, string | undefined>,
  caller: AiCaller = claudeCaller,
): Promise<AiResult> {
  const empty: AiResult = { analyses: new Map(), summaries: new Map(), note: '', used: false };
  if (!config.enabled) return { ...empty, note: 'AI summarisation disabled (no ANTHROPIC_API_KEY configured); deterministic summaries used.' };
  if (top.length === 0) return { ...empty, note: 'AI not used: no qualifying records.' };

  const recs = [...new Map([...top, ...candidates].map((r) => [r.id, r])).values()].slice(0, config.maxRecords);
  const input = recs.map((r) => toAiInput(r, abstracts.get(r.id)));
  const user = `Records (JSON):\n${JSON.stringify(input)}\n\nTasks:\n1. Write the briefing sentence about today's biotechnology developments.\n2. For these top discovery IDs, answer the five questions: ${top.map((t) => t.id).join(', ')}.\n3. Write a summary and why_it_matters for every supplied record.`;
  try {
    const out = await caller(SYSTEM_PROMPT, user, config);
    if (!out) return { ...empty, note: 'AI response was refused, truncated or unparseable; deterministic summaries used.' };
    const v = validateAiOutput(out, input, top.map((t) => t.id));
    const note = `AI summaries generated with ${config.model} from supplied metadata/abstracts only.${v.rejected.length ? ` ${v.rejected.length} AI field(s) failed validation and were replaced with deterministic text.` : ''}`;
    return { briefing: v.briefing, analyses: v.analyses, summaries: v.summaries, note, used: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0].slice(0, 200) : 'unknown error';
    return { ...empty, note: `AI request failed (${msg}); deterministic summaries used.` };
  }
}
