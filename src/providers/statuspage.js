import { fetchJson, csvList, toIso, truncate, result } from './util.js';
import { worst } from '../states.js';

const INDICATOR = {
  none: 'operational',
  minor: 'degraded',
  major: 'partial_outage',
  critical: 'major_outage',
  maintenance: 'maintenance',
};

const COMPONENT = {
  operational: 'operational',
  degraded_performance: 'degraded',
  partial_outage: 'partial_outage',
  major_outage: 'major_outage',
  under_maintenance: 'maintenance',
};

const IMPACT = { none: 'info', minor: 'minor', major: 'major', critical: 'critical', maintenance: 'maintenance' };

export default {
  id: 'statuspage',
  short: 'Statuspage.io',
  label: 'Statuspage.io (Zoom, Jamf, GitHub, Atlassian, Cloudflare, …)',
  description:
    'Any vendor page powered by Atlassian Statuspage. Enter the status page root URL; the public /api/v2/summary.json endpoint is read.',
  defaultOwner: 'vendor',
  fields: [
    { key: 'baseUrl', label: 'Status page URL', type: 'url', required: true, placeholder: 'https://status.zoom.us' },
    {
      key: 'components',
      label: 'Only these components',
      type: 'text',
      placeholder: 'Zoom Meetings, Zoom Phone',
      help: 'Optional, comma-separated component names. Leave blank to use the page-wide indicator.',
    },
  ],

  async check(service, ctx) {
    const base = String(service.config?.baseUrl || '').replace(/\/+$/, '');
    if (!base) throw new Error('Status page URL is not set');
    const data = await fetchJson(`${base}/api/v2/summary.json`, { timeoutMs: ctx.timeoutMs });

    const wanted = csvList(service.config?.components);
    const matches = (names) => !wanted.length || names.some((n) => wanted.includes(String(n).toLowerCase()));

    let incidents = (data.incidents || [])
      .filter((i) => i.status !== 'resolved' && i.status !== 'postmortem')
      .filter((i) => matches((i.components || []).map((c) => c.name)))
      .map((i) => ({
        id: i.id,
        title: i.name,
        status: i.status,
        impact: IMPACT[i.impact] || 'minor',
        url: i.shortlink || `${base}/incidents/${i.id}`,
        startedAt: toIso(i.created_at || i.started_at),
        updatedAt: toIso(i.updated_at),
        latestUpdate: truncate(i.incident_updates?.[0]?.body),
        components: (i.components || []).map((c) => c.name),
      }));

    const maintenances = (data.scheduled_maintenances || [])
      .filter((m) => m.status !== 'completed')
      .filter((m) => matches((m.components || []).map((c) => c.name)))
      .map((m) => ({
        id: m.id,
        title: m.name,
        status: m.status,
        url: m.shortlink || `${base}/incidents/${m.id}`,
        startsAt: toIso(m.scheduled_for),
        endsAt: toIso(m.scheduled_until),
      }));

    let state;
    let summary;
    if (wanted.length) {
      const comps = (data.components || []).filter((c) => wanted.includes(String(c.name).toLowerCase()));
      if (!comps.length) {
        throw new Error(`No components named "${service.config.components}" on this page`);
      }
      state = worst(comps.map((c) => COMPONENT[c.status] || 'unknown'));
      const bad = comps.filter((c) => c.status !== 'operational');
      summary = bad.length
        ? bad.map((c) => `${c.name}: ${c.status.replace(/_/g, ' ')}`).join('; ')
        : `${comps.length} component${comps.length === 1 ? '' : 's'} operational`;
    } else {
      state = INDICATOR[data.status?.indicator] || 'unknown';
      summary = data.status?.description || '';
    }
    if (incidents.length && state === 'operational') state = 'degraded';

    return result({ state, summary, incidents, maintenances });
  },
};
