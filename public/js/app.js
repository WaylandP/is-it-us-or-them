import { STATE, SEVERITY_LABEL, esc, rich, fmtDate, fmtRange, ago, pill, api } from './common.js';

const REFRESH_MS = 30000;
const $ = (id) => document.getElementById(id);
let snap = null;
let lastFetch = 0;

const ICON = { operational: '✓', maintenance: '🔧', degraded: '!', partial_outage: '!', major_outage: '✕', unknown: '?' };
const FAV_COLOR = { operational: '%231f9d55', maintenance: '%232f6fd6', degraded: '%23b7791f', partial_outage: '%23d9640d', major_outage: '%23d13438', unknown: '%236b7280' };

async function load() {
  try {
    snap = await api('/api/status');
    lastFetch = Date.now();
    render();
  } catch (err) {
    const v = $('verdict');
    v.className = 'verdict level-unknown';
    v.querySelector('h1').textContent = 'Status page unavailable';
    v.querySelector('.detail').textContent = `Could not reach the server: ${err.message}`;
  }
}

function render() {
  document.title = `${snap.verdict.headline} · ${snap.site.name}`;
  $('brand').textContent = snap.site.name;
  $('posts-title').textContent = `From ${snap.site.org}`;
  $('footer-note').textContent = `Vendor feeds are polled every ${snap.site.pollIntervalSeconds}s. This page refreshes every ${REFRESH_MS / 1000}s.`;
  $('favicon').href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='${FAV_COLOR[snap.verdict.level] || FAV_COLOR.unknown}'/%3E%3C/svg%3E`;

  renderVerdict();
  renderServices();
  renderIncidents();
  renderMaintenance();
  renderPosts();
}

function renderVerdict() {
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
  if (c.unknown) bits.push(`${c.unknown} unknown`);
  el.querySelector('.meta').innerHTML = `<span>Updated ${esc(ago(snap.generatedAt))}</span><span>${esc(bits.join(' · '))}</span>`;
}

function renderServices() {
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
    if (groups.size > 1 || g) html.push(`<div class="group-title">${esc(g)}</div>`);
    html.push('<div class="grid">');
    for (const s of items) html.push(serviceCard(s));
    html.push('</div>');
  }
  $('services').innerHTML = html.join('');
}

function serviceCard(s) {
  const name = s.statusPageUrl ? `<a href="${esc(s.statusPageUrl)}" target="_blank" rel="noopener">${esc(s.name)}</a>` : esc(s.name);
  let summary = '';
  if (s.reason) {
    summary = s.reason.kind === 'maintenance' ? `Our maintenance: ${s.reason.title}` : `Our incident: ${s.reason.title}`;
  } else if (s.error) {
    summary = `Feed unreadable: ${s.error}`;
    if (s.lastKnown) summary += ` · last known ${STATE[s.lastKnown.state]?.label.toLowerCase() || s.lastKnown.state} ${ago(s.lastKnown.checkedAt)}`;
  } else {
    summary = s.summary || '';
  }
  const who = s.theirs ? '<span class="tag them">them</span>' : s.ours ? '<span class="tag us">us</span>' : '';
  const foot = [];
  if (s.since && s.state !== 'unknown') foot.push(`${esc(STATE[s.state]?.label || s.state)} since ${esc(fmtDate(s.since))}`);
  else if (s.checkedAt) foot.push(`Checked ${esc(ago(s.checkedAt))}`);
  if (s.incidents?.length) foot.push(`${s.incidents.length} incident${s.incidents.length === 1 ? '' : 's'}`);
  return `
    <article class="card service ${esc(s.state)}">
      <div class="top"><span class="name">${name}</span>${pill(s.state, s.label)}</div>
      ${s.description ? `<div class="small muted">${esc(s.description)}</div>` : ''}
      <div class="summary">${esc(summary)} ${who}</div>
      <div class="foot"><span>${foot[0] || ''}</span><span>${foot[1] || ''}</span></div>
    </article>`;
}

function renderIncidents() {
  const ours = snap.posts.open.filter((p) => p.severity !== 'info');
  const theirs = snap.incidents;
  const total = ours.length + theirs.length;
  $('incidents-count').textContent = total ? `${total}` : '';
  if (!total) {
    $('incidents').innerHTML = '<p class="empty">No active incidents.</p>';
    return;
  }
  const html = [];
  for (const p of ours) html.push(postCard(p, { badge: 'us' }));
  for (const i of theirs) {
    html.push(`
      <article class="card item">
        <div class="head">
          <span class="pill plain ${esc(i.impact === 'critical' ? 'major_outage' : i.impact === 'major' ? 'partial_outage' : i.impact === 'maintenance' ? 'maintenance' : i.impact === 'info' ? 'unknown' : 'degraded')}">${esc(i.serviceName)}</span>
          <span class="tag ${i.owner === 'internal' ? 'us' : 'them'}">${i.owner === 'internal' ? 'us' : 'them'}</span>
          <span class="title">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}</span>
        </div>
        ${i.latestUpdate ? `<div class="body small">${rich(i.latestUpdate)}</div>` : ''}
        <div class="when">${esc(i.status.replace(/_/g, ' '))}${i.components?.length ? ` · ${esc(i.components.slice(0, 6).join(', '))}` : ''}${i.updatedAt ? ` · updated ${esc(ago(i.updatedAt))}` : ''}</div>
      </article>`);
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
    html.push(`
      <article class="card item">
        <div class="head"><span class="pill maintenance">Vendor maintenance</span><span class="tag them">them</span>
          <span class="title">${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>` : esc(v.title)}</span></div>
        <div class="when">${esc(v.serviceName)} · ${esc(fmtRange(v.startsAt, v.endsAt))} · ${esc(v.status.replace(/_/g, ' '))}</div>
      </article>`);
  }
  $('maintenance').innerHTML = html.join('');
}

