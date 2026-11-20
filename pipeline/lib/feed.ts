import type { DailyDataset } from '../../shared/schema';
import { EVIDENCE } from '../../shared/evidence';

/**
 * RSS 2.0 feed of the daily briefings (newest first). Free way for readers to follow BioPulse in any
 * news reader, or by e-mail via a free RSS-to-email service. Content is the published sentence and
 * the top stories with their evidence labels and original links — nothing beyond the dataset.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Public site URL: BIOPULSE_SITE_URL, else derived from GITHUB_REPOSITORY (GitHub Pages), else relative. */
export function siteUrl(env: Record<string, string | undefined>): string {
  if (env.BIOPULSE_SITE_URL && /^https:\/\//.test(env.BIOPULSE_SITE_URL)) return env.BIOPULSE_SITE_URL.replace(/\/?$/, '/');
  const repo = env.GITHUB_REPOSITORY;
  if (repo && /^[\w.-]+\/[\w.-]+$/.test(repo)) {
    const [owner, name] = repo.split('/');
    return `https://${owner.toLowerCase()}.github.io/${name}/`;
  }
  return 'https://example.invalid/';
}

export function buildFeed(days: DailyDataset[], site: string, now: Date): string {
  const items = days
    .filter((d) => d.dataset === 'live')
    .map((d) => {
      const byId = new Map(d.records.map((r) => [r.id, r]));
      const stories = d.topDiscoveries.map((t) => byId.get(t.recordId)).filter(Boolean) as DailyDataset['records'];
      const link = `${site}#/archive/${d.date}`;
      const html = [
        `<p>${esc(d.briefing.sentence ?? 'No qualifying updates were found for this date.')}</p>`,
        stories.length ? `<ol>${stories.map((r) => `<li><a href="${esc(r.url)}">${esc(r.title)}</a> — ${esc(EVIDENCE[r.evidence].plain)} (${esc(r.source.name)})</li>`).join('')}</ol>` : '',
        `<p>${d.stats.total} new records. <a href="${esc(link)}">Read the full day on BioPulse</a>.</p>`,
      ].join('');
      return `    <item>
      <title>${esc(`BioPulse ${d.date}: ${d.briefing.sentence ? (stories[0]?.title ?? 'Daily briefing') : 'No qualifying updates'}`)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">biopulse-${d.date}</guid>
      <pubDate>${new Date(d.generatedAt).toUTCString()}</pubDate>
      <description>${esc(html)}</description>
    </item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BioPulse – Biotechnology Daily Intelligence</title>
    <link>${esc(site)}</link>
    <atom:link href="${esc(`${site}data/feed.xml`)}" rel="self" type="application/rss+xml" />
    <description>Today in biotech in one evidence-labelled sentence, with the top stories and links to every original source.</description>
    <language>en</language>
    <lastBuildDate>${now.toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}
