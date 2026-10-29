// Tiny validation helpers. Throws HttpError(400) with a readable message.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const bad = (msg) => new HttpError(400, msg);

export function str(obj, key, { required = false, max = 500, fallback = '' } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`"${key}" is required`);
    return fallback;
  }
  if (typeof v !== 'string') throw bad(`"${key}" must be a string`);
  const t = v.trim();
  if (required && !t) throw bad(`"${key}" is required`);
  if (t.length > max) throw bad(`"${key}" must be at most ${max} characters`);
  return t;
}

export function bool(obj, key, fallback = false) {
  const v = obj?.[key];
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'on' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 'off' || v === 0 || v === '0') return false;
  throw bad(`"${key}" must be a boolean`);
}

export function int(obj, key, { fallback = 0, min = -1e9, max = 1e9 } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) throw bad(`"${key}" must be an integer`);
  if (n < min || n > max) throw bad(`"${key}" must be between ${min} and ${max}`);
  return n;
}

export function oneOf(obj, key, allowed, { required = false, fallback } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`"${key}" is required`);
    return fallback ?? allowed[0];
  }
  if (!allowed.includes(v)) throw bad(`"${key}" must be one of: ${allowed.join(', ')}`);
  return v;
}

export function isoDate(obj, key, { required = false } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null || v === '') {
    if (required) throw bad(`"${key}" is required`);
    return null;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`"${key}" must be a valid date/time`);
  return d.toISOString();
}

export function strArray(obj, key, { max = 50, itemMax = 200 } = {}) {
  const v = obj?.[key];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw bad(`"${key}" must be an array`);
  if (v.length > max) throw bad(`"${key}" may have at most ${max} items`);
  return v.map((x) => {
    if (typeof x !== 'string' || x.length > itemMax) throw bad(`"${key}" must contain short strings`);
    return x.trim();
  }).filter(Boolean);
}

export function httpUrl(obj, key, { required = false } = {}) {
  const v = str(obj, key, { required, max: 2000 });
  if (!v) return '';
  let u;
  try {
    u = new URL(v);
  } catch {
    throw bad(`"${key}" must be a valid URL`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad(`"${key}" must be an http(s) URL`);
  return u.toString().replace(/\/$/, '');
}
