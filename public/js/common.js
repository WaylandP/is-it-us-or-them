// Shared helpers for the public page and the admin page.
export const STATE = {
  operational: { label: 'Operational', short: 'Operational' },
  maintenance: { label: 'Under maintenance', short: 'Maintenance' },
  degraded: { label: 'Degraded performance', short: 'Degraded' },
  partial_outage: { label: 'Partial outage', short: 'Partial outage' },
  major_outage: { label: 'Major outage', short: 'Major outage' },
  unknown: { label: 'Unknown', short: 'Unknown' },
};

export const SEVERITY_LABEL = { info: 'Announcement', warning: 'Incident', critical: 'Major incident' };

export const ICONS = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  question: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
};

export const STATE_ICON = { operational: 'check', maintenance: 'wrench', degraded: 'alert', partial_outage: 'alert', major_outage: 'x', unknown: 'question' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Escape text and turn bare URLs into links. */
export function rich(s) {
  return esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`);
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short', ...opts });
}
export function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(undefined, { timeStyle: 'short' });
}

export function fmtRange(startIso, endIso) {
  if (!startIso) return '';
  const s = new Date(startIso);
  if (!endIso) return fmtDate(startIso);
  const e = new Date(endIso);
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay ? `${s.toLocaleDateString(undefined, { dateStyle: 'medium' })}, ${fmtTime(startIso)} – ${fmtTime(endIso)}` : `${fmtDate(startIso)} – ${fmtDate(endIso)}`;
}

export function ago(iso, now = Date.now()) {
  if (!iso) return '';
  const sec = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 36) return `${hr} h ago`;
  return `${Math.round(hr / 24)} d ago`;
}

/** "2 h 15 m" style duration since an ISO time. */
export function durationSince(iso, now = Date.now()) {
  if (!iso) return '';
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (min < 1) return 'less than a minute';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export function durationUntil(iso, now = Date.now()) {
  return durationSince(new Date(2 * now - new Date(iso).getTime()).toISOString(), now);
}

export function pill(state, text) {
  const meta = STATE[state] || STATE.unknown;
  return `<span class="pill ${esc(state)}">${esc(text || meta.label)}</span>`;
}

/**
 * Render a history bar. `slots` is an array of states or null (no data).
 * `merge` combines every N slots into one (worst state wins) for compact bars.
 */
export function bar(timeline, { merge = 1, large = false } = {}) {
  if (!timeline) return '';
  const order = { unknown: 0, operational: 1, maintenance: 2, degraded: 3, partial_outage: 4, major_outage: 5 };
  const slots = [];
  for (let i = 0; i < timeline.slots.length; i += merge) {
    const group = timeline.slots.slice(i, i + merge).filter(Boolean);
    slots.push(group.length ? group.reduce((a, b) => (order[b] > order[a] ? b : a)) : null);
  }
  const from = new Date(timeline.from).getTime();
  const step = (new Date(timeline.to).getTime() - from) / slots.length;
  const cells = slots
    .map((s, i) => {
      const t0 = new Date(from + i * step);
      const t1 = new Date(from + (i + 1) * step);
      const label = `${fmtTime(t0.toISOString())}–${fmtTime(t1.toISOString())}: ${s ? STATE[s].label : 'no data'}`;
      return `<i class="${esc(s || '')}" title="${esc(label)}"></i>`;
    })
    .join('');
  return `<div class="bar${large ? ' lg' : ''}" role="img" aria-label="Status over the last 24 hours">${cells}</div>`;
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

// ---- theme ------------------------------------------------------------
const THEMES = ['auto', 'light', 'dark'];
export function currentTheme() {
  try {
    return localStorage.getItem('theme') || 'auto';
  } catch {
    return 'auto';
  }
}
export function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
  try {
    localStorage.setItem('theme', next);
  } catch {
    /* ignore */
  }
  applyTheme(next);
  return next;
}

// ---- toast -------------------------------------------------------------
let toastTimer = null;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
