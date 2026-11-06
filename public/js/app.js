import { STATE, SEVERITY_LABEL, esc, rich, fmtDate, fmtRange, ago, pill } from './common.js';
import { snapshotHealth, safeHref } from './snapshot-health.js';

const REFRESH_MS = 30000;
const $ = (id) => document.getElementById(id);
let snap = null;
let lastFetch = 0;
let receivedAt = 0;
let loadFailed = false;
let loading = false;
const ICON = { operational: '✓', maintenance: '🔧', degraded: '!', partial_outage: '!', major_outage: '✕', unknown: '?' };
const FAV_COLOR = { operational: '%231f9d55', maintenance: '%232f6fd6', degraded: '%23b7791f', partial_outage: '%23d9640d', major_outage: '%23d13438', unknown: '%236b7280' };
const connection = () => snapshotHealth(snap, performance.now() - receivedAt, loadFailed);

async function load() {
  if (loading) return;
  loading = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    // Public status does not need the browser's administrative bearer token.
    const res = await fetch('/api/status', { cache: 'no-store', signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = await res.json();
    if (!next?.verdict?.counts || !next?.site || !Array.isArray(next.services) || !Array.isArray(next.incidents) ||
        ![next.maintenance?.active, next.maintenance?.upcoming, next.maintenance?.vendor, next.posts?.open, next.posts?.recent].every(Array.isArray)) {
      throw new Error('Invalid status response');
    }
    snap = next;
    lastFetch = Date.now();
    receivedAt = performance.now();
    loadFailed = false;
    render();
  } catch {
    loadFailed = true;
    renderUnavailable();
  } finally {
    clearTimeout(timer);
    loading = false;
  }
}

function favicon(level) {
  $('favicon').href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='${FAV_COLOR[level] || FAV_COLOR.unknown}'/%3E%3C/svg%3E`;
}

function renderUnavailable() {
  const el = $('verdict');
  const offline = connection() === 'offline';
  el.className = 'verdict level-unknown';
  el.querySelector('.dot').textContent = '?';
  el.querySelector('h1').textContent = offline ? 'Status page unavailable' : 'Status information is stale';
  el.querySelector('.detail').textContent = snap
    ? 'Live status cannot be verified. Everything below is from the last received snapshot; previously reported issues may still be ongoing.'
    : 'Could not retrieve service health. Retrying automatically.';
  el.querySelector('.meta').textContent = snap ? `Last snapshot ${fmtDate(snap.generatedAt)}` : '';
  document.title = `Status unverified · ${snap?.site?.name || 'Is it us or them?'}`;
  favicon('unknown');
  if (snap) renderServices(true);
}

function render() {
  if (connection() !== 'current') return renderUnavailable();
  document.title = `${snap.verdict.headline} · ${snap.site.name}`;
  $('brand').textContent = snap.site.name;
  $('posts-title').textContent = `From ${snap.site.org}`;
  $('footer-note').textContent = `Checks run every ${snap.site.pollIntervalSeconds}s. Observations expire after ${snap.site.staleAfterSeconds}s. Page refreshes every ${REFRESH_MS / 1000}s.`;
  favicon(snap.verdict.level);
  renderVerdict();
  renderServices();
  renderIncidents();
  renderMaintenance();
  renderPosts();
}

function renderVerdict() {
  // A relative-time redraw must never resurrect a cached green headline.
  if (connection() !== 'current') return renderUnavailable();
  const v = snap.verdict;
  const el = $('verdict');
  el.className = `verdict level-${v.level}`;
  el.querySelector('.dot').textContent = ICON[v.level] || '?';
  el.querySelector('h1').textContent = v.headline;
  el.querySelector('.detail').textContent = v.detail;
  el.querySelector('.detail').classList.remove('muted');
  const c = v.counts;
  const bits = [`${c.total} tracked`];
  if (c.issues) bits.push(`${c.issues} with issues`);
  if (c.maintenance) bits.push(`${c.maintenance} in maintenance`);
  if (c.unknown) bits.push(`${c.unknown} unverified`);
  if (c.stale) bits.push(`${c.stale} stale`);
  el.querySelector('.meta').innerHTML = `<span>Snapshot ${esc(ago(snap.generatedAt))}</span><span>${esc(bits.join(' · '))}</span>`;
}

function renderServices(cached = false) {
  const list = snap.services;
  $('services-count').textContent = list.length ? `${list.length}` : '';
  if (!list.length) {
    $('services').innerHTML = '<p class="empty">Nothing is tracked yet. Add services on the <a href="/admin">admin page</a>.</p>';
    return;
  }
  const groups = new Map();
  for (const s of list) {
    const g = s.group || (s.owner === 'internal' ? 'Internal' : 'Vendors');
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const html = [];
  for (const [g, items] of groups) {
    html.push(`<div class="group-title">${esc(g)}</div><div class="grid">`);
    for (const s of items) html.push(serviceCard(s, cached));
    html.push('</div>');
  }
  $('services').innerHTML = html.join('');
}

function serviceCard(s, cached) {
  const href = safeHref(s.statusPageUrl);
  const name = href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>` : esc(s.name);
  let summary = s.reason ? `${s.reason.kind === 'maintenance' ? 'Our maintenance' : 'Our incident'}: ${s.reason.title}` : s.summary || '';
  if (s.reason && s.theirs) summary += ` · Vendor report: ${s.summary}`;
  if (s.error) summary += ` · Monitoring: ${s.error}`;
  if (s.reason && s.freshness !== 'fresh') summary += ` · Monitoring ${s.freshness}`;
  if (s.lastKnown) summary += ` · Last known ${STATE[s.lastKnown.state]?.label || s.lastKnown.state} ${ago(s.lastKnown.checkedAt)}`;
  if (cached) summary = `Last reported: ${s.label}. ${summary}`;
  const who = cached ? '' : s.ours && s.theirs ? '<span class="tag us">us</span> <span class="tag them">them</span>'
    : s.theirs ? '<span class="tag them">them</span>' : s.ours ? '<span class="tag us">us</span>' : '';
  const state = cached ? 'unknown' : s.state;
  const checked = s.checkedAt ? `${s.provider === 'manual' ? 'Manual state read' : 'Checked'} ${ago(s.checkedAt)}` : 'Not yet checked';
  return `<article class="card service ${esc(state)}">
    <div class="top"><span class="name">${name}</span>${pill(state, cached ? 'Cached / unverified' : s.label)}</div>
    ${s.description ? `<div class="small muted">${esc(s.description)}</div>` : ''}
    <div class="summary">${esc(summary)} ${who}</div>
    <div class="foot"><span>${esc(checked)}</span><span>${s.incidents?.length ? `${s.incidents.length} reported incident(s)` : ''}</span></div>
  </article>`;
}

function renderIncidents() {
  const ours = snap.posts.open.filter((p) => p.severity !== 'info');
  const theirs = snap.incidents;
  const total = ours.length + theirs.length;
  $('incidents-count').textContent = total ? `${total}` : '';
  if (!total) {
    $('incidents').innerHTML = `<p class="empty">${snap.verdict.counts.unknown ? 'No current incident reports. Some monitoring results are unverified.' : 'No active incidents.'}</p>`;
    return;
  }
  const html = ours.map((p) => postCard(p, { badge: 'us' }));
  for (const i of theirs) {
    const href = safeHref(i.url);
    html.push(`<article class="card item"><div class="head">
      <span class="pill plain ${esc(i.impact === 'critical' ? 'major_outage' : i.impact === 'major' ? 'partial_outage' : i.impact === 'maintenance' ? 'maintenance' : i.impact === 'info' ? 'unknown' : 'degraded')}">${esc(i.serviceName)}</span>
      <span class="tag ${i.owner === 'internal' ? 'us' : 'them'}">${i.owner === 'internal' ? 'us' : 'them'}</span>
      <span class="title">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(i.title)}</a>` : esc(i.title)}</span>
    </div>${i.latestUpdate ? `<div class="body small">${rich(i.latestUpdate)}</div>` : ''}
    <div class="when">${esc(String(i.status || '').replace(/_/g, ' '))}${i.components?.length ? ` · ${esc(i.components.slice(0, 6).join(', '))}` : ''}${i.updatedAt ? ` · updated ${esc(ago(i.updatedAt))}` : ''}</div></article>`);
  }
  $('incidents').innerHTML = html.join('');
}

function renderMaintenance() {
  const m = snap.maintenance;
  const total = m.active.length + m.upcoming.length + m.vendor.length;
  $('maintenance-count').textContent = total ? `${total}` : '';
  if (!total) {
    $('maintenance').innerHTML = '<p class="empty">No maintenance in progress or scheduled in the next two weeks.</p>';
    return;
  }
  const html = [];
  for (const w of m.active) html.push(maintCard(w, 'In progress'));
  for (const w of m.upcoming) html.push(maintCard(w, 'Upcoming'));
  for (const v of m.vendor) {
    const href = safeHref(v.url);
    html.push(`<article class="card item"><div class="head"><span class="pill maintenance">Vendor maintenance</span><span class="tag them">them</span>
      <span class="title">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(v.title)}</a>` : esc(v.title)}</span></div>
      <div class="when">${esc(v.serviceName)} · ${esc(fmtRange(v.startsAt, v.endsAt))} · ${esc(String(v.status || '').replace(/_/g, ' '))}</div></article>`);
  }
  $('maintenance').innerHTML = html.join('');
}

