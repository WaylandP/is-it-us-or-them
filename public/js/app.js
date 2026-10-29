import { STATE, STATE_ICON, ICONS, SEVERITY_LABEL, esc, rich, fmtDate, fmtRange, ago, durationSince, durationUntil, pill, bar, api, cycleTheme, currentTheme, toast, copyText } from './common.js';

const POLL_FALLBACK_MS = 60000;
const $ = (id) => document.getElementById(id);
const ISSUE = new Set(['degraded', 'partial_outage', 'major_outage']);
const SEV_ORDER = { major_outage: 0, partial_outage: 1, degraded: 2, maintenance: 3, unknown: 4, operational: 5 };
const FAV = { operational: '%2316a34a', maintenance: '%232563eb', degraded: '%23d97706', partial_outage: '%23ea580c', major_outage: '%23dc2626', unknown: '%238b94a3' };

let snap = null;
let lastFetch = 0;
const expanded = new Set();
let query = new URLSearchParams(location.search).get('q') || '';

// ---------------------------------------------------------------- data
async function load() {
  try {
    snap = await api('/api/status');
    lastFetch = Date.now();
    render();
  } catch (err) {
    if (!snap) {
      $('headline').textContent = 'Status page unavailable';
      $('detail').textContent = `Could not reach the server: ${err.message}`;
    }
  }
}

function connectStream() {
  if (!('EventSource' in window)) return;
  const live = $('live');
  const es = new EventSource('/api/stream');
  es.addEventListener('snapshot', (e) => {
    snap = JSON.parse(e.data);
    lastFetch = Date.now();
    live.className = 'live on';
    $('live-text').textContent = 'Live';
    render();
  });
  es.onerror = () => {
    live.className = 'live off';
    $('live-text').textContent = 'Reconnecting…';
  };
}