function maintCard(w, phase) {
  return `
    <article class="card item">
      <div class="head"><span class="pill maintenance">${esc(phase)}</span><span class="tag us">us</span><span class="title">${esc(w.title)}</span></div>
      <div class="when">${esc(fmtRange(w.startsAt, w.endsAt))}${w.serviceNames?.length ? ` · ${esc(w.serviceNames.join(', '))}` : ''}</div>
      ${w.description ? `<div class="body small">${rich(w.description)}</div>` : ''}
    </article>`;
}

function renderPosts() {
  const announcements = snap.posts.open.filter((p) => p.severity === 'info');
  const resolved = snap.posts.recent;
  if (!announcements.length && !resolved.length) {
    $('posts').innerHTML = `<p class="empty">No announcements right now.</p>`;
    return;
  }
  const html = announcements.map((p) => postCard(p));
  if (resolved.length) {
    html.push(`<details><summary class="muted small">Recently resolved (${resolved.length})</summary><div class="list" style="margin-top:.6rem">${resolved.map((p) => postCard(p, { resolved: true })).join('')}</div></details>`);
  }
  $('posts').innerHTML = html.join('');
}

function postCard(p, { badge, resolved } = {}) {
  const updates = (p.updates || []).map((u) => `<div><span class="muted small">${esc(fmtDate(u.at))}</span> — ${rich(u.body)}</div>`).join('');
  return `
    <article class="card item">
      <div class="head">
        <span class="pill ${esc(resolved ? 'operational' : p.severity)}">${esc(resolved ? 'Resolved' : SEVERITY_LABEL[p.severity] || p.severity)}</span>
        ${badge ? `<span class="tag ${badge}">${badge}</span>` : ''}
        ${p.pinned && !resolved ? '<span class="tag">pinned</span>' : ''}
        <span class="title">${esc(p.title)}</span>
      </div>
      ${p.body ? `<div class="body">${rich(p.body)}</div>` : ''}
      ${updates ? `<div class="timeline">${updates}</div>` : ''}
      <div class="when">${esc(fmtDate(p.createdAt))}${p.serviceNames?.length ? ` · ${esc(p.serviceNames.join(', '))}` : ''}${resolved && p.resolvedAt ? ` · resolved ${esc(fmtDate(p.resolvedAt))}` : ''}</div>
    </article>`;
}

load();
setInterval(load, REFRESH_MS);
// Keep relative times fresh between fetches.
setInterval(() => snap && renderVerdict(), 10000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5000) load();
});
