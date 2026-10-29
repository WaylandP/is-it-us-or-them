// Shared helpers for the public page and the admin page.
export const STATE = {
  operational: { label: 'Operational', icon: '✓' },
  maintenance: { label: 'Under maintenance', icon: '🔧' },
  degraded: { label: 'Degraded', icon: '!' },
  partial_outage: { label: 'Partial outage', icon: '!' },
  major_outage: { label: 'Major outage', icon: '✕' },
  unknown: { label: 'Unknown', icon: '?' },
};

export const SEVERITY_LABEL = { info: 'Announcement', warning: 'Incident', critical: 'Major incident' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Escape text and turn bare URLs into links. */
export function rich(s) {
  return esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', ...opts });
}

export function fmtRange(startIso, endIso) {
  if (!startIso) return '';
  const s = new Date(startIso);
  if (!endIso) return fmtDate(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${s.toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${s.toLocaleTimeString(undefined, { timeStyle: 'short' })} – ${e.toLocaleTimeString(undefined, { timeStyle: 'short' })}`
    : `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
}

export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr} h ago`;
  const day = Math.round(hr / 24);
  return `${day} d ago`;
}

export function pill(state, text) {
  const meta = STATE[state] || STATE.unknown;
  return `<span class="pill ${esc(state)}">${esc(text || meta.label)}</span>`;
}

export function getToken() {
  try {
    return localStorage.getItem('adminToken') || '';
  } catch {
    return '';
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const t = token ?? getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
