import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { seedServices } from './seed.js';

const HISTORY_DAYS = 90;
const HISTORY_MAX_PER_SERVICE = 2000;

/**
 * Dead-simple JSON file store. Everything lives in one document:
 *   { services: [], maintenance: [], posts: [], history: [] }
 * Writes are atomic (write temp file, rename). Emits 'change' after every save.
 */
export class Store extends EventEmitter {
  constructor(filePath, { seed = true } = {}) {
    super();
    this.setMaxListeners(0);
    this.filePath = filePath;
    this.data = { services: [], maintenance: [], posts: [], history: [] };
    this.load(seed);
  }

  load(seed) {
    if (fs.existsSync(this.filePath)) {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      this.data = {
        services: Array.isArray(parsed.services) ? parsed.services : [],
        maintenance: Array.isArray(parsed.maintenance) ? parsed.maintenance : [],
        posts: Array.isArray(parsed.posts) ? parsed.posts : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
      return;
    }
    if (seed) this.data.services = seedServices();
    this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
    this.emit('change');
  }

  // ---- generic collection helpers -------------------------------------
  list(col) {
    return this.data[col];
  }

  get(col, id) {
    return this.data[col].find((x) => x.id === id) || null;
  }

  insert(col, item) {
    this.data[col].push(item);
    this.save();
    return item;
  }

  update(col, id, patch) {
    const idx = this.data[col].findIndex((x) => x.id === id);
    if (idx === -1) return null;
    const next = { ...this.data[col][idx], ...patch, id, updatedAt: new Date().toISOString() };
    this.data[col][idx] = next;
    this.save();
    return next;
  }

  remove(col, id) {
    const before = this.data[col].length;
    this.data[col] = this.data[col].filter((x) => x.id !== id);
    if (this.data[col].length === before) return false;
    this.save();
    return true;
  }

  /** Set `order` on items of a collection to match the position of their id in `ids`. */
  reorder(col, ids) {
    const pos = new Map(ids.map((id, i) => [id, i]));
    const now = new Date().toISOString();
    let changed = false;
    for (const item of this.data[col]) {
      if (pos.has(item.id) && item.order !== pos.get(item.id)) {
        item.order = pos.get(item.id);
        item.updatedAt = now;
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  // ---- status history --------------------------------------------------
  /** Record a state change. Consecutive identical states collapse into one entry. */
  appendHistory(serviceId, state, at = new Date().toISOString()) {
    const h = this.data.history;
    let last = null;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].serviceId === serviceId) {
        last = h[i];
        break;
      }
    }
    if (last && last.state === state) return last;
    const entry = { serviceId, state, at };
    h.push(entry);
    this.pruneHistory();
    this.save();
    return entry;
  }

  historyFor(serviceId) {
    return this.data.history.filter((e) => e.serviceId === serviceId);
  }

  removeHistory(serviceId) {
    const before = this.data.history.length;
    this.data.history = this.data.history.filter((e) => e.serviceId !== serviceId);
    if (this.data.history.length !== before) this.save();
  }

  /**
   * Drop entries older than HISTORY_DAYS, keeping the newest entry before the
   * cutoff for each service so the state at the cutoff is still known.
   */
  pruneHistory(now = Date.now()) {
    const cutoff = now - HISTORY_DAYS * 86400e3;
    const keepBefore = new Map(); // serviceId -> newest old entry
    const perService = new Map();
    for (const e of this.data.history) {
      const t = new Date(e.at).getTime();
      if (t < cutoff) {
        const cur = keepBefore.get(e.serviceId);
        if (!cur || new Date(cur.at).getTime() < t) keepBefore.set(e.serviceId, e);
      }
      perService.set(e.serviceId, (perService.get(e.serviceId) || 0) + 1);
    }
    const kept = this.data.history.filter((e) => new Date(e.at).getTime() >= cutoff || keepBefore.get(e.serviceId) === e);
    // Hard cap per service, oldest first out.
    const counts = new Map();
    for (const e of kept) counts.set(e.serviceId, (counts.get(e.serviceId) || 0) + 1);
    const over = new Map([...counts].filter(([, n]) => n > HISTORY_MAX_PER_SERVICE).map(([id, n]) => [id, n - HISTORY_MAX_PER_SERVICE]));
    this.data.history = over.size
      ? kept.filter((e) => {
          const n = over.get(e.serviceId);
          if (!n) return true;
          over.set(e.serviceId, n - 1);
          return false;
        })
      : kept;
  }
}
