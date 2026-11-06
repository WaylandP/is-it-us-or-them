import { fetchWithTimeout, result } from './util.js';

export default {
  id: 'http',
  label: 'HTTP check (ping a URL)',
  description: 'Checks a URL from this server. HTTP responses provide local observations; blocked destinations and transport failures leave health unknown.',
  defaultOwner: 'internal',
  fields: [
    { key: 'url', label: 'URL to check', type: 'url', required: true, placeholder: 'https://intranet.example.com/health' },
    { key: 'expectStatus', label: 'Expected HTTP status', type: 'number', placeholder: 'any 2xx/3xx', help: 'Optional exact status code to require.' },
    { key: 'degradedAfterMs', label: 'Degraded if slower than (ms)', type: 'number', placeholder: '3000', help: 'Optional. A successful but slow response is reported as degraded.' },
  ],
  async check(service, ctx) {
    const url = service.config?.url;
    if (!url) throw new Error('URL is not set');
    const expect = Number(service.config?.expectStatus) || 0;
    const slowMs = Number(service.config?.degradedAfterMs) || 0;
    const started = performance.now();
    // Propagate failures to the poller: a failed monitor is not proof of an outage.
    const res = await fetchWithTimeout(url, { timeoutMs: ctx.timeoutMs });
    const latencyMs = Math.round(performance.now() - started);
    const ok = expect ? res.status === expect : res.status >= 200 && res.status < 400;
    if (!ok) {
      return result({
        state: 'major_outage',
        summary: `HTTP ${res.status}${expect ? ` (expected ${expect})` : ''}`,
        incidents: [{
          id: `http-${res.status}`, title: `${service.name} returned HTTP ${res.status}`,
          status: 'detected', impact: 'critical', url: '',
          startedAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString(), latestUpdate: '', components: [],
        }],
        extra: { latencyMs },
      });
    }
    if (slowMs && latencyMs > slowMs) return result({ state: 'degraded', summary: `Slow: ${latencyMs} ms (threshold ${slowMs} ms)`, extra: { latencyMs } });
    return result({ state: 'operational', summary: `HTTP ${res.status} in ${latencyMs} ms`, extra: { latencyMs } });
  },
};
