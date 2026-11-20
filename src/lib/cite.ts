import type { SavedRecord } from './library';

/**
 * Citations built ONLY from source metadata. Missing fields are omitted, never invented.
 * Formats: a readable reference (APA-like), BibTeX and RIS (for Zotero, Mendeley, EndNote).
 */

type Citable = Pick<SavedRecord, 'id' | 'title' | 'url' | 'authors' | 'organization' | 'venue' | 'date' | 'evidence' | 'identifiers' | 'source'>;

const year = (d: string) => d.slice(0, 4);

function authorList(r: Citable): string {
  const a = r.authors.length ? r.authors : r.organization ? [r.organization] : [];
  if (!a.length) return '';
  if (a.length > 6) return `${a.slice(0, 6).join(', ')}, et al.`;
  return a.length > 1 ? `${a.slice(0, -1).join(', ')} & ${a.at(-1)}` : a[0];
}

function kindNote(r: Citable): string {
  switch (r.evidence) {
    case 'PREPRINT':
      return ' [Preprint, not peer-reviewed]';
    case 'CLINICAL TRIAL':
      return ' [Clinical trial registration]';
    case 'PATENT APPLICATION':
      return ' [Patent document]';
    case 'REGULATORY UPDATE':
      return ' [Regulatory announcement]';
    case 'COMPANY ANNOUNCEMENT':
      return ' [Company announcement]';
    default:
      return '';
  }
}

function link(r: Citable): string {
  return r.identifiers.doi ? `https://doi.org/${r.identifiers.doi}` : r.url;
}

/** Readable reference, e.g. "Rivera, A. & Okafor, C. (2026). Title. Journal. https://doi.org/…" */
export function plainCitation(r: Citable): string {
  const parts = [authorList(r), `(${year(r.date)}).`, `${r.title.replace(/\.$/, '')}.${kindNote(r)}`, r.venue ? `${r.venue}.` : '', r.identifiers.nct ? `${r.identifiers.nct}.` : '', r.identifiers.patentNumber ? `${r.identifiers.patentNumber}.` : '', link(r)];
  return parts.filter(Boolean).join(' ').replace(/^\(/, '(');
}

const bibEscape = (s: string) => s.replace(/[{}\\]/g, '').replace(/[&%$#_]/g, (m) => `\\${m}`);

function bibKey(r: Citable): string {
  const first = (r.authors[0] ?? r.organization ?? 'record').split(/\s+/).at(-1)!.replace(/[^A-Za-z]/g, '') || 'record';
  return `${first}${year(r.date)}_${r.id.replace(/[^a-z0-9]/gi, '').slice(-6)}`;
}

export function bibtex(r: Citable): string {
  const type = r.evidence === 'PEER-REVIEWED' ? 'article' : 'misc';
  const fields: [string, string | undefined][] = [
    ['title', `{${bibEscape(r.title)}}`],
    ['author', r.authors.length ? r.authors.map(bibEscape).join(' and ') : r.organization ? `{${bibEscape(r.organization)}}` : undefined],
    [type === 'article' ? 'journal' : 'howpublished', r.venue ? bibEscape(r.venue) : undefined],
    ['year', year(r.date)],
    ['doi', r.identifiers.doi],
    ['pmid', r.identifiers.pmid],
    ['url', r.url],
    ['note', kindNote(r).replace(/^ \[|\]$/g, '') || undefined],
  ];
  const body = fields
    .filter(([, v]) => v)
    .map(([k, v]) => `  ${k} = {${v!.replace(/^\{|\}$/g, '')}}`)
    .join(',\n');
  return `@${type}{${bibKey(r)},\n${body}\n}`;
}

export function ris(r: Citable): string {
  const ty = r.evidence === 'PEER-REVIEWED' ? 'JOUR' : r.evidence === 'PATENT APPLICATION' ? 'PAT' : r.evidence === 'PREPRINT' ? 'UNPB' : 'GEN';
  const lines = [`TY  - ${ty}`, `TI  - ${r.title}`, ...(r.authors.length ? r.authors : r.organization ? [r.organization] : []).map((a) => `AU  - ${a}`)];
  if (r.venue) lines.push(`JO  - ${r.venue}`);
  lines.push(`PY  - ${year(r.date)}`, `DA  - ${r.date.replace(/-/g, '/')}`);
  if (r.identifiers.doi) lines.push(`DO  - ${r.identifiers.doi}`);
  if (r.identifiers.pmid) lines.push(`AN  - PMID:${r.identifiers.pmid}`);
  lines.push(`UR  - ${r.url}`);
  const note = kindNote(r).replace(/^ \[|\]$/g, '');
  if (note) lines.push(`N1  - ${note}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

export function exportAll(items: Citable[], format: 'bibtex' | 'ris' | 'text'): string {
  if (format === 'bibtex') return items.map(bibtex).join('\n\n');
  if (format === 'ris') return items.map(ris).join('\n\n');
  return items.map(plainCitation).join('\n\n');
}

/** Download text as a file (browser only). */
export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy to clipboard with a fallback for browsers without the async Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
