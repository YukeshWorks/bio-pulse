import type { EvidenceClass } from './schema';

export interface EvidenceInfo {
  label: EvidenceClass;
  short: string;
  /** Plain-language label for the simple view; always includes the key caveat. */
  plain: string;
  /** One-sentence explanation for non-experts ("What does this mean?"). */
  explain: string;
  definition: string;
  caution: string;
  /** Ranking weight used for the daily top discoveries (higher = stronger evidence). */
  weight: number;
}

export const EVIDENCE: Record<EvidenceClass, EvidenceInfo> = {
  'PEER-REVIEWED': {
    label: 'PEER-REVIEWED',
    short: 'Peer-reviewed',
    plain: 'Peer-reviewed study',
    explain: 'Other scientists checked this paper before the journal published it. It is still one study, so results may need confirming.',
    definition: 'Article published in a journal indexed by PubMed/MEDLINE or Europe PMC (journal source).',
    caution: 'Journal indexing indicates editorial review; BioPulse does not independently verify the review process or reproduce results.',
    weight: 3,
  },
  PREPRINT: {
    label: 'PREPRINT',
    short: 'Preprint',
    plain: 'Preprint · not peer-reviewed',
    explain: 'An early version shared publicly before expert review. Findings can change, so treat them as preliminary.',
    definition: 'Manuscript posted to a preprint server (bioRxiv, medRxiv or another server indexed by Europe PMC).',
    caution: 'Preprints have NOT been peer-reviewed. Findings are preliminary and may change; they should not guide clinical practice.',
    weight: 1.6,
  },
  'PATENT APPLICATION': {
    label: 'PATENT APPLICATION',
    short: 'Patent',
    plain: 'Patent filing · not proof it works',
    explain: 'A legal claim to own an invention. It shows what someone is building, not that it works or will reach the market.',
    definition: 'Published patent document (application or grant) retrieved from the European Patent Office OPS service.',
    caution: 'A patent filing describes claimed inventions. It is not evidence of efficacy, safety, regulatory approval or commercial success.',
    weight: 1.4,
  },
  'CLINICAL TRIAL': {
    label: 'CLINICAL TRIAL',
    short: 'Clinical trial',
    plain: 'Clinical trial · no results yet',
    explain: 'A planned or ongoing study in people, registered before it starts. Registration says what will be tested, not whether it worked.',
    definition: 'Study registration on ClinicalTrials.gov.',
    caution: 'A registration describes a planned or ongoing study. It does not report results unless results are explicitly posted.',
    weight: 2.4,
  },
  'REGULATORY UPDATE': {
    label: 'REGULATORY UPDATE',
    short: 'Regulatory',
    plain: 'Regulator news',
    explain: 'An official announcement from a medicines regulator such as the U.S. FDA or Europe’s EMA, e.g. an approval or safety notice.',
    definition: 'Official announcement from a regulator (U.S. FDA, European Medicines Agency).',
    caution: 'Regulatory announcements reflect a decision or communication by the agency; read the original notice for scope and conditions.',
    weight: 2.6,
  },
  'COMPANY ANNOUNCEMENT': {
    label: 'COMPANY ANNOUNCEMENT',
    short: 'Company',
    plain: 'Company news · not independently checked',
    explain: 'A company’s own announcement. It may be promotional and has not been checked by independent experts.',
    definition: 'Press release or news item published by a company through an official feed.',
    caution: 'Company announcements are promotional communications and are not independently verified or peer-reviewed.',
    weight: 0.8,
  },
};

export const EVIDENCE_ORDER: EvidenceClass[] = [
  'PEER-REVIEWED',
  'PREPRINT',
  'CLINICAL TRIAL',
  'REGULATORY UPDATE',
  'PATENT APPLICATION',
  'COMPANY ANNOUNCEMENT',
];
