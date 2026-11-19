import type { EvidenceClass } from './schema';

export interface EvidenceInfo {
  label: EvidenceClass;
  short: string;
  /** Plain-language label for the simple view; always includes the key caveat. */
  plain: string;
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
    definition: 'Article published in a journal indexed by PubMed/MEDLINE or Europe PMC (journal source).',
    caution: 'Journal indexing indicates editorial review; BioPulse does not independently verify the review process or reproduce results.',
    weight: 3,
  },
  PREPRINT: {
    label: 'PREPRINT',
    short: 'Preprint',
    plain: 'Preprint · not peer-reviewed',
    definition: 'Manuscript posted to a preprint server (bioRxiv, medRxiv or another server indexed by Europe PMC).',
    caution: 'Preprints have NOT been peer-reviewed. Findings are preliminary and may change; they should not guide clinical practice.',
    weight: 1.6,
  },
  'PATENT APPLICATION': {
    label: 'PATENT APPLICATION',
    short: 'Patent',
    plain: 'Patent filing · not proof it works',
    definition: 'Published patent document (application or grant) retrieved from the European Patent Office OPS service.',
    caution: 'A patent filing describes claimed inventions. It is not evidence of efficacy, safety, regulatory approval or commercial success.',
    weight: 1.4,
  },
  'CLINICAL TRIAL': {
    label: 'CLINICAL TRIAL',
    short: 'Clinical trial',
    plain: 'Clinical trial · no results yet',
    definition: 'Study registration on ClinicalTrials.gov.',
    caution: 'A registration describes a planned or ongoing study. It does not report results unless results are explicitly posted.',
    weight: 2.4,
  },
  'REGULATORY UPDATE': {
    label: 'REGULATORY UPDATE',
    short: 'Regulatory',
    plain: 'Regulator news',
    definition: 'Official announcement from a regulator (U.S. FDA, European Medicines Agency).',
    caution: 'Regulatory announcements reflect a decision or communication by the agency; read the original notice for scope and conditions.',
    weight: 2.6,
  },
  'COMPANY ANNOUNCEMENT': {
    label: 'COMPANY ANNOUNCEMENT',
    short: 'Company',
    plain: 'Company news · not independently checked',
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
