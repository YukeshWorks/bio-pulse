const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', kappa: 'κ', mu: 'μ', deg: '°', plusmn: '±', times: '×',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Strip markup (HTML/JATS) and normalise whitespace. Never returns markup to the frontend. */
export function cleanText(input: unknown): string {
  if (input === null || input === undefined) return '';
  const s = String(input);
  return decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' '))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanTitle(input: unknown): string {
  return cleanText(input).replace(/\s+([.,;:])/g, '$1').replace(/\.$/, '');
}

const ABBREV = /\b(e\.g|i\.e|et al|vs|Fig|Figs|Ref|approx|ca|Dr|Prof|No|Inc|Ltd|Co|St)\.$/i;

/** Split prose into sentences without breaking on common scientific abbreviations or decimals. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = '';
  const tokens = text.split(/(?<=[.!?])\s+/);
  for (const t of tokens) {
    buf = buf ? `${buf} ${t}` : t;
    if (ABBREV.test(buf) || /\b[A-Z]\.$/.test(buf)) continue;
    out.push(buf.trim());
    buf = '';
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => s.length > 0);
}

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

export function truncateWords(s: string, max: number): string {
  const words = s.trim().split(/\s+/);
  if (words.length <= max) return s.trim();
  return `${words.slice(0, max).join(' ').replace(/[,:;.\-–—]+$/, '')}…`;
}

export function truncateChars(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,:;.\-–—]+$/, '')}…`;
}

/** Remove structured-abstract labels ("RESULTS:", "Background:") from the start of a sentence. */
export function stripSectionLabel(s: string): string {
  return s
    .replace(/^(background|introduction|objectives?|aims?|purpose|context|results|conclusions?|methods|findings|interpretation|significance|summary)\s*:\s*/i, '')
    .replace(/^[A-Z][A-Z &]{2,30}:\s*/, ''); // other ALL-CAPS labels only (case-sensitive)
}

/**
 * Short excerpt of an abstract: leading sentences up to `maxChars`. BioPulse stores only this
 * excerpt (attributed to the source), never full abstracts or full text.
 */
export function excerpt(text: string, maxChars = 320): string {
  const sentences = splitSentences(text).filter((s) => !/^(background|introduction|objectives?|aims?)\s*:?$/i.test(s));
  let out = '';
  for (const s of sentences) {
    const stripped = stripSectionLabel(s);
    if (!out) {
      out = stripped;
      if (out.length >= maxChars * 0.5) break;
      continue;
    }
    if ((out + ' ' + stripped).length > maxChars) break;
    out = `${out} ${stripped}`;
  }
  return truncateChars(out, maxChars);
}

/** First sentence of `text` matching `pattern`, excluding any in `exclude`. */
export function findSentence(text: string, pattern: RegExp, exclude: string[] = [], maxChars = 300): string | null {
  for (const s of splitSentences(text)) {
    if (exclude.includes(s)) continue;
    if (pattern.test(s)) return truncateChars(stripSectionLabel(s), maxChars);
  }
  return null;
}

export function formatAuthors(authors: string[], max = 3): string {
  if (authors.length === 0) return '';
  if (authors.length <= max) return authors.join(', ');
  return `${authors.slice(0, max).join(', ')} et al.`;
}
