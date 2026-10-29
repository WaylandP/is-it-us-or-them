import { fetchJson, csvList, toIso, truncate, stripHtml, result } from './util.js';
import { worst } from '../states.js';

const DEFAULT_URL = 'https://www.google.com/appsstatus/dashboard/incidents.json';

const IMPACT_STATE = {
  SERVICE_OUTAGE: 'major_outage',
  SERVICE_DISRUPTION: 'degraded',
  SERVICE_INFORMATION: 'operational',
};
const IMPACT_LABEL = { SERVICE_OUTAGE: 'critical', SERVICE_DISRUPTION: 'minor', SERVICE_INFORMATION: 'info' };

export default {
  id: 'google',
  label: 'Google Workspace / Google Cloud status dashboard',
  description:
    'Reads the incidents.json feed behind the Google Workspace Status Dashboard (or Google Cloud’s, same format). Optionally filter to the products you care about.',
  defaultOwner: 'vendor',
  fields: [
    {
      key: 'feedUrl',
      label: 'Feed URL',
      type: 'url',
      placeholder: DEFAULT_URL,
      help: 'Default is Google Workspace. For Google Cloud use https://status.cloud.google.com/incidents.json',
    },
    {
      key: 'products',
      label: 'Only these products',
      type: 'text',
      placeholder: 'Gmail, Google Meet, Google Drive, Google Calendar',
      help: 'Optional, comma-separated product names as shown on the dashboard. Blank tracks everything.',
    },
  ],

  async check(service, ctx) {
    const url = service.config?.feedUrl || DEFAULT_URL;
    const data = await fetchJson(url, { timeoutMs: ctx.timeoutMs });
    if (!Array.isArray(data)) throw new Error('Unexpected feed format (expected an array of incidents)');

    const dashboardBase = new URL('./', url).toString();
    const wanted = csvList(service.config?.products);
    const matches = (inc) => {
      if (!wanted.length) return true;
      const names = [inc.service_name, ...(inc.affected_products || []).map((p) => p.title)]
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      return names.some((n) => wanted.includes(n));
    };

    const open = data.filter((i) => !i.end).filter(matches);

    const incidents = open.map((i) => ({
      id: String(i.id || i.number),
      title: stripHtml(i.external_desc || i.most_recent_update?.text || 'Incident'),
      status: (i.most_recent_update?.status || 'ACTIVE').toLowerCase(),
      impact: IMPACT_LABEL[i.status_impact] || 'minor',
      url: i.uri ? new URL(i.uri, dashboardBase).toString() : dashboardBase,
      startedAt: toIso(i.begin || i.created),
      updatedAt: toIso(i.modified || i.most_recent_update?.modified),
      latestUpdate: truncate(stripHtml(i.most_recent_update?.text)),
      components: (i.affected_products || []).map((p) => p.title).filter(Boolean),
    }));

    const state = open.length ? worst(open.map((i) => IMPACT_STATE[i.status_impact] || 'degraded')) : 'operational';
    const affected = [...new Set(incidents.flatMap((i) => i.components))];
    const summary = open.length
      ? `${open.length} open incident${open.length === 1 ? '' : 's'}${affected.length ? ` affecting ${affected.slice(0, 5).join(', ')}` : ''}`
      : 'No open incidents';

    return result({ state, summary, incidents });
  },
};
