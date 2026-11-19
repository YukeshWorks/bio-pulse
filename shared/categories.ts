/**
 * Biotechnology coverage taxonomy.
 *
 * `patterns` drive deterministic keyword classification of records (title + abstract excerpt + source keywords).
 * `pubmedTerms` build the per-category PubMed / Europe PMC queries.
 * `context` is GENERAL background about the field. It is shown to readers as general context,
 * never as a claim about any particular record.
 */
export interface CategoryDefinition {
  id: string;
  name: string;
  short: string;
  description: string;
  /** Specific terms: a title match or two distinct body matches qualify a record for the category. */
  patterns: RegExp[];
  /** Broad terms (e.g. "microbiota", "biomarker"): supporting evidence only, never sufficient alone. */
  broad: RegExp[];
  pubmedTerms: string[];
  /** bioRxiv / medRxiv subject collections that are likely relevant (lower-case). */
  preprintSubjects: string[];
  context: string;
}

export const CATEGORIES: CategoryDefinition[] = [
  {
    id: 'crispr-genetic-engineering',
    name: 'Genetic engineering & CRISPR',
    short: 'CRISPR',
    description: 'Genome editing, base and prime editing, gene therapy vectors and transgenic engineering.',
    patterns: [/\bcrispr\b/i, /\bcas(9|12[a-z]?|13|3)\b/i, /base[- ]edit/i, /prime[- ]edit/i, /genome[- ]edit/i, /gene[- ]edit/i, /gene therap/i, /\bTALEN/i, /zinc[- ]finger nuclease/i, /\bAAV\b/, /lentivir/i, /transgen/i],
    broad: [],
    pubmedTerms: ['CRISPR', 'genome editing', 'base editing', 'prime editing', 'gene therapy'],
    preprintSubjects: ['genetics', 'genomics', 'synthetic biology', 'molecular biology', 'genetic and genomic medicine'],
    context: 'Genome-editing advances can change how genetic disease is treated, how gene function is studied and how crop and microbial traits are engineered.',
  },
  {
    id: 'molecular-biology',
    name: 'Molecular biology',
    short: 'Molecular',
    description: 'Gene regulation, RNA biology, epigenetics and molecular mechanisms.',
    patterns: [/\bRNA[- ]seq/i, /epigenet/i, /non-?coding RNA/i, /chromatin/i, /\bmicroRNA|miRNA/i, /DNA methylation/i],
    broad: [/transcription factor/i, /gene expression/i, /\bsplicing\b/i],
    pubmedTerms: ['gene regulation', 'RNA biology', 'epigenetic regulation', 'chromatin'],
    preprintSubjects: ['molecular biology', 'biochemistry', 'genomics', 'cell biology'],
    context: 'Molecular-mechanism studies provide the foundation for new drug targets, diagnostics and engineered biological systems.',
  },
  {
    id: 'microbiology',
    name: 'Microbiology',
    short: 'Microbiology',
    description: 'Bacteria, viruses, fungi, microbiomes and antimicrobial resistance.',
    patterns: [/bacteriophage|\bphage/i, /antimicrobial/i, /antibiotic/i, /\bAMR\b/],
    broad: [/microbio/i, /bacteri(a|al|um)/i, /\bvir(us|al)\b/i, /fung(al|us|i)\b/i, /pathogen/i],
    pubmedTerms: ['microbiome', 'antimicrobial resistance', 'bacteriophage', 'antibiotic discovery'],
    preprintSubjects: ['microbiology', 'infectious diseases'],
    context: 'Microbiology underpins infection control, antimicrobial-resistance response and the use of microbes as production hosts.',
  },
  {
    id: 'immunotechnology',
    name: 'Immunotechnology',
    short: 'Immuno',
    description: 'Antibody engineering, CAR-T and cell-based immunotherapies, immune profiling.',
    patterns: [/monoclonal antibod/i, /\bCAR[- ]?T\b/i, /\bCAR[- ]NK\b/i, /immunotherap/i, /checkpoint inhibit/i, /bispecific/i, /\bT[- ]cell receptor|\bTCR\b/i, /nanobod/i],
    broad: [/\bantibod(y|ies)\b/i, /immunoassay/i],
    pubmedTerms: ['CAR-T', 'antibody engineering', 'bispecific antibody', 'immunotherapy'],
    preprintSubjects: ['immunology', 'cancer biology', 'allergy and immunology'],
    context: 'Engineered antibodies and immune cells are among the fastest-growing classes of biological medicines.',
  },
  {
    id: 'stem-cells-regenerative',
    name: 'Stem cells & regenerative medicine',
    short: 'Regenerative',
    description: 'Pluripotent and adult stem cells, organoids, tissue engineering.',
    patterns: [/stem cell/i, /\biPSC/i, /pluripoten/i, /organoid/i, /tissue engineer/i, /cell therap/i],
    broad: [/regenerative/i, /reprogramm/i],
    pubmedTerms: ['induced pluripotent stem cells', 'organoid', 'regenerative medicine', 'tissue engineering'],
    preprintSubjects: ['developmental biology', 'cell biology', 'bioengineering'],
    context: 'Stem-cell and organoid technologies aim to replace damaged tissue and provide more human-relevant disease models.',
  },
  {
    id: 'synthetic-biology',
    name: 'Synthetic biology',
    short: 'SynBio',
    description: 'Genetic circuits, engineered organisms, cell-free systems and DNA synthesis.',
    patterns: [/synthetic biolog/i, /genetic circuit/i, /gene circuit/i, /cell-free (protein|expression|system)/i, /biofoundr/i, /metabolic engineer/i, /chassis (strain|organism)/i, /DNA synthesis/i, /xenobiolog/i, /optogenetic/i],
    broad: [],
    pubmedTerms: ['synthetic biology', 'genetic circuit', 'metabolic engineering', 'cell-free protein synthesis'],
    preprintSubjects: ['synthetic biology', 'bioengineering', 'systems biology'],
    context: 'Synthetic biology applies engineering design to living systems, enabling programmable cells and new bio-based products.',
  },
  {
    id: 'industrial-biotech',
    name: 'Industrial biotechnology',
    short: 'Industrial',
    description: 'Enzymes, fermentation, biomanufacturing and bio-based chemicals.',
    patterns: [/industrial biotech/i, /biomanufactur/i, /biocatal/i, /\benzym(e|atic) (production|process|catalys)/i, /bio-?based chemical/i, /biofuel/i, /bioethanol/i, /\bbioplastic/i, /precision fermentation/i],
    broad: [/fermentation/i],
    pubmedTerms: ['biomanufacturing', 'biocatalysis', 'industrial fermentation', 'biofuel'],
    preprintSubjects: ['bioengineering', 'microbiology', 'synthetic biology'],
    context: 'Industrial biotechnology replaces chemical processes with biological ones to make fuels, materials and chemicals.',
  },
  {
    id: 'agricultural-biotech',
    name: 'Agricultural biotechnology',
    short: 'Agri',
    description: 'Crop engineering, plant genomics, livestock biotechnology and biopesticides.',
    patterns: [/plant (genom|breed|biotech)/i, /transgenic plant/i, /drought (tolera|resist)/i, /biopesticide/i, /biofertili/i],
    broad: [/\bcrop(s)?\b/i, /\bwheat|\brice\b|\bmaize\b|\bsoybean/i, /livestock/i, /agricultur/i],
    pubmedTerms: ['crop genome editing', 'plant biotechnology', 'transgenic crops', 'agricultural biotechnology'],
    preprintSubjects: ['plant biology', 'genetics'],
    context: 'Agricultural biotechnology targets yield, resilience and nutrition in crops and livestock under changing climate conditions.',
  },
  {
    id: 'marine-biotech',
    name: 'Marine biotechnology',
    short: 'Marine',
    description: 'Marine organisms, algae, marine natural products and blue biotechnology.',
    patterns: [/microalga/i, /seaweed/i, /cyanobacteri/i, /sponge-derived/i],
    broad: [/marine/i, /\bocean\b/i, /coral/i, /\balga(e|l)\b/i],
    pubmedTerms: ['marine biotechnology', 'microalgae', 'marine natural products'],
    preprintSubjects: ['microbiology', 'ecology'],
    context: 'Marine organisms are a source of novel enzymes, bioactive compounds and sustainable biomass.',
  },
  {
    id: 'food-biotech',
    name: 'Food biotechnology',
    short: 'Food',
    description: 'Cultivated meat, fermented foods, probiotics, food safety and nutrition biotechnology.',
    patterns: [/food (biotech|safety|fermentation|processing)/i, /cultivated meat|cultured meat|cell-based meat/i, /probiotic/i, /alternative protein/i, /fermented food/i, /foodborne/i, /nutraceutical/i],
    broad: [],
    pubmedTerms: ['food biotechnology', 'cultivated meat', 'probiotics', 'precision fermentation food'],
    preprintSubjects: ['microbiology', 'bioengineering'],
    context: 'Food biotechnology spans safer food production, alternative proteins and microbiome-targeted nutrition.',
  },
  {
    id: 'bioinformatics',
    name: 'Bioinformatics',
    short: 'Bioinformatics',
    description: 'Genomic data analysis, computational biology, sequence analysis and databases.',
    patterns: [/bioinformatic/i, /computational biolog/i, /single-cell (RNA|sequenc|transcriptom)/i, /\bscRNA/i, /genome assembl/i, /sequence alignment/i, /metagenom/i],
    broad: [/transcriptom/i, /proteomic/i, /multi-?omic/i],
    pubmedTerms: ['bioinformatics', 'computational biology', 'single-cell sequencing', 'multi-omics'],
    preprintSubjects: ['bioinformatics', 'genomics', 'systems biology'],
    context: 'Bioinformatics turns large biological datasets into testable hypotheses and is central to modern biology.',
  },
  {
    id: 'ai-drug-discovery',
    name: 'AI-assisted drug discovery',
    short: 'AI drug discovery',
    description: 'Machine learning for target identification, molecule design and protein structure.',
    patterns: [/generative model/i, /AlphaFold/i, /structure prediction/i, /virtual screening/i],
    broad: [/machine learning/i, /deep learning/i, /artificial intelligence/i, /\bAI\b/, /neural network/i, /language model/i],
    pubmedTerms: ['machine learning drug discovery', 'deep learning protein design', 'artificial intelligence drug discovery'],
    preprintSubjects: ['bioinformatics', 'pharmacology and toxicology', 'biophysics'],
    context: 'AI methods are being used to propose drug candidates and protein designs faster, but predictions still require experimental validation.',
  },
  {
    id: 'pharma-biotech',
    name: 'Pharmaceutical biotechnology',
    short: 'Pharma',
    description: 'Biologics, biosimilars, drug delivery and biopharmaceutical development.',
    patterns: [/biosimilar/i, /biopharm/i, /antibody-drug conjugate|\bADC\b/i, /recombinant protein/i, /therapeutic protein/i, /oligonucleotide therap/i, /\bsiRNA\b/i, /antisense/i],
    broad: [/biologic(s)?\b/i, /drug delivery/i],
    pubmedTerms: ['biopharmaceutical', 'biosimilar', 'antibody-drug conjugate', 'drug delivery system'],
    preprintSubjects: ['pharmacology and toxicology', 'pharmacology and therapeutics'],
    context: 'Biopharmaceuticals now make up a large share of new medicines; development, manufacturing and delivery remain key bottlenecks.',
  },
  {
    id: 'vaccines-diagnostics',
    name: 'Vaccines & diagnostics',
    short: 'Vaccines/Dx',
    description: 'Vaccine platforms, mRNA vaccines, diagnostic assays and point-of-care testing.',
    patterns: [/vaccin/i, /\bmRNA vaccine/i, /diagnostic (assay|test|kit|platform|device)s?/i, /companion diagnostic/i, /in vitro diagnostic/i, /point-of-care/i, /\bRT-?(q)?PCR\b/, /\bLAMP assay/i, /liquid biops/i],
    broad: [/diagnost/i, /biomarker/i, /screening test/i],
    pubmedTerms: ['vaccine development', 'mRNA vaccine', 'molecular diagnostics', 'point-of-care diagnostic'],
    preprintSubjects: ['infectious diseases', 'immunology', 'epidemiology'],
    context: 'Vaccines and diagnostics determine how quickly health systems can detect and prevent disease.',
  },
  {
    id: 'biomaterials-nanobiotech',
    name: 'Biomaterials & nanobiotechnology',
    short: 'Nano/Biomaterials',
    description: 'Biomaterials, hydrogels, scaffolds, nanoparticles and lipid nanoparticles.',
    patterns: [/biomaterial/i, /hydrogel/i, /nanomedicine/i, /nanobiotech/i, /lipid nanoparticle|\bLNP/i, /nanocarrier/i, /extracellular vesicle|exosome/i],
    broad: [/scaffold/i, /nanoparticle/i],
    pubmedTerms: ['biomaterials', 'hydrogel', 'lipid nanoparticle', 'nanomedicine'],
    preprintSubjects: ['bioengineering', 'biophysics'],
    context: 'Biomaterials and nanocarriers determine how therapies are delivered and how engineered tissues are supported.',
  },
  {
    id: 'bioprocess-engineering',
    name: 'Bioprocess engineering',
    short: 'Bioprocess',
    description: 'Upstream and downstream processing, bioreactors, scale-up and process analytics.',
    patterns: [/bioprocess/i, /bioreactor/i, /downstream process/i, /upstream process/i, /perfusion culture/i, /\bCHO cell/i, /purification process/i, /continuous manufactur/i],
    broad: [/\bscale-?up\b/i],
    pubmedTerms: ['bioprocess', 'bioreactor', 'downstream processing', 'CHO cell culture'],
    preprintSubjects: ['bioengineering'],
    context: 'Bioprocess engineering decides whether a biological product can be manufactured reliably and affordably at scale.',
  },
  {
    id: 'environmental-biotech',
    name: 'Environmental biotechnology',
    short: 'Environmental',
    description: 'Bioremediation, plastic degradation, carbon capture and wastewater biotechnology.',
    patterns: [/bioremediat/i, /plastic[- ]degrad/i, /\bPET(ase)?\b.*degrad/i, /carbon (capture|fixation)/i, /environmental biotech/i],
    broad: [/wastewater/i, /pollutant/i, /\bmethan(e|ogen)/i, /biodegrad/i],
    pubmedTerms: ['bioremediation', 'plastic biodegradation', 'wastewater treatment microbial', 'biological carbon capture'],
    preprintSubjects: ['microbiology', 'ecology', 'bioengineering'],
    context: 'Environmental biotechnology uses organisms and enzymes to clean pollution, recycle waste and capture carbon.',
  },
  {
    id: 'biosensors',
    name: 'Biosensors',
    short: 'Biosensors',
    description: 'Biosensing devices, wearable sensors, aptamer and electrochemical sensors.',
    patterns: [/biosensor/i, /aptamer/i, /electrochemical (detection|sensor)/i, /lab-on-a-chip/i],
    broad: [/\bsensor\b/i, /wearable/i, /microfluidic/i],
    pubmedTerms: ['biosensor', 'aptamer sensor', 'wearable biosensor', 'microfluidic diagnostic'],
    preprintSubjects: ['bioengineering'],
    context: 'Biosensors translate biological signals into measurable outputs for monitoring health, food and the environment.',
  },
  {
    id: 'protein-engineering',
    name: 'Protein engineering',
    short: 'Protein eng.',
    description: 'Directed evolution, de novo protein design and enzyme engineering.',
    patterns: [/protein engineer/i, /protein design/i, /de novo (protein|design|binder)/i, /directed evolution/i, /enzyme engineer/i, /\bbinder design/i],
    broad: [/mutagenesis/i],
    pubmedTerms: ['protein engineering', 'directed evolution', 'de novo protein design', 'enzyme engineering'],
    preprintSubjects: ['bioengineering', 'biochemistry', 'biophysics', 'synthetic biology'],
    context: 'Engineered proteins and enzymes are the working parts of many biotech products, from therapeutics to industrial catalysts.',
  },
  {
    id: 'patents-inventions',
    name: 'Biotechnology patents & inventions',
    short: 'Patents',
    description: 'Newly published biotechnology patent documents and disclosed inventions.',
    patterns: [/\bpatent\b/i, /\binvention\b/i],
    broad: [],
    pubmedTerms: [],
    preprintSubjects: [],
    context: 'Patent filings show where organisations are investing; a filing does not demonstrate that an invention works or will be commercialised.',
  },
];

export const CATEGORY_BY_ID: Record<string, CategoryDefinition> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

export function categoryName(id: string): string {
  return CATEGORY_BY_ID[id]?.name ?? id;
}
