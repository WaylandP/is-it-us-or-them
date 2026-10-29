import { fetchJson, toIso, truncate, result } from './util.js';
import { worst } from '../states.js';

const DEFAULT_URL = 'https://slack-status.com/api/v2.0.0/current';

const TYPE_STATE = {
  outage: 'major_outage',
  incident: 'degraded',
  maintenance: 'maintenance',
  notice: 'operational',
};
const TYPE_IMPACT = { outage: 'critical', incident: 'minor', maintenance: 'maintenance', notice: 'info' };

export default {
  id: 'slack',
  label: 'Slack (slack-status.com)',
  description: 'Reads Slack’s public status API. No configuration needed.',
  defaultOwner: 'vendor',
  fields: [
    {
      key: 'apiUrl',
      label: 'API URL',
      type: 'url',
      placeholder: DEFAULT_URL,
      help: 'Leave blank for the default endpoint.',
    },
  ],

  async check(service, ctx) {
    const url = service.config?.apiUrl || DEFAULT_URL;
    const data = await fetchJson(url, { timeoutMs: ctx.timeoutMs });
    const active = (data.active_incidents || []).filter((i) => i.status !== 'ok' && i.status !== 'resolved');

    const incidents = active.map((i) => ({
      id: String(i.id),
      title: i.title,
      status: i.status || 'active',
      impact: TYPE_IMPACT[i.type] || 'minor',
      url: i.url || 'https://slack-status.com/',
      startedAt: toIso(i.date_created),
      updatedAt: toIso(i.date_updated),
      latestUpdate: truncate(i.notes?.[0]?.body),
      components: i.services || [],
    }));

    let state = data.status === 'ok' && !active.length ? 'operational' : worst(active.map((i) => TYPE_STATE[i.type] || 'degraded'));
    if (data.status !== 'ok' && state === 'operational') state = 'degraded';

    const summary = active.length
      ? active.map((i) => i.title).join('; ')
      : 'All services operational';
    return result({ state, summary, incidents });
  },
};
