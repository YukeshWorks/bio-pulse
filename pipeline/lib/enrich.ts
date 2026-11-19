import { CATEGORY_BY_ID } from '../../shared/categories';
import { EVIDENCE } from '../../shared/evidence';
import type { AttributedText, BioRecord, Classification, DiscoveryAnalysis } from '../../shared/schema';
import type { MergedRecord } from './dedupe';
import { excerpt, findSentence, formatAuthors, truncateWords } from './text';

/**
 * Deterministic, source-grounded text generation. Nothing here invents findings: text is either
 * quoted from the source (basis "source"), assembled from structured metadata ("metadata"),
 * a generic evidence-class/field statement ("template"), or an explicit "not stated" ("unavailable").
 */

const DEVELOPED_RE = /\b(we|here we|this study|this work|our study|authors)\b[^.]{0,40}\b(develop|present|report|describe|engineer|design|introduce|establish|construct|generat|identif|demonstrat|creat|build|propose)/i;
const NEW_RE = /\b(novel|for the first time|first[- ]in|previously (unknown|undescribed|unrecognized)|unlike|compared (with|to)|outperform|improv(ed|es|ement)|surpass|than (existing|current|conventional|standard)|state-of-the-art)/i;
const LIMIT_RE = /\b(limitation|limited by|however,|further (studies|research|work|validation|investigation)|remain(s)? (unclear|unknown|to be)|warrant|in mice|murine model|in vitro|small sample|pilot|preliminary|retrospective)/i;
const PATENT_INVENTION_RE = /\b(relates to|provides|discloses|invention|method|composition|system|device)\b/i;

export const UNAVAILABLE = (what: string): AttributedText => ({ text: `${what} is not stated in the available source metadata.`, basis: 'unavailable' });

export function sourceSummary(r: MergedRecord): AttributedText {
  if (r.abstract && r.abstract.length > 40) return { text: excerpt(r.abstract, 320), basis: 'source' };
  if (r.evidence === 'CLINICAL TRIAL' && r.trial) {
    const parts = [
      r.trial.studyType && `${r.trial.studyType} study`,
      r.trial.phase?.length ? r.trial.phase.join('/') : undefined,
      r.trial.conditions?.length && `conditions: ${r.trial.conditions.slice(0, 3).join(', ')}`,
      r.trial.interventions?.length && `interventions: ${r.trial.interventions.slice(0, 3).join(', ')}`,
    ].filter(Boolean);
    if (parts.length) return { text: `Registered ${parts.join('; ')}.`, basis: 'metadata' };
  }
  return { text: 'No abstract or description is available in the source metadata; see the original source.', basis: 'unavailable' };
}

/**
 * General field context for "why it matters". It is NOT a finding of the record. When the category
 * assignment is low-confidence, a category-specific explanation is withheld so a weak keyword match
 * cannot put misleading context (e.g. vaccine context on a bone-development paper) in front of readers.
 */
export function contextFor(categories: string[], classification?: Classification | null): AttributedText {
  const primary = classification?.primary && classification.primary !== 'patents-inventions' ? classification.primary : categories.find((c) => c !== 'patents-inventions') ?? categories[0];
  const cat = CATEGORY_BY_ID[primary];
  if (classification?.confidence === 'low' || !cat) {
    return {
      text: 'General context: this record matched BioPulse’s biotechnology keywords only weakly, so no field-specific significance is stated. See the original source for its relevance.',
      basis: 'template',
    };
  }
  const terms = classification?.matched[primary]?.terms.slice(0, 3);
  return {
    text: `General context (${cat.name}${terms?.length ? `; matched: ${terms.join(', ')}` : ''}): ${cat.context}`,
    basis: 'template',
  };
}

export function limitationsFor(r: MergedRecord): AttributedText[] {
  const out: AttributedText[] = [{ text: EVIDENCE[r.evidence].caution, basis: 'template' }];
  if (r.evidence === 'PATENT APPLICATION' && r.patent) {
    out.push({
      text:
        r.patent.status === 'granted'
          ? `Granted patent (kind ${r.patent.kind ?? '?'}): grants legal rights in the issuing jurisdiction only.`
          : r.patent.status === 'application'
            ? `Published application (kind ${r.patent.kind ?? '?'}): claims are unexamined or under examination and may be narrowed or refused.`
            : 'Patent document status could not be determined from the kind code.',
      basis: 'metadata',
    });
  }
  if (r.evidence === 'CLINICAL TRIAL' && r.trial?.status) {
    out.push({ text: `Registry status: ${r.trial.status}. No results are implied by registration.`, basis: 'metadata' });
  }
  if (r.abstract) {
    const lim = findSentence(r.abstract, LIMIT_RE, [], 260);
    if (lim) out.push({ text: lim, basis: 'source' });
    if (r.evidence === 'PEER-REVIEWED' || r.evidence === 'PREPRINT') {
      out.push({ text: 'BioPulse summarises the abstract only; the full text, methods and data were not reviewed.', basis: 'template' });
    }
  }
  if (r.mergeNotes.length) out.push(...r.mergeNotes.map((t) => ({ text: t, basis: 'template' as const })));
  return out;
}

