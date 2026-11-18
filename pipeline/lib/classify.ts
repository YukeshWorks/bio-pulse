import { CATEGORIES } from '../../shared/categories';
import type { RawRecord } from '../types';

const CPC_MAP: [RegExp, string[]][] = [
  [/^A61K48/, ['crispr-genetic-engineering']],
  [/^A61K39/, ['vaccines-diagnostics', 'immunotechnology']],
  [/^C07K16/, ['immunotechnology']],
  [/^C07K/, ['protein-engineering']],
  [/^C12N15/, ['crispr-genetic-engineering', 'molecular-biology']],
  [/^C12N9/, ['protein-engineering', 'industrial-biotech']],
  [/^C12N5/, ['stem-cells-regenerative']],
  [/^C12N1/, ['microbiology']],
  [/^C12N7/, ['microbiology']],
  [/^C12P/, ['industrial-biotech']],
  [/^C12Q1\/68/, ['molecular-biology', 'vaccines-diagnostics']],
  [/^C12Q/, ['vaccines-diagnostics']],
  [/^C12M/, ['bioprocess-engineering']],
  [/^G16B/, ['bioinformatics']],
  [/^A01H/, ['agricultural-biotech']],
  [/^G01N33/, ['biosensors', 'vaccines-diagnostics']],
];

/**
 * Deterministic keyword classification. Title matches count double. Returns up to `max`
 * category ids ordered by score; an empty array means the record is not biotech-relevant.
 */
export function classify(rec: RawRecord, max = 3): string[] {
  const title = rec.title;
  const body = [rec.abstract ?? '', ...(rec.keywords ?? []), ...(rec.trial?.conditions ?? []), ...(rec.trial?.interventions ?? [])].join(' \n ');
  const scores = new Map<string, number>();

  for (const cat of CATEGORIES) {
    if (cat.id === 'patents-inventions') continue;
    let score = 0;
    for (const p of cat.patterns) {
      if (p.test(title)) score += 2;
      if (p.test(body)) score += 1;
    }
    if (rec.subjects?.some((s) => cat.preprintSubjects.includes(s)) && score > 0) score += 0.5;
    if (score > 0) scores.set(cat.id, score);
  }

  for (const code of rec.patent?.cpc ?? []) {
    for (const [re, cats] of CPC_MAP) {
      if (re.test(code)) for (const c of cats) scores.set(c, (scores.get(c) ?? 0) + 1.5);
    }
  }

  // Trials are pre-filtered to GENETIC/BIOLOGICAL interventions, so they are biotech by construction.
  if (rec.evidence === 'CLINICAL TRIAL' && scores.size === 0) {
    if (rec.trial?.interventionTypes?.includes('GENETIC')) scores.set('crispr-genetic-engineering', 1);
    else if (rec.trial?.interventionTypes?.includes('BIOLOGICAL')) scores.set('pharma-biotech', 1);
  }

  const ranked = [...scores.entries()]
    .filter(([, s]) => s >= (rec.evidence === 'REGULATORY UPDATE' || rec.evidence === 'COMPANY ANNOUNCEMENT' ? 2 : 1))
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, max);

  if (rec.evidence === 'PATENT APPLICATION') return ['patents-inventions', ...ranked.slice(0, max - 1)];
  return ranked;
}
