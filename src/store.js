import fs from 'node:fs';
import path from 'node:path';
import { seedServices } from './seed.js';

/**
 * Dead-simple JSON file store. Everything lives in one document:
 *   { services: [], maintenance: [], posts: [] }
 * Writes are atomic (write temp file, rename).
 */
export class Store {
  constructor(filePath, { seed = true } = {}) {
    this.filePath = filePath;
    this.data = { services: [], maintenance: [], posts: [] };
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
}
