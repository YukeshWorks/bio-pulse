import { CATEGORIES } from '../../shared/categories';
import type { Classification } from '../../shared/schema';
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
 * Scoring (deterministic and explainable):
 *   specific term in title  = 2     specific term in body = 1   (each distinct term counted once)
 *   broad term in title     = 1     broad term in body    = 0.5
 *   matching CPC class      = 2     preprint subject match = +0.5 (only if a term already matched)
 * A category QUALIFIES at score >= 2. That means a single incidental body mention of a broad word
 * ("microbiota", "biomarker", "antibody") can never assign a category on its own — the failure that
 * put a childhood-obesity/skeleton paper under Vaccines & diagnostics and Microbiology.
 * Confidence of the primary category: high >= 4 with a title match, medium >= 2.5, otherwise low.
 */
export const QUALIFY_SCORE = 2;

interface CatScore {
  id: string;
  score: number;
  terms: string[];
  title: boolean;
}

function termLabel(m: RegExpMatchArray): string {
  return m[0].toLowerCase().trim();
}

export function scoreCategories(rec: RawRecord): CatScore[] {
  const title = rec.title;
  const body = [rec.abstract ?? '', ...(rec.keywords ?? []), ...(rec.trial?.conditions ?? []), ...(rec.trial?.interventions ?? [])].join(' \n ');
  const out: CatScore[] = [];

  for (const cat of CATEGORIES) {
    if (cat.id === 'patents-inventions') continue;
    const s: CatScore = { id: cat.id, score: 0, terms: [], title: false };
    const apply = (patterns: RegExp[], wTitle: number, wBody: number) => {
      for (const p of patterns) {
        const mt = title.match(p);
        const mb = mt ? null : body.match(p);
        if (mt) {
          s.score += wTitle;
          s.title = true;
          s.terms.push(termLabel(mt));
        } else if (mb) {
          s.score += wBody;
          s.terms.push(termLabel(mb));
        }
      }
    };
    apply(cat.patterns, 2, 1);
    apply(cat.broad, 1, 0.5);
    if (s.score > 0 && rec.subjects?.some((x) => cat.preprintSubjects.includes(x))) s.score += 0.5;
    out.push(s);
  }

  for (const code of rec.patent?.cpc ?? []) {
    for (const [re, cats] of CPC_MAP) {
      if (!re.test(code)) continue;
      for (const c of cats) {
        const s = out.find((x) => x.id === c)!;
        s.score += 2;
        s.terms.push(`CPC ${code}`);
      }
    }
  }
  return out.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || Number(b.title) - Number(a.title));
}

export interface ClassifyResult {
  categories: string[];
  classification: Classification | null;
}

/**
 * Returns up to `max` qualifying categories (primary first) with matched terms and a confidence
 * level, or an empty list when the record is out of BioPulse's biotechnology scope.
 */
export function classifyDetailed(rec: RawRecord, max = 3): ClassifyResult {
  const scored = scoreCategories(rec);
  // Regulatory and company news must clear a higher bar: their text is short and promotional.
  const bar = rec.evidence === 'REGULATORY UPDATE' || rec.evidence === 'COMPANY ANNOUNCEMENT' ? 2 : QUALIFY_SCORE;
  let qualifying = scored.filter((s) => s.score >= bar);

  // Trials are pre-filtered to GENETIC/BIOLOGICAL interventions, so they are biotech by construction.
  if (qualifying.length === 0 && rec.evidence === 'CLINICAL TRIAL') {
    const id = rec.trial?.interventionTypes?.includes('GENETIC') ? 'crispr-genetic-engineering' : rec.trial?.interventionTypes?.includes('BIOLOGICAL') ? 'pharma-biotech' : null;
    if (id) qualifying = [{ id, score: 2, terms: [`${rec.trial!.interventionTypes!.includes('GENETIC') ? 'genetic' : 'biological'} intervention (registry field)`], title: false }];
  }

  const isPatent = rec.evidence === 'PATENT APPLICATION';
  const top = qualifying.slice(0, isPatent ? max - 1 : max);
  if (!isPatent && top.length === 0) return { categories: [], classification: null };

  const primary = top[0];
  const confidence: Classification['confidence'] = !primary ? 'low' : primary.score >= 4 && primary.title ? 'high' : primary.score >= 2.5 ? 'medium' : 'low';
  const categories = isPatent ? ['patents-inventions', ...top.map((t) => t.id)] : top.map((t) => t.id);
  return {
    categories,
    classification: {
      primary: primary?.id ?? 'patents-inventions',
      confidence,
      method: 'keyword-rules-v2',
      matched: Object.fromEntries(top.map((t) => [t.id, { score: Math.round(t.score * 10) / 10, terms: [...new Set(t.terms)].slice(0, 6) }])),
    },
  };
}

/** Backwards-compatible helper: category ids only. */
export function classify(rec: RawRecord, max = 3): string[] {
  return classifyDetailed(rec, max).categories;
}
