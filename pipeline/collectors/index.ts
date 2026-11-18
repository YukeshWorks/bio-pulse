import type { Collector } from '../types';
import { clinicalTrialsCollector } from './clinicaltrials';
import { epoCollector } from './epo';
import { europePmcCollector } from './europepmc';
import { biorxivCollector, medrxivCollector } from './preprints';
import { pubmedCollector } from './pubmed';
import { companyCollector, emaCollector, fdaCollector } from './rss';

/** Registry of modular collectors. Add a new source by implementing `Collector` and listing it here. */
export const COLLECTORS: Collector[] = [
  pubmedCollector,
  europePmcCollector,
  biorxivCollector,
  medrxivCollector,
  clinicalTrialsCollector,
  fdaCollector,
  emaCollector,
  epoCollector,
  companyCollector,
];