function datePhrase(r: MergedRecord | BioRecord): string {
  const label: Record<string, string> = { published: 'published', posted: 'posted', indexed: 'indexed in PubMed', 'first-posted': 'first posted', announced: 'announced' };
  return `${label[r.dateType]} ${r.date}`;
}

export function whatHappened(r: MergedRecord): AttributedText {
  const who = r.authors.length ? formatAuthors(r.authors, 2) : r.organization;
  const title = `“${truncateWords(r.title, 22)}”`;
  switch (r.evidence) {
    case 'PEER-REVIEWED':
      return { text: `${who ? `${who}: ` : ''}${title} — journal article in ${r.venue ?? 'an indexed journal'}, ${datePhrase(r)}.`, basis: 'metadata' };
    case 'PREPRINT':
      return { text: `${who ? `${who}: ` : ''}${title} — preprint on ${r.venue ?? 'a preprint server'}, ${datePhrase(r)}. Not peer-reviewed.`, basis: 'metadata' };
    case 'CLINICAL TRIAL':
      return {
        text: `${r.trial?.sponsor ?? r.organization ?? 'A sponsor'} registered ${r.identifiers.nct}: ${title}${r.trial?.phase?.length ? ` (${r.trial.phase.join('/')})` : ''}, ${datePhrase(r)}.`,
        basis: 'metadata',
      };
    case 'REGULATORY UPDATE':
      return { text: `${r.organization ?? r.sourceName} ${datePhrase(r)}: ${title}.`, basis: 'metadata' };
    case 'PATENT APPLICATION':
      return {
        text: `${r.patent?.applicants?.length ? `${r.patent.applicants.slice(0, 2).join(', ')}: ` : ''}patent document ${r.identifiers.patentNumber} (${r.patent?.status ?? 'unknown status'}) ${title}, ${datePhrase(r)}.`,
        basis: 'metadata',
      };
    case 'COMPANY ANNOUNCEMENT':
      return { text: `${r.organization ?? 'A company'} ${datePhrase(r)}: ${title}.`, basis: 'metadata' };
  }
}

function whatNextTemplate(r: MergedRecord): AttributedText {
  const t: Record<string, string> = {
    'PEER-REVIEWED': 'Interpretation: independent replication and follow-up studies would be needed before the approach is adopted more widely.',
    PREPRINT: 'Interpretation: the manuscript may be revised during peer review; its conclusions could change.',
    'CLINICAL TRIAL': `Interpretation: the study will need to enrol and follow participants before any results can be reported${r.trial?.primaryCompletion ? ` (registry lists primary completion ${r.trial.primaryCompletion})` : ''}.`,
    'REGULATORY UPDATE': 'Interpretation: implementation depends on the conditions in the official notice; check the agency page for updates.',
    'PATENT APPLICATION':
      r.patent?.status === 'granted'
        ? 'Interpretation: a grant confers legal rights; it does not show that the invention works in practice or will be commercialised.'
        : 'Interpretation: the application may proceed through examination; a grant is not guaranteed and would not by itself demonstrate efficacy.',
    'COMPANY ANNOUNCEMENT': 'Interpretation: claims should be checked against peer-reviewed data or regulatory filings as they become available.',
  };
  return { text: t[r.evidence], basis: 'template' };
}

/** Six-question analysis for a top discovery, using only the record's own metadata and abstract. */
export function deterministicAnalysis(r: MergedRecord, categories: string[], classification?: Classification | null): DiscoveryAnalysis {
  const abs = r.abstract ?? '';
  let developed: AttributedText | null = null;
  if (abs) {
    const s = r.evidence === 'PATENT APPLICATION' ? findSentence(abs, PATENT_INVENTION_RE) : findSentence(abs, DEVELOPED_RE);
    if (s) developed = { text: s, basis: 'source' };
  }
  if (!developed && r.evidence === 'CLINICAL TRIAL' && r.trial?.interventions?.length) {
    developed = { text: `Interventions under study: ${r.trial.interventions.slice(0, 4).join('; ')}${r.trial.conditions?.length ? ` — for ${r.trial.conditions.slice(0, 3).join(', ')}` : ''}.`, basis: 'metadata' };
  }
  const newSentence = abs ? findSentence(abs, NEW_RE, developed ? [developed.text] : []) : null;
  const lim = limitationsFor(r);
  const sourceLim = lim.find((l) => l.basis === 'source');
  const otherLim = lim.filter((l) => l.basis !== 'source').slice(0, 2);
  return {
    whatHappened: whatHappened(r),
    whatWasDeveloped: developed ?? UNAVAILABLE('What was developed'),
    whatIsNew: newSentence ? { text: newSentence, basis: 'source' } : UNAVAILABLE('A comparison with previous approaches'),
    whyImportant: contextFor(categories, classification),
    // Mixed content: generic evidence caveats plus, when present, a quoted limitation from the abstract.
    limitations: {
      text: `${otherLim.map((l) => l.text).join(' ')}${sourceLim ? ` The abstract notes: “${sourceLim.text}”` : ''}`,
      basis: 'template',
    },
    whatNext: whatNextTemplate(r),
  };
}
