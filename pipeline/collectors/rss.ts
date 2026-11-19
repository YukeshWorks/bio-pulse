import type { EvidenceClass, SourceId } from '../../shared/schema';
import type { FeedConfig } from '../config';
import { addDays, parseSourceDate } from '../lib/dates';
import { cleanText, cleanTitle } from '../lib/text';
import { ALLOWED_HOSTS } from '../lib/validate';
import { asArray, nodeText, parseXml } from '../lib/xml';
import type { Collector, CollectorContext, RawRecord } from '../types';

/**
 * Official RSS 2.0 / Atom feeds (FDA, EMA, and optional company press-release feeds).
 * Only headline, link, date and the feed's own short description are used.
 */
export interface FeedItem {
  title: string;
  link: string;
  date: string | null;
  description: string;
}

export function parseFeed(xml: string): FeedItem[] {
  const doc = parseXml(xml, { arrays: ['item', 'entry', 'link'], stopNodes: ['*.description', '*.summary', '*.content'] });
  const rssItems = asArray(doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item);
  if (rssItems.length) {
    return rssItems.map((it: any) => ({
      title: cleanTitle(nodeText(it.title)),
      link: nodeText(asArray(it.link)[0]) || (typeof it.guid === 'string' && /^https?:/.test(it.guid) ? it.guid : nodeText(it.guid)),
      date: parseSourceDate(nodeText(it.pubDate) || nodeText(it['dc:date'])),
      description: cleanText(nodeText(it.description)),
    }));
  }
  const entries = asArray(doc?.feed?.entry);
  return entries.map((e: any) => {
    const links = asArray(e.link);
    const alt = links.find((l: any) => !l?.['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
    return {
      title: cleanTitle(nodeText(e.title)),
      link: typeof alt === 'string' ? alt : (alt?.['@_href'] ?? ''),
      date: parseSourceDate(nodeText(e.published) || nodeText(e.updated)),
      description: cleanText(nodeText(e.summary) || nodeText(e.content)),
    };
  });
}

async function collectFeeds(ctx: CollectorContext, feeds: FeedConfig[], sourceId: SourceId, sourceName: string, evidence: EvidenceClass, venuePrefix?: string) {
  const from = addDays(ctx.runDate, -Math.max(ctx.config.lookbackDays, 3));
  const records: RawRecord[] = [];
  const warnings: string[] = [];
  let failures = 0;
  for (const feed of feeds) {
    try {
      const xml = await ctx.http.getText(feed.url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      const items = parseFeed(xml);
      if (items.length === 0) warnings.push(`${feed.name}: feed parsed but contained no items`);
      const feedHost = new URL(feed.url).host;
      for (const it of items) {
        if (it.date && it.date < from) continue;
        const link = normalizeOfficialLink(it.link, feed.url, sourceId);
        records.push({
          sourceId,
          sourceName,
          title: it.title,
          authors: [],
          organization: venuePrefix ?? feed.name,
          date: it.date,
          dateType: 'announced',
          url: link,
          venue: feed.name,
          identifiers: {},
          abstract: it.description || undefined,
          evidence,
          allowedHost: sourceId === 'company' ? feedHost : undefined,
        });
      }
    } catch (err) {
      failures++;
      warnings.push(`${feed.name}: ${(err as Error).message}`);
    }
  }
  if (feeds.length > 0 && failures === feeds.length) throw new Error(`All ${sourceName} feeds failed: ${warnings.join('; ')}`);
  return { records, warnings };
}

/**
 * Resolve relative links and upgrade `http://` to `https://` ONLY for the regulator's own official hosts
 * (FDA/EMA feeds have published plain-http links to pages that are served over HTTPS). Links to any
 * other host are left untouched, so off-site or insecure links are still rejected by validation.
 */
export function normalizeOfficialLink(link: string, base: string, sourceId: SourceId): string {
  let u: URL;
  try {
    u = new URL(link, base);
  } catch {
    return link;
  }
  if (u.protocol === 'http:' && (ALLOWED_HOSTS[sourceId] ?? []).includes(u.host.toLowerCase())) u.protocol = 'https:';
  return u.toString();
}

export const fdaCollector: Collector = {
  id: 'fda',
  name: 'U.S. FDA (official RSS)',
  skipReason: (ctx) => (ctx.config.regulatoryFeeds.fda.length ? null : 'no FDA feeds configured'),
  collect: (ctx) => collectFeeds(ctx, ctx.config.regulatoryFeeds.fda, 'fda', 'U.S. FDA', 'REGULATORY UPDATE', 'U.S. Food and Drug Administration'),
};

export const emaCollector: Collector = {
  id: 'ema',
  name: 'European Medicines Agency (official RSS)',
  skipReason: (ctx) => (ctx.config.regulatoryFeeds.ema.length ? null : 'no EMA feeds configured'),
  collect: (ctx) => collectFeeds(ctx, ctx.config.regulatoryFeeds.ema, 'ema', 'EMA', 'REGULATORY UPDATE', 'European Medicines Agency'),
};

export const companyCollector: Collector = {
  id: 'company',
  name: 'Company announcements (configured feeds)',
  skipReason: (ctx) => (ctx.config.companyFeeds.length ? null : 'no company feeds configured (BIOPULSE_COMPANY_FEEDS)'),
  collect: (ctx) => collectFeeds(ctx, ctx.config.companyFeeds, 'company', 'Company feed', 'COMPANY ANNOUNCEMENT'),
};