// ---------------------------------------------------------------- render
function render() {
  const v = snap.verdict;
  document.title = `${v.headline} · ${snap.site.name}`;
  $('brand').textContent = snap.site.name;
  $('posts-title').textContent = `From ${snap.site.org}`;
  $('footer-note').textContent = `Feeds polled every ${snap.site.pollIntervalSeconds}s.`;
  $('favicon').href = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='14' fill='${FAV[v.level] || FAV.unknown}'/%3E%3C/svg%3E`;
  $('badge').src = `/badge.svg?t=${Date.now()}`;

  renderHero();
  renderColumns();
  renderIncidents();
  renderMaintenance();
  renderPosts();
  applyQuery();
}

function usThem() {
  const us = snap.services.filter((s) => s.ours);
  const them = snap.services.filter((s) => s.theirs);
  const ids = new Set(snap.services.map((s) => s.id));
  const generalPosts = snap.posts.open.filter((p) => p.severity !== 'info' && !p.services.some((id) => ids.has(id)));
  const generalMaint = snap.maintenance.active.filter((m) => !m.services.some((id) => ids.has(id)));
  return { us, them, generalPosts, generalMaint };
}

function renderHero() {
  const v = snap.verdict;
  const hero = $('hero');
  hero.className = `hero level-${v.level}`;
  $('hero-icon').innerHTML = ICONS[STATE_ICON[v.level] || 'question'];
  $('headline').textContent = v.headline;
  $('detail').textContent = v.detail;

  const { generalPosts, generalMaint } = usThem();
  const us = tally(snap.services.filter((s) => s.ours), { extraIssues: generalPosts.length, extraMaint: generalMaint.length });
  const them = tally(snap.services.filter((s) => s.theirs));
  const chip = (k, t) => `<span class="chip"><span class="chip-k">${k}</span>${esc(t)}</span>`;
  $('chips').innerHTML = [
    chip('Us', tallyLabel(us)),
    chip('Them', tallyLabel(them)),
    `<span class="chip subtle">Updated <span data-ago="${esc(snap.generatedAt)}">${esc(ago(snap.generatedAt))}</span></span>`,
  ].join('');
}

/** Count issues / maintenance among rows, plus incidents and windows not tied to a service. */
function tally(rows, { extraIssues = 0, extraMaint = 0 } = {}) {
  return {
    issues: rows.filter((r) => ISSUE.has(r.state)).length + extraIssues,
    maint: rows.filter((r) => r.state === 'maintenance').length + extraMaint,
    unknown: rows.filter((r) => r.state === 'unknown').length,
    worst: rows.reduce((w, r) => (SEV_ORDER[r.state] < SEV_ORDER[w] ? r.state : w), extraIssues ? 'degraded' : extraMaint ? 'maintenance' : 'operational'),
  };
}

function tallyLabel(t) {
  const parts = [];
  if (t.issues) parts.push(`${t.issues} issue${t.issues === 1 ? '' : 's'}`);
  if (t.maint) parts.push(`${t.maint} in maintenance`);
  return parts.join(' · ') || 'All good';
}

function columnState(rows, { extraIssues = 0, extraMaint = 0, oursInColumn = 0 } = {}) {
  if (!rows.length && !extraIssues && !extraMaint && !oursInColumn) return ['unknown', 'Nothing tracked'];
  const t = tally(rows, { extraIssues, extraMaint });
  if (!t.issues && !t.maint && rows.length && t.unknown === rows.length) return ['unknown', 'Unknown'];
  let label = tallyLabel(t);
  if (oursInColumn) label += ` · ${oursInColumn} ours`;
  return [t.worst, label];
}

function renderColumns() {
  const { generalPosts, generalMaint } = usThem();
  const internal = snap.services.filter((s) => s.owner === 'internal');
  const vendors = snap.services.filter((s) => s.owner !== 'internal');

  const [usState, usLabel] = columnState(internal, { extraIssues: generalPosts.length, extraMaint: generalMaint.length });
  $('col-us-state').className = `col-state ${usState}`;
  $('col-us-state').innerHTML = `<span class="dot ${usState}"></span>${esc(usLabel)}`;
  // Vendor services that are currently "ours" (our incident or maintenance) are flagged, not counted against the vendor.
  const [themState, themLabel] = columnState(vendors.filter((s) => !s.ours), { oursInColumn: vendors.filter((s) => s.ours).length });
  $('col-them-state').className = `col-state ${themState}`;
  $('col-them-state').innerHTML = `<span class="dot ${themState}"></span>${esc(themLabel)}`;

  const general = [
    ...generalPosts.map((p) => `<a class="callout us" href="#incidents" style="display:block;margin:0.7rem 1.1rem 0">Open incident: <b>${esc(p.title)}</b></a>`),
    ...generalMaint.map((m) => `<a class="callout maint" href="#maintenance" style="display:block;margin:0.7rem 1.1rem 0">Maintenance in progress: <b>${esc(m.title)}</b></a>`),
  ].join('');

  $('col-us-body').innerHTML =
    general +
    (internal.length
      ? groupRows(internal, 'Internal')
      : `<p class="empty-col">No internal systems are tracked yet. Add the VPN, Wi-Fi, printers or your intranet from the <a href="/admin">admin page</a> so outages on your side show up here.</p>`);
  $('col-them-body').innerHTML = vendors.length
    ? groupRows(vendors, 'Vendors')
    : `<p class="empty-col">No vendors are tracked yet. Add Google, Slack, Zoom, Jamf and friends from the <a href="/admin">admin page</a>.</p>`;
}

function groupRows(list, defaultGroup) {
  const groups = new Map();
  for (const s of list) {
    const g = s.group || defaultGroup;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(s);
  }
  const showLabels = groups.size > 1 || (groups.size === 1 && ![defaultGroup, ''].includes([...groups.keys()][0]));
  const html = [];
  for (const [g, items] of groups) {
    if (showLabels) html.push(`<div class="group-label">${esc(g)}</div>`);
    for (const s of items) html.push(serviceRow(s));
  }
  return html.join('');
}

function summaryFor(s) {
  if (s.reason) return s.reason.kind === 'maintenance' ? `Our maintenance: ${s.reason.title}` : `Our incident: ${s.reason.title}`;
  if (s.error) return `Feed unreadable${s.lastKnown ? ` · last known ${STATE[s.lastKnown.state]?.short.toLowerCase()} ${ago(s.lastKnown.checkedAt)}` : ''}`;
  if (s.state === 'operational' && s.incidents.length === 0) return s.summary && !/^operational$/i.test(s.summary) ? s.summary : 'No issues reported';
  return s.summary || STATE[s.state]?.label || '';
}

function serviceRow(s) {
  const open = expanded.has(s.id);
  const issue = ISSUE.has(s.state);
  const reasonTag = s.reason ? `<span class="tag us">${s.reason.kind === 'maintenance' ? 'maintenance' : 'our incident'}</span>` : '';
  return `
    <div class="svc" data-id="${esc(s.id)}" data-search="${esc(`${s.name} ${s.group} ${s.description}`.toLowerCase())}">
      <button class="svc-row" aria-expanded="${open}" aria-controls="d-${esc(s.id)}">
        <span class="dot ${esc(s.state)}${issue ? ' pulse' : ''}"></span>
        <span class="svc-text">
          <span class="svc-name"><span>${esc(s.name)}</span>${reasonTag}</span>
          <span class="svc-summary">${esc(summaryFor(s))}</span>
        </span>
        ${bar(s.timeline, { merge: 2 })}
        <span class="state-text ${esc(s.state)}">${esc(STATE[s.state]?.short || s.state)}</span>
        ${ICONS.chevron}
      </button>
      <div class="svc-detail" id="d-${esc(s.id)}" ${open ? '' : 'hidden'}>${open ? serviceDetail(s) : ''}</div>
    </div>`;
}

function serviceDetail(s) {
  const meta = [];
  if (s.since && s.state !== 'unknown') meta.push(`<span><b>${esc(STATE[s.state].label)}</b> for ${esc(durationSince(s.since))} (since ${esc(fmtDate(s.since))})</span>`);
  if (s.checkedAt) meta.push(`<span>Checked <span data-ago="${esc(s.checkedAt)}">${esc(ago(s.checkedAt))}</span></span>`);
  if (s.availability24h !== null && s.availability24h !== undefined) meta.push(`<span><b>${s.availability24h}%</b> of the last 24 h without issues</span>`);
  if (s.latencyMs != null && s.provider === 'http') meta.push(`<span>${s.latencyMs} ms</span>`);
  if (s.statusPageUrl) meta.push(`<a href="${esc(s.statusPageUrl)}" target="_blank" rel="noopener">Vendor status page ${ICONS.external}</a>`);

  const blocks = [];
  if (s.description) blocks.push(`<p class="small muted">${esc(s.description)}</p>`);
  blocks.push(`<div class="meta">${meta.join('')}</div>`);
  blocks.push(`<div>${bar(s.timeline, { large: true })}<div class="bar-labels"><span>24 h ago</span><span>Now</span></div></div>`);

  if (s.reason) {
    const href = s.reason.kind === 'maintenance' ? '#maintenance' : '#incidents';
    blocks.push(`<a class="callout us" href="${href}">${s.reason.kind === 'maintenance' ? 'Scheduled maintenance by us' : 'Internal incident'}: <b>${esc(s.reason.title)}</b>${s.vendorState !== s.state ? ` · vendor reports ${esc(STATE[s.vendorState]?.label.toLowerCase())}` : ''}</a>`);
  }
  if (s.error) blocks.push(`<div class="callout err">Could not read the status feed: ${esc(s.error)}</div>`);

  if (s.incidents.length) {
    blocks.push(`<div class="detail-block"><h4>${s.owner === 'internal' ? 'Detected' : 'Reported by the vendor'}</h4>${s.incidents.map(incidentLine).join('')}</div>`);
  }
  if (s.vendorMaintenance.length) {
    blocks.push(`<div class="detail-block"><h4>Vendor maintenance</h4>${s.vendorMaintenance
      .map((m) => `<div class="inc maintenance"><span class="inc-title">${m.url ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title)}</a>` : esc(m.title)}</span><span class="inc-meta">${esc(fmtRange(m.startsAt, m.endsAt))} · ${esc(m.status.replace(/_/g, ' '))}</span></div>`)
      .join('')}</div>`);
  }
  return blocks.join('');
}

