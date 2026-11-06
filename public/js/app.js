import { STATE, esc, rich, fmtDate, fmtRange, ago } from './common.js';
import { snapshotHealth } from './snapshot-health.js';
import { icon, badge, initials, externalLink, filterServices, emptyState, updateRegion, announce } from './ui.js';

const $ = (id) => document.getElementById(id);
const REFRESH_MS = 30000;
let snap = null;
let receivedAt = 0;
let lastFetch = 0;
let loadFailed = false;
let loading = false;
let paused = false;
let filter = 'all';
let lastHealth = 'loading';
const health = () => snapshotHealth(snap, performance.now() - receivedAt, loadFailed);
const validDate = (s) => Number.isFinite(Date.parse(s));
const date = (s) => validDate(s) ? fmtDate(s) : 'Time not available';
const relative = (s) => validDate(s) ? ago(s) : 'Time not available';
const time = (s) => `<time${validDate(s) ? ` datetime="${esc(s)}"` : ''} title="${esc(date(s))}">${esc(relative(s))}</time>`;
const statusIcon = { operational: 'check', maintenance: 'calendar', degraded: 'alert', partial_outage: 'alert', major_outage: 'close', unknown: 'help' };

async function load(manual = false) {
  if (loading) return;
  loading = true;
  $('refresh-status').disabled = true;
  $('refresh-status').textContent = 'Refreshing…';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch('/api/status', { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = await res.json();
    if (!next?.verdict?.counts || !next?.site || !Array.isArray(next.services) || !Array.isArray(next.incidents) ||
        ![next.maintenance?.active, next.maintenance?.upcoming, next.maintenance?.vendor, next.posts?.open, next.posts?.recent].every(Array.isArray)) throw new Error('Invalid snapshot');
    snap = next;
    lastFetch = Date.now();
    receivedAt = performance.now();
    loadFailed = false;
  } catch { loadFailed = true; }
  finally {
    clearTimeout(timer);
    loading = false;
    $('refresh-status').disabled = false;
    $('refresh-status').innerHTML = `${icon('refresh')} Refresh status`;
    render();
    if (manual && health() === 'current') announce($('status-live'), `Status refreshed. ${snap.verdict.headline} ${snap.verdict.detail}`);
  }
}

function render() {
  const state = health();
  const cached = state !== 'current';
  lastHealth = state;
  renderVerdict();
  if (!snap) {
    updateRegion($('services'), emptyState('Service health is unavailable', 'No data has been received. Use Refresh status to try again.', 'help'));
    updateRegion($('incidents'), emptyState('Incident reports are unavailable', 'We cannot confirm whether there are active incidents.', 'help'));
    $('maintenance').textContent = 'Schedule unavailable until a connection is established.';
    $('posts').textContent = 'Announcements unavailable until a connection is established.';
    return;
  }
  $('brand').textContent = snap.site.name;
  $('posts-title').textContent = `From ${snap.site.org}`;
  $('monitoring-cadence').textContent = `Checks every ${snap.site.pollIntervalSeconds}s. Observations expire after ${snap.site.staleAfterSeconds}s. Page refreshes every 30s unless paused.`;
  $('incidents-cached').hidden = !cached;
  $('maintenance-cached').hidden = !cached;
  renderServices(cached);
  renderIncidents(cached);
  renderMaintenance(cached);
  renderPosts(cached);
}

function renderVerdict() {
  const state = health();
  const cached = state !== 'current';
  const v = snap?.verdict;
  const level = cached ? 'unknown' : Object.hasOwn(statusIcon, v.level) ? v.level : 'unknown';
  const headline = cached ? state === 'offline' ? 'Live status unavailable.' : 'Status information is stale.' : v.headline;
  const detail = cached ? snap ? 'The connection cannot verify current health. Reports below are cached; previously reported issues may still be ongoing.' : 'Could not retrieve service health. Retrying automatically; you can also refresh now.' : v.detail;
  $('verdict').className = `verdict level-${level}`;
  $('verdict').setAttribute('aria-busy', 'false');
  $('verdict-symbol').innerHTML = icon(statusIcon[level]);
  $('verdict-title').textContent = headline;
  $('verdict-detail').textContent = detail;
  $('verdict-meta').textContent = snap ? `${cached ? 'Last received snapshot' : 'Snapshot'}: ${date(snap.generatedAt)} · ${snap.services.length} monitored services` : 'No status snapshot received.';
  $('connection-label').textContent = state === 'current' ? 'Status page connected' : state === 'offline' ? 'Connection unavailable' : 'Fresh data needed';
  document.title = `${headline} · ${snap?.site.name || 'Is it us or them?'}`;
  const colors = { operational: '17653f', maintenance: '2855a1', degraded: '865000', partial_outage: '983817', major_outage: 'ab2639', unknown: '526172' };
  $('favicon').href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='2' y='2' width='28' height='28' rx='8' fill='%23${colors[level]}'/%3E%3C/svg%3E`;
  const services = snap?.services || [];
  const group = (owner) => {
    const rows = services.filter((s) => s.owner === owner);
    const uncertain = rows.filter((s) => s.freshness !== 'fresh');
    const affected = services.filter((s) => owner === 'internal' ? s.ours : s.theirs);
    const tracked = new Set(services.map((s) => s.id));
    const general = owner === 'internal' && snap ? [...snap.posts.open.filter((p) => p.severity !== 'info'), ...snap.maintenance.active].filter((p) => !(p.services || []).some((id) => tracked.has(id))).length : 0;
    const signals = affected.length + general;
    const label = cached ? 'Not currently verified' : signals ? `${signals} active signal${signals === 1 ? '' : 's'}` : !rows.length ? 'Not monitored' : uncertain.length ? `${uncertain.length} unverified check${uncertain.length === 1 ? '' : 's'}` : rows.some((s) => s.state === 'maintenance') ? 'Maintenance reported' : 'No reported issues';
    return `<div><span class="metric-label">${icon(owner === 'internal' ? 'server' : 'cloud')}${owner === 'internal' ? 'Internal systems' : 'External providers'}</span><strong>${label}</strong><span class="metric-detail">${rows.length} service${rows.length === 1 ? '' : 's'} monitored</span></div>`;
  };
  const fresh = cached ? 0 : services.filter((s) => s.freshness === 'fresh').length;
  $('signal-strip').innerHTML = `${group('internal')}${group('vendor')}<div><span class="metric-label">${icon('signal')}Monitoring coverage</span><strong>${cached ? 'Data is unverified' : `${fresh} of ${services.length} checks current`}</strong><span class="metric-detail">${cached ? 'Refresh to verify service health' : services.length - fresh ? `${services.length - fresh} ${services.length - fresh === 1 ? 'needs' : 'need'} verification` : 'Fresh observations, not an uptime guarantee'}</span></div>`;
  announce($('status-live'), `${headline} ${detail}`);
}

function serviceRow(s, cached) {
  const state = cached ? 'unknown' : s.state;
  const label = cached ? 'Cached / unverified' : s.freshness === 'stale' && s.state === 'unknown' ? 'Stale / unverified' : s.label;
  const checked = s.checkedAt ? `${s.provider === 'manual' ? 'Manual state read' : 'Checked'} ${relative(s.checkedAt)}` : 'Not yet checked';
  const context = s.description || `${s.owner === 'internal' ? 'Internal system' : 'External provider'} · ${s.provider === 'manual' ? 'IT-declared status' : 'Automated check'}`;
  const ownership = s.ours && s.theirs ? 'Internal and vendor signals' : s.ours ? 'Internal signal' : s.theirs ? 'Vendor signal' : '';
  return `<details class="service-row" data-key="service-${esc(s.id)}"><summary data-focus-key="service-${esc(s.id)}"><span class="service-avatar" aria-hidden="true">${esc(initials(s.name))}</span><span><span class="service-name">${esc(s.name)}</span><span class="service-context">${esc(context)}</span></span><span class="service-status">${badge(state, label)}<span class="service-context">${esc(checked)}</span></span>${icon('chevron', 'service-chevron')}<span class="sr-only">Details for ${esc(s.name)}</span></summary>
    <div class="service-detail">${cached ? `<p><strong>Cached observation:</strong> last reported ${esc(s.label)}. Current health is unverified.</p>` : ''}
      ${ownership ? `<p><strong>${cached ? 'Previously reported: ' : ''}${ownership}</strong></p>` : ''}
      ${s.reason ? `<p><strong>${s.reason.kind === 'maintenance' ? 'IT maintenance' : 'IT incident'}:</strong> ${esc(s.reason.title)}</p>` : ''}
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
      ${s.error ? `<p><strong>Monitoring:</strong> ${esc(s.error)}</p>` : ''}
      <p class="fact">Check status: ${esc(cached ? 'cached / unverified' : s.freshness || 'unknown')} · Last check: ${esc(s.checkedAt ? date(s.checkedAt) : 'Not yet checked')}</p>
      ${s.lastKnown ? `<p class="fact">Last known ${esc(STATE[s.lastKnown.state]?.label || s.lastKnown.state)} · ${esc(date(s.lastKnown.checkedAt))}. Historical context, not current confirmation.</p>` : ''}
      ${s.statusPageUrl ? externalLink(s.statusPageUrl, 'Open status source') : ''}
    </div></details>`;
}
function renderServices(cached) {
  $('services-count').textContent = snap.services.length;
  const list = filterServices(snap.services, $('service-search').value, filter, cached);
  announce($('filter-result'), `${list.length} of ${snap.services.length} services shown${cached ? ' · Cached information' : ''}. Expand a service for details.`);
  if (!snap.services.length) {
    updateRegion($('services'), `${emptyState('Your first service starts here', 'Add a vendor feed or an internal check from administration.', 'server')}<a class="button secondary" href="/admin#services">Set up monitoring ${icon('arrow')}</a>`);
    return;
  }
  if (!list.length) {
    updateRegion($('services'), `${emptyState('No services match', 'Try another name or clear the current filters.', 'search')}<button class="button secondary" type="button" id="clear-filters">Clear filters</button>`);
    return;
  }
  const groups = new Map();
  for (const s of list) {
    const name = s.group || (s.owner === 'internal' ? 'Internal systems' : 'External providers');
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(s);
  }
  updateRegion($('services'), [...groups].map(([name, items]) => `<section class="service-group" aria-label="${esc(name)}"><div class="group-heading"><h3>${esc(name)}</h3><span>${items.length} service${items.length === 1 ? '' : 's'}</span></div>${items.map((s) => serviceRow(s, cached)).join('')}</section>`).join(''));
}

function postCard(p, { resolved = false, cached = false } = {}) {
  const latest = p.updates?.[0];
  return `<article class="incident-card ${resolved ? 'resolved' : p.severity === 'critical' ? 'critical' : ''}"><div class="incident-meta">${badge(resolved ? 'operational' : p.severity, resolved ? 'Resolved' : p.severity === 'critical' ? 'Major incident' : 'Incident')}<span class="owner-label">${icon('server')}${cached ? 'Cached IT report' : 'Internal · IT report'}</span>${time(p.updatedAt || p.createdAt)}</div><h3>${esc(p.title)}</h3><p class="body">${rich(latest?.body || p.body || 'An incident has been reported by IT.')}</p><div class="incident-footer"><span>${esc(p.serviceNames?.join(', ') || 'General IT incident')}</span>${resolved ? `<span>Resolved ${esc(date(p.resolvedAt))}</span>` : ''}</div>
    <details data-key="post-${esc(p.id)}"><summary data-focus-key="post-${esc(p.id)}">Incident details${p.updates?.length ? ` and ${p.updates.length} update${p.updates.length === 1 ? '' : 's'}` : ''}</summary>${latest && p.body ? `<p class="body">${rich(p.body)}</p>` : ''}<ol class="timeline">${(p.updates || []).map((u) => `<li>${time(u.at)}<p>${rich(u.body)}</p></li>`).join('')}<li>${time(p.createdAt)}<p>Incident opened by IT.</p></li></ol></details></article>`;
}
function renderIncidents(cached) {
  const ours = snap.posts.open.filter((p) => p.severity !== 'info').sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'));
  $('incidents-count').textContent = ours.length + snap.incidents.length;
  const html = ours.map((p) => postCard(p, { cached }));
  for (const i of snap.incidents) {
    const severity = i.impact === 'critical' ? 'critical' : 'warning';
    html.push(`<article class="incident-card ${severity}"><div class="incident-meta">${badge(severity, i.impact === 'critical' ? 'Major incident' : 'Incident')}<span class="owner-label">${icon(i.owner === 'internal' ? 'server' : 'cloud')}${cached ? 'Cached · ' : ''}${i.owner === 'internal' ? 'Internal observation' : 'Vendor report'}</span>${time(i.updatedAt)}</div><h3>${esc(i.title)}</h3><p class="body">${rich(i.latestUpdate || 'The provider has reported an incident. Review its status source for details.')}</p><div class="incident-footer"><span>${esc(i.serviceName)} · ${esc(String(i.status || 'reported').replace(/_/g, ' '))}</span>${externalLink(i.url, 'View source update')}</div></article>`);
  }
  updateRegion($('incidents'), html.join('') || emptyState(cached ? 'No incidents in the cached snapshot' : 'No current incident reports', cached || snap.verdict.counts.unknown ? 'Some health information is unverified. This is not an all-clear confirmation.' : 'No incidents reported for your monitored services.', cached || snap.verdict.counts.unknown ? 'help' : 'check'));
}
function renderMaintenance(cached) {
  const list = [...snap.maintenance.active.map((m) => ({ ...m, phase: 'In progress' })), ...snap.maintenance.upcoming.map((m) => ({ ...m, phase: 'Scheduled' })), ...snap.maintenance.vendor.map((m) => ({ ...m, vendor: true, phase: String(m.status || 'reported').replace(/_/g, ' ') }))];
  $('maintenance-count').textContent = list.length;
  updateRegion($('maintenance'), list.map((m) => `<article class="maintenance-item">${badge('maintenance', `${cached ? 'Cached · ' : ''}${m.phase}`)}<h3>${esc(m.title)}</h3><p>${esc(m.serviceNames?.join(', ') || m.serviceName || 'General IT maintenance')}</p><p class="when">${esc(validDate(m.startsAt) ? fmtRange(m.startsAt, validDate(m.endsAt) ? m.endsAt : null) : 'Time not supplied')}</p>${m.description ? `<details data-key="maintenance-${esc(m.id)}"><summary data-focus-key="maintenance-${esc(m.id)}">Work details</summary><p>${rich(m.description)}</p></details>` : ''}${m.vendor ? `<div class="small">${externalLink(m.url, 'Vendor schedule')}</div>` : ''}</article>`).join('') || emptyState('No scheduled work', cached ? 'No maintenance was listed in the cached snapshot.' : 'Nothing active or scheduled in the next 14 days.', 'calendar'));
}
function renderPosts(cached) {
  const list = snap.posts.open.filter((p) => p.severity === 'info');
  updateRegion($('posts'), list.map((p) => `<article class="note-item"><span class="owner-label">${icon(p.pinned ? 'pin' : 'note')}${p.pinned ? 'Pinned announcement' : 'IT announcement'}${cached ? ' · Cached' : ''}</span><h3>${esc(p.title)}</h3><p>${rich(p.body)}</p>${time(p.updatedAt || p.createdAt)}</article>`).join('') || emptyState('You’re up to date', cached ? 'No announcements were in the cached snapshot.' : 'No announcements to share right now.', 'note'));
  const resolved = snap.posts.recent.filter((p) => p.severity !== 'info');
  $('resolved-section').hidden = !resolved.length;
  $('resolved-count').textContent = resolved.length;
  updateRegion($('resolved'), resolved.map((p) => postCard(p, { resolved: true, cached })).join(''));
}

$('refresh-status').addEventListener('click', () => load(true));
$('service-search').addEventListener('input', () => snap && renderServices(health() !== 'current'));
for (const btn of document.querySelectorAll('[data-filter]')) btn.addEventListener('click', () => {
  filter = btn.dataset.filter;
  for (const item of document.querySelectorAll('[data-filter]')) item.setAttribute('aria-pressed', String(item === btn));
  if (snap) renderServices(health() !== 'current');
});
$('services').addEventListener('click', (e) => {
  if (!e.target.closest('#clear-filters')) return;
  $('service-search').value = '';
  document.querySelector('[data-filter="all"]').click();
  $('service-search').focus();
});
$('auto-refresh').addEventListener('click', () => {
  paused = !paused;
  $('auto-refresh').setAttribute('aria-pressed', String(!paused));
  $('auto-refresh').textContent = `Auto-refresh ${paused ? 'paused' : 'on'}`;
  announce($('status-live'), paused ? 'Automatic refresh paused. Observations will still expire; refresh manually to verify health.' : 'Automatic refresh resumed.');
  if (!paused) load();
});
load();
setInterval(() => { if (!paused && document.visibilityState === 'visible') load(); }, REFRESH_MS);
// Expiry still applies while auto-refresh is paused. No cached green resurrection.
setInterval(() => { if (snap && health() !== lastHealth) render(); }, 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (snap && health() !== lastHealth) render();
  if (!paused && Date.now() - lastFetch > 5000) load();
});
