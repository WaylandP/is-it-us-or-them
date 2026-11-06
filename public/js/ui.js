import { esc, STATE } from './common.js';
import { safeHref } from './snapshot-health.js';

// Original, dependency-free line icons. Labels carry meaning; SVGs are decorative.
const paths = {
  check: '<path d="m5 12 4 4L19 6"/>',
  alert: '<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 3v.1"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 11-1l3 3M4 15l3 3a7 7 0 0 0 11-1"/>',
  external: '<path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  server: '<rect x="3" y="3" width="18" height="7" rx="2"/><rect x="3" y="14" width="18" height="7" rx="2"/><path d="M7 6.5h.1M7 17.5h.1M11 6.5h6M11 17.5h6"/>',
  cloud: '<path d="M6 18a5 5 0 0 1-1-9 7 7 0 0 1 13-1 5 5 0 0 1 0 10H6Z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-14 4h3m4 0h3"/>',
  note: '<path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V10l-7-7Z"/><path d="M14 3v7h7M7 14h10M7 17h6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m8 5 7 7-7 7"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  pin: '<path d="m8 3 8 0-1 7 4 4H5l4-4-1-7Zm4 11v7"/>',
  signal: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};
export function icon(name, cls = '') {
  return `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.help}</svg>`;
}
const stateIcon = { operational: 'check', maintenance: 'calendar', degraded: 'alert', partial_outage: 'alert', major_outage: 'close', unknown: 'help', info: 'note', warning: 'alert', critical: 'close' };
export function badge(state, label) {
  const key = Object.hasOwn(stateIcon, state) ? state : 'unknown';
  return `<span class="status-badge ${key}">${icon(stateIcon[key])}${esc(label || STATE[key]?.label || key)}</span>`;
}
export function initials(name) {
  return String(name || '?').trim().split(/\s+/u).slice(0, 2).map((s) => Array.from(s)[0]).join('').toUpperCase();
}
export function externalLink(url, label, cls = '') {
  const href = safeHref(url);
  return href ? `<a class="${esc(cls)}" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}${icon('external')}<span class="sr-only"> (opens in a new tab)</span></a>` : esc(label);
}
export function filterServices(services, query = '', filter = 'all', cached = false) {
  const q = query.trim().toLocaleLowerCase();
  return services.filter((s) => (!q || [s.name, s.group, s.description].some((v) => String(v || '').toLocaleLowerCase().includes(q))) &&
    (filter === 'all' || (filter === 'attention' ? cached || s.state !== 'operational' || s.freshness !== 'fresh' : s.owner === filter)));
}
export function postKind(post) { return post.severity === 'info' ? 'announcement' : 'incident'; }
export function maintenancePhase(m, now = Date.now()) {
  if (['cancelled', 'completed'].includes(m.status)) return m.status;
  const start = Date.parse(m.startsAt);
  const end = m.endsAt ? Date.parse(m.endsAt) : start + 3600000;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unknown';
  if (m.status === 'in_progress') return now > end + 86400000 ? 'completed' : 'active';
  return now < start ? 'upcoming' : now <= end ? 'active' : 'completed';
}
export function emptyState(title, description, symbol = 'check') {
  return `<div class="empty-state"><span class="empty-icon">${icon(symbol)}</span><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></div>`;
}
/** Preserve disclosure and keyboard context when background data replaces a list. */
export function updateRegion(element, html) {
  const open = new Set([...element.querySelectorAll('details[open][data-key]')].map((e) => e.dataset.key));
  const active = document.activeElement;
  const focus = element.contains(active) ? active?.dataset.focusKey : null;
  element.innerHTML = html;
  for (const detail of element.querySelectorAll('details[data-key]')) detail.open = open.has(detail.dataset.key);
  if (focus) [...element.querySelectorAll('[data-focus-key]')].find((e) => e.dataset.focusKey === focus)?.focus({ preventScroll: true });
}
export function announce(element, message) {
  if (element.textContent !== message) element.textContent = message;
}