function incidentLine(i) {
  return `<div class="inc ${esc(i.impact)}">
    <span class="inc-title">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}</span>
    ${i.latestUpdate ? `<span>${rich(i.latestUpdate)}</span>` : ''}
    <span class="inc-meta">${esc(i.status.replace(/_/g, ' '))}${i.components?.length ? ` · ${esc(i.components.slice(0, 5).join(', '))}` : ''}${i.updatedAt ? ` · updated <span data-ago="${esc(i.updatedAt)}">${esc(ago(i.updatedAt))}</span>` : ''}</span>
  </div>`;
}

// ---------------------------------------------------------------- sections
const IMPACT_SEV = { critical: 0, major: 1, minor: 2, maintenance: 3, info: 4 };
const POST_SEV = { critical: 0, warning: 2 };

function renderIncidents() {
  const ours = snap.posts.open.filter((p) => p.severity !== 'info').map((p) => ({ kind: 'post', sev: POST_SEV[p.severity], p }));
  const theirs = snap.incidents.map((i) => ({ kind: 'vendor', sev: IMPACT_SEV[i.impact] ?? 2, i }));
  const all = [...ours, ...theirs].sort((a, b) => a.sev - b.sev);
  $('incidents-count').textContent = all.length || '';
  $('incidents-count').hidden = !all.length;
  if (!all.length) {
    $('incidents-list').innerHTML = `<div class="card empty">No active incidents. ${snap.services.length ? 'Nice.' : ''}</div>`;
    return;
  }
  $('incidents-list').innerHTML = all.map((x) => (x.kind === 'post' ? postCard(x.p, { who: 'us' }) : vendorIncidentCard(x.i))).join('');
}

