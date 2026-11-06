import { getProvider } from './providers/index.js';
import { isState } from './states.js';
import { describeError } from './providers/util.js';

const fingerprint = (s) => JSON.stringify([s.provider, s.config, s.enabled, s.updatedAt]);

/** In-memory observations; configuration generations prevent late results winning. */
export class Poller {
  constructor(store, { intervalSeconds = 60, timeoutMs = 10000, log = console, clock = () => new Date() } = {}) {
    this.store = store;
    this.intervalMs = intervalSeconds * 1000;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this.clock = clock;
    this.statuses = new Map();
    this.statusKeys = new Map();
    this.generations = new Map();
    this.timer = null;
    this.inFlight = new Map();
  }
  start() {
    if (this.timer) return;
    const run = () => this.pollAll().catch((err) => this.log.warn?.(`[poll] ${describeError(err)}`));
    run();
    this.timer = setInterval(run, this.intervalMs);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.generations.clear();
    this.inFlight.clear();
  }
  status(serviceId) { return this.statuses.get(serviceId) || null; }
  forget(serviceId) {
    this.statuses.delete(serviceId);
    this.statusKeys.delete(serviceId);
    this.generations.delete(serviceId);
    this.inFlight.delete(serviceId);
  }
  async pollAll() {
    const services = this.store.list('services').filter((s) => s.enabled !== false);
    await Promise.all(services.map((s) => this.poll(s)));
    const ids = new Set(this.store.list('services').filter((s) => s.enabled !== false).map((s) => s.id));
    for (const id of this.statuses.keys()) if (!ids.has(id)) this.forget(id);
  }
  async check(service, now = this.clock()) {
    const provider = getProvider(service.provider);
    if (!provider) throw new Error(`Unknown provider "${service.provider}"`);
    const started = performance.now();
    const res = await provider.check(service, { timeoutMs: this.timeoutMs, now });
    if (!res || typeof res !== 'object') throw new Error('Provider returned an invalid result');
    const state = isState(res.state) ? res.state : 'unknown';
    const checkedAt = this.clock().toISOString();
    return {
      ...res, state, checkStartedAt: now.toISOString(), checkedAt,
      lastSuccessfulAt: state !== 'unknown' && !res.error ? checkedAt : null,
      latencyMs: res.latencyMs ?? Math.round(performance.now() - started), error: res.error || null,
    };
  }
  async poll(service) {
    if (service.enabled === false) { this.forget(service.id); return null; }
    const input = structuredClone(service);
    const key = fingerprint(input);
    const active = this.inFlight.get(input.id);
    if (active?.key === key && this.generations.get(input.id) === active.generation) return active.promise;
    if (this.statusKeys.get(input.id) !== key) this.statuses.delete(input.id);
    const generation = Symbol(input.id);
    this.generations.set(input.id, generation);
    const entry = { key, generation };
    entry.promise = this._poll(input, key, generation).finally(() => {
      if (this.inFlight.get(input.id) === entry) this.inFlight.delete(input.id);
    });
    this.inFlight.set(input.id, entry);
    return entry.promise;
  }
  async _poll(service, key, generation) {
    const prev = this.statuses.get(service.id);
    let next;
    try { next = await this.check(service); }
    catch (err) {
      const message = describeError(err);
      this.log.warn?.(`[poll] ${service.name}: ${message}`);
      next = {
        state: 'unknown', summary: `Monitoring check failed: ${message}`,
        incidents: [], maintenances: [], checkedAt: this.clock().toISOString(), latencyMs: null,
        error: message, errorCode: typeof err.code === 'string' ? err.code : 'CHECK_FAILED',
      };
    }
    if (next.state === 'unknown' || next.error) {
      next.lastKnown = prev && !prev.error && prev.state !== 'unknown'
        ? { state: prev.state, checkedAt: prev.checkedAt, summary: prev.summary || '' } : prev?.lastKnown || null;
      next.lastSuccessfulAt = prev?.lastSuccessfulAt || next.lastKnown?.checkedAt || null;
    }
    next.since = prev && prev.state === next.state ? prev.since : next.checkedAt;
    const current = this.store.list('services').find((s) => s.id === service.id);
    if (this.generations.get(service.id) !== generation || !current || current.enabled === false || fingerprint(current) !== key) return next;
    if (prev && prev.state !== next.state) this.log.info?.(`[poll] ${service.name}: ${prev.state} -> ${next.state}`);
    this.statuses.set(service.id, next);
    this.statusKeys.set(service.id, key);
    return next;
  }
}
