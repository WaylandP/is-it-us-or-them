import { fetchText, toIso, truncate, stripHtml, result } from './util.js';

/**
 * Minimal RSS 2.0 / Atom item extractor. We deliberately avoid a full XML
 * parser: status feeds are simple and this keeps the project dependency-free.
 */
export function parseFeedItems(xml) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const tag = (name) => {
      const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
      if (!m) return '';
      return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
    };
    let link = tag('link');
    if (!link) {
      const m = block.match(/<link\b[^>]*href=["']([^"']+)["']/i);
      link = m ? m[1] : '';
    }
    items.push({
      title: stripHtml(tag('title')),
      link,
      publishedAt: toIso(tag('pubDate') || tag('published') || tag('updated') || tag('dc:date')),
      description: truncate(stripHtml(tag('description') || tag('summary') || tag('content'))),
    });
  }
  return items;
}

export default {
  id: 'rss',
  short: 'RSS / Atom',
  label: 'RSS / Atom feed',
  description:
    'For vendors that only publish an RSS or Atom status feed. Any item published within the window is shown as an active incident and marks the service degraded. Heuristic, but better than nothing.',
  defaultOwner: 'vendor',
  fields: [
    { key: 'feedUrl', label: 'Feed URL', type: 'url', required: true, placeholder: 'https://status.example.com/history.rss' },
    {
      key: 'windowHours',
      label: 'Recent window (hours)',
      type: 'number',
      placeholder: '24',
      help: 'Items newer than this count as active. Default 24.',
    },
  ],

  async check(service, ctx) {
    const url = service.config?.feedUrl;
    if (!url) throw new Error('Feed URL is not set');
    const hours = Number(service.config?.windowHours) || 24;
    const xml = await fetchText(url, { timeoutMs: ctx.timeoutMs });
    const items = parseFeedItems(xml);
    if (!items.length && !/<(rss|feed)\b/i.test(xml)) throw new Error('Response does not look like an RSS/Atom feed');

    const cutoff = ctx.now.getTime() - hours * 3600 * 1000;
    const recent = items.filter((i) => i.publishedAt && new Date(i.publishedAt).getTime() >= cutoff);

    const incidents = recent.map((i, idx) => ({
      id: i.link || `${idx}`,
      title: i.title || 'Feed item',
      status: 'posted',
      impact: 'minor',
      url: i.link,
      startedAt: i.publishedAt,
      updatedAt: i.publishedAt,
      latestUpdate: i.description,
      components: [],
    }));

    return result({
      state: recent.length ? 'degraded' : 'operational',
      summary: recent.length
        ? `${recent.length} update${recent.length === 1 ? '' : 's'} in the last ${hours}h`
        : `No updates in the last ${hours}h`,
      incidents,
    });
  },
};