function vendorIncidentCard(i) {
  const who = i.owner === 'internal' ? 'us' : 'them';
  return `<article class="card event sev-${esc(i.impact)}">
    <div class="event-icon ${who}">${ICONS.alert}</div>
    <div class="event-main">
      <div class="event-head"><span class="tag ${who}">${who}</span><span class="pill plain">${esc(i.serviceName)}</span><span class="event-title">${i.url ? `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)}</a>` : esc(i.title)}</span></div>
      ${i.latestUpdate ? `<div class="event-body">${rich(i.latestUpdate)}</div>` : ''}
      <div class="event-meta"><span>${esc(i.status.replace(/_/g, ' '))}</span>${i.components?.length ? `<span>${esc(i.components.slice(0, 6).join(', '))}</span>` : ''}${i.startedAt ? `<span>started <span data-ago="${esc(i.startedAt)}">${esc(ago(i.startedAt))}</span></span>` : ''}${i.updatedAt ? `<span>updated <span data-ago="${esc(i.updatedAt)}">${esc(ago(i.updatedAt))}</span></span>` : ''}</div>
    </div>
  </article>`;
}

function postCard(p, { who, resolved } = {}) {
  const sev = resolved ? 'resolved' : p.severity;
  const icon = resolved ? ICONS.check : p.severity === 'info' ? ICONS.megaphone : ICONS.alert;
  const iconCls = resolved ? 'ok' : p.severity === 'info' ? 'info' : 'us';
  const updates = (p.updates || []).map((u) => `<div><time>${esc(fmtDate(u.at))}</time>${rich(u.body)}</div>`).join('');
  return `<article class="card event sev-${esc(sev)}">
    <div class="event-icon ${iconCls}">${icon}</div>
    <div class="event-main">
      <div class="event-head">
        ${who ? `<span class="tag ${who}">${who}</span>` : ''}
        <span class="pill ${esc(resolved ? 'operational' : p.severity)}">${esc(resolved ? 'Resolved' : SEVERITY_LABEL[p.severity] || p.severity)}</span>
        ${p.pinned && !resolved ? '<span class="tag">pinned</span>' : ''}
        <span class="event-title">${esc(p.title)}</span>
      </div>
      ${p.body ? `<div class="event-body">${rich(p.body)}</div>` : ''}
      ${updates ? `<div class="timeline">${updates}</div>` : ''}
      <div class="event-meta"><span>${esc(fmtDate(p.createdAt))}</span>${p.serviceNames?.length ? `<span>${esc(p.serviceNames.join(', '))}</span>` : ''}${resolved && p.resolvedAt ? `<span>resolved ${esc(fmtDate(p.resolvedAt))}</span>` : ''}</div>
    </div>
  </article>`;
}

