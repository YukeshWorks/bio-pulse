import { XMLParser } from 'fast-xml-parser';
import { cleanText } from './text';

/**
 * XML parser configured for scientific feeds: values stay strings (no numeric coercion, which
 * would corrupt identifiers with leading zeros), mixed-content nodes are kept raw and cleaned later.
 */
export function parseXml(xml: string, opts: { stopNodes?: string[]; arrays?: string[] } = {}): any {
  const arrays = new Set(opts.arrays ?? []);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
    trimValues: true,
    stopNodes: opts.stopNodes ?? [],
    isArray: (name) => arrays.has(name),
  });
  return parser.parse(xml);
}

export function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Text content of a parsed node that may be a string, {#text}, or an array of either. */
export function nodeText(v: unknown): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' || typeof v === 'number') return cleanText(String(v));
  if (Array.isArray(v)) return v.map(nodeText).filter(Boolean).join(' ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if ('#text' in o) return cleanText(String(o['#text']));
    if ('$' in o) return cleanText(String(o.$));
  }
  return '';
}
