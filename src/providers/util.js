import { CheckError, safeCheckRequest } from '../check-network.js';

// All provider traffic shares one destination policy and bounded transport.
export const fetchWithTimeout = safeCheckRequest;

export async function fetchJson(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from status endpoint`);
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Response from status endpoint was not JSON'); }
}

export async function fetchText(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from status endpoint`);
  return res.text();
}

export function csvList(s) {
  return String(s || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
}
export function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
export function stripHtml(s) {
  return String(s || '')
    .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th|blockquote)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
}
export function truncate(s, n = 300) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
export function result({ state = 'unknown', summary = '', incidents = [], maintenances = [], extra = {} }) {
  return { state, summary, incidents, maintenances, ...extra };
}

/** Do not disclose URL credentials, query strings or resolved addresses in errors. */
export function describeError(err) {
  if (!err) return 'unknown error';
  if (err instanceof CheckError) return err.message;
  const code = err.code || err.cause?.code;
  if (typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code)) return `Monitoring request failed (${code})`;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Monitoring request timed out';
  return truncate(String(err.message || 'Monitoring check failed').replace(/https?:\/\/\S+/gi, '[endpoint]'), 300);
}
