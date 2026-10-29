const UA = 'is-it-us-or-them/0.1 (+https://github.com/WaylandP/is-it-us-or-them)';

export async function fetchWithTimeout(url, { timeoutMs = 10000, headers = {}, method = 'GET' } = {}) {
  const res = await fetch(url, {
    method,
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': UA, accept: 'application/json, text/xml, application/xml, */*', ...headers },
  });
  return res;
}

export async function fetchJson(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Response from ${new URL(url).host} was not JSON`);
  }
}

export async function fetchText(url, opts) {
  const res = await fetchWithTimeout(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  return res.text();
}

/** Split "A, B, C" into lowercase trimmed names. */
export function csvList(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

export function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function stripHtml(s) {
  return String(s || '')
    .replace(/<\/?(p|br|div|li|ul|ol|h[1-6]|tr|td|th|blockquote)\b[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s, n = 300) {
  s = String(s || '');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Build a normalized status result. */
export function result({ state = 'unknown', summary = '', incidents = [], maintenances = [], extra = {} }) {
  return { state, summary, incidents, maintenances, ...extra };
}

/** Human-readable reason from a fetch/provider error. */
export function describeError(err) {
  if (!err) return 'unknown error';
  if (err.name === 'TimeoutError') return 'timed out';
  const cause = err.cause;
  const detail = cause?.code || cause?.message;
  return detail && !String(err.message).includes(detail) ? `${err.message} (${detail})` : err.message || String(err);
}