function dateTile(iso, cls = '') {
  const d = new Date(iso);
  return `<div class="date-tile ${cls}"><span class="m">${esc(d.toLocaleString(undefined, { month: 'short' }))}</span><span class="d">${d.getDate()}</span></div>`;
}

function renderMaintenance() {
  const m = snap.maintenance;
  const total = m.active.length + m.upcoming.length + m.vendor.length;
  $('maintenance-count').textContent = total || '';
  $('maintenance-count').hidden = !total;
  if (!total) {
    $('maintenance-list').innerHTML = '<div class="card empty">Nothing in progress and nothing scheduled for the next two weeks.</div>';
    return;
  }
  const ours = (w, phase) => `<article class="card maint">
      ${dateTile(w.startsAt, phase === 'active' ? 'now' : '')}
      <div class="event-main">
        <div class="event-head"><span class="pill maintenance">${phase === 'active' ? 'In progress' : 'Scheduled'}</span><span class="tag us">us</span><span class="event-title">${esc(w.title)}</span></div>
        <div class="event-meta"><span>${esc(fmtRange(w.startsAt, w.endsAt))}</span>${w.serviceNames?.length ? `<span>${esc(w.serviceNames.join(', '))}</span>` : ''}${phase === 'active' && w.endsAt ? `<span>ends in ${esc(durationUntil(w.endsAt))}</span>` : ''}</div>
        ${w.description ? `<div class="event-body">${rich(w.description)}</div>` : ''}
      </div>
    </article>`;
  const theirs = (v) => `<article class="card maint">
      ${dateTile(v.startsAt, 'them')}
      <div class="event-main">
        <div class="event-head"><span class="pill maintenance">Vendor maintenance</span><span class="tag them">them</span><span class="event-title">${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a>` : esc(v.title)}</span></div>
        <div class="event-meta"><span>${esc(v.serviceName)}</span><span>${esc(fmtRange(v.startsAt, v.endsAt))}</span><span>${esc(v.status.replace(/_/g, ' '))}</span></div>
      </div>
    </article>`;
  $('maintenance-list').innerHTML = [...m.active.map((w) => ours(w, 'active')), ...m.upcoming.map((w) => ours(w, 'upcoming')), ...m.vendor.map(theirs)].join('');
}

function renderPosts() {
  const announcements = snap.posts.open.filter((p) => p.severity === 'info');
  const resolved = snap.posts.recent;
  const html = announcements.map((p) => postCard(p));
  if (!announcements.length) html.push('<div class="card empty">No announcements right now.</div>');
  if (resolved.length) {
    html.push(`<details class="resolved"><summary>Recently resolved (${resolved.length})</summary><div class="stack">${resolved.map((p) => postCard(p, { resolved: true })).join('')}</div></details>`);
  }
  $('posts-list').innerHTML = html.join('');
}

// ---------------------------------------------------------------- "Is ___ down?"
function applyQuery() {
  const q = query.trim().toLowerCase();
  const rows = [...document.querySelectorAll('.svc')];
  if (!q) {
    rows.forEach((r) => r.classList.remove('dim', 'hit'));
    $('ask-answer').innerHTML = '';
    return;
  }
  const hits = [];
  for (const r of rows) {
    const hit = r.dataset.search.includes(q);
    r.classList.toggle('hit', hit);
    r.classList.toggle('dim', !hit);
    if (hit) hits.push(snap.services.find((s) => s.id === r.dataset.id));
  }
  if (!hits.length) {
    $('ask-answer').innerHTML = `Nothing tracked matches “${esc(query.trim())}”. If it should be, tell ${esc(snap.site.org)}.`;
    return;
  }
  $('ask-answer').innerHTML = hits.slice(0, 4).map(answerFor).join('<br>');
}

function answerFor(s) {
  const name = `<strong>${esc(s.name)}</strong>`;
  if (s.reason?.kind === 'maintenance') return `${name}: under maintenance by us (${esc(s.reason.title)}). That's us, not them.`;
  if (s.reason) return `${name}: ${esc(STATE[s.state].label.toLowerCase())}, caused on our side (${esc(s.reason.title)}).`;
  if (ISSUE.has(s.state)) {
    const who = s.owner === 'internal' ? "That's us." : "That's them, not us.";
    return `${name}: ${esc(STATE[s.state].label.toLowerCase())} for ${esc(durationSince(s.since))}. ${who}`;
  }
  if (s.state === 'maintenance') return `${name}: under maintenance.`;
  if (s.state === 'unknown') return `${name}: we can't read its status feed right now${s.lastKnown ? `; it was ${esc(STATE[s.lastKnown.state].label.toLowerCase())} ${esc(ago(s.lastKnown.checkedAt))}` : ''}.`;
  return `${name}: up and running. ✓`;
}