function maintCard(w, phase) {
  return `<article class="card item"><div class="head"><span class="pill maintenance">${esc(phase)}</span><span class="tag us">us</span><span class="title">${esc(w.title)}</span></div>
    <div class="when">${esc(fmtRange(w.startsAt, w.endsAt))}${w.serviceNames?.length ? ` · ${esc(w.serviceNames.join(', '))}` : ''}</div>
    ${w.description ? `<div class="body small">${rich(w.description)}</div>` : ''}</article>`;
}

function renderPosts() {
  const announcements = snap.posts.open.filter((p) => p.severity === 'info');
  const resolved = snap.posts.recent;
  if (!announcements.length && !resolved.length) {
    $('posts').innerHTML = '<p class="empty">No announcements right now.</p>';
    return;
  }
  const html = announcements.map((p) => postCard(p));
  if (resolved.length) html.push(`<details><summary class="muted small">Recently resolved (${resolved.length})</summary><div class="list" style="margin-top:.6rem">${resolved.map((p) => postCard(p, { resolved: true })).join('')}</div></details>`);
  $('posts').innerHTML = html.join('');
}

function postCard(p, { badge, resolved } = {}) {
  const updates = (p.updates || []).map((u) => `<div><span class="muted small">${esc(fmtDate(u.at))}</span> — ${rich(u.body)}</div>`).join('');
  return `<article class="card item"><div class="head">
    <span class="pill ${esc(resolved ? 'operational' : p.severity)}">${esc(resolved ? 'Resolved' : SEVERITY_LABEL[p.severity] || p.severity)}</span>
    ${badge ? `<span class="tag ${badge}">${badge}</span>` : ''}${p.pinned && !resolved ? '<span class="tag">pinned</span>' : ''}
    <span class="title">${esc(p.title)}</span></div>${p.body ? `<div class="body">${rich(p.body)}</div>` : ''}
    ${updates ? `<div class="timeline">${updates}</div>` : ''}
    <div class="when">${esc(fmtDate(p.createdAt))}${p.serviceNames?.length ? ` · ${esc(p.serviceNames.join(', '))}` : ''}${resolved && p.resolvedAt ? ` · resolved ${esc(fmtDate(p.resolvedAt))}` : ''}</div></article>`;
}

load();
setInterval(load, REFRESH_MS);
setInterval(() => snap && renderVerdict(), 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5000) load();
});
