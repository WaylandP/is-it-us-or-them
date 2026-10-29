import { EventEmitter } from 'node:events';
import { getProvider } from './providers/index.js';
import { isState } from './states.js';
import { describeError } from './providers/util.js';

/**
 * Polls every enabled service on an interval and keeps the latest normalized
 * status in memory. Statuses are not persisted: a restart simply re-polls.
 */
export class Poller extends EventEmitter {
  constructor(store, { intervalSeconds = 60, timeoutMs = 10000, log = console } = {}) {
    super();
    this.setMaxListeners(0);
    this.store = store;
    this.intervalMs = intervalSeconds * 1000;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.statuses = new Map(); // service.id -> status
    this.timer = null;
    this.inFlight = new Map();
  }

  start() {
    if (this.timer) return;
    this.pollAll();
    this.timer = setInterval(() => this.pollAll(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(serviceId) {
    return this.statuses.get(serviceId) || null;
  }

  forget(serviceId) {
    this.statuses.delete(serviceId);
  }

  async pollAll() {
    const services = this.store.list('services').filter((s) => s.enabled !== false);
    await Promise.all(services.map((s) => this.poll(s)));
    // Drop statuses for services that no longer exist.
    const ids = new Set(this.store.list('services').map((s) => s.id));
    for (const id of this.statuses.keys()) if (!ids.has(id)) this.statuses.delete(id);
    this.emit('poll');
  }

  /** Run a provider check for a service object (saved or not) without storing it. */
  async check(service, now = new Date()) {
    const provider = getProvider(service.provider);
    if (!provider) throw new Error(`Unknown provider "${service.provider}"`);
    const started = Date.now();
    const res = await provider.check(service, { timeoutMs: this.timeoutMs, now });
    if (!isState(res.state)) res.state = 'unknown';
    return { ...res, checkedAt: now.toISOString(), latencyMs: res.latencyMs ?? Date.now() - started, error: null };
  }

  async poll(service) {
    if (this.inFlight.has(service.id)) return this.inFlight.get(service.id);
    const p = this._poll(service).finally(() => this.inFlight.delete(service.id));
    this.inFlight.set(service.id, p);
    return p;
  }

  async _poll(service) {
    const prev = this.statuses.get(service.id);
    let next;
    try {
      next = await this.check(service);
    } catch (err) {
      const message = describeError(err);
      this.log.warn?.(`[poll] ${service.name}: ${message}`);
      next = {
        state: 'unknown',
        summary: `Could not read status feed: ${message}`,
        incidents: [],
        maintenances: [],
        checkedAt: new Date().toISOString(),
        latencyMs: null,
        error: message,
        // Keep the last known-good state visible so a flaky feed doesn't blank the page.
        lastKnown: prev?.error ? prev.lastKnown : prev ? { state: prev.state, checkedAt: prev.checkedAt } : null,
      };
    }
    if (prev && prev.state !== next.state) {
      this.log.info?.(`[poll] ${service.name}: ${prev.state} -> ${next.state}`);
    }
    // History collapses repeated states, so this is a no-op unless the state changed
    // (or this is the first observation since the process started).
    const entry = this.store.appendHistory(service.id, next.state, next.checkedAt);
    next.since = entry?.at || next.checkedAt;
    this.statuses.set(service.id, next);
    if (!prev || prev.state !== next.state) this.emit('poll');
    return next;
  }
}