// ---------------------------------------------------------------- events
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.svc-row');
  if (!btn) return;
  const svc = btn.closest('.svc');
  const id = svc.dataset.id;
  const s = snap.services.find((x) => x.id === id);
  const detail = svc.querySelector('.svc-detail');
  if (expanded.has(id)) {
    expanded.delete(id);
    btn.setAttribute('aria-expanded', 'false');
    detail.hidden = true;
  } else {
    expanded.add(id);
    btn.setAttribute('aria-expanded', 'true');
    detail.innerHTML = serviceDetail(s);
    detail.hidden = false;
  }
});

$('q').value = query;
$('q').addEventListener('input', (e) => {
  query = e.target.value;
  const url = new URL(location.href);
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  history.replaceState(null, '', url);
  if (snap) applyQuery();
});
$('ask').addEventListener('submit', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) {
    e.preventDefault();
    $('q').focus();
    $('q').select();
  } else if (e.key === 'Escape' && document.activeElement === $('q')) {
    $('q').value = '';
    $('q').dispatchEvent(new Event('input'));
    $('q').blur();
  }
});

$('copy-icon').innerHTML = ICONS.copy;
$('copy-brief').addEventListener('click', async () => {
  try {
    const text = await fetch('/api/status.txt').then((r) => r.text());
    toast((await copyText(text)) ? 'Summary copied. Paste it into chat.' : 'Could not copy.');
  } catch {
    toast('Could not fetch the summary.');
  }
});

$('theme-icon').innerHTML = ICONS.theme;
$('theme').addEventListener('click', () => toast(`Theme: ${cycleTheme()}`));
$('theme').title = `Theme: ${currentTheme()} (click to change)`;

// Keep relative times fresh without re-rendering everything.
setInterval(() => {
  const now = Date.now();
  document.querySelectorAll('[data-ago]').forEach((el) => {
    el.textContent = ago(el.dataset.ago, now);
  });
}, 15000);

load();
connectStream();
setInterval(() => Date.now() - lastFetch > POLL_FALLBACK_MS - 1000 && load(), POLL_FALLBACK_MS);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - lastFetch > 5000) load();
});
