import { STATE, esc, fmtDate, fmtRange, ago, getToken } from './common.js';
import { snapshotHealth } from './snapshot-health.js';
import { icon, badge, postKind, maintenancePhase, emptyState, updateRegion } from './ui.js';

const $ = (id) => document.getElementById(id);
let token = getToken();
let providers = [], services = [], maintenance = [], posts = [];
let snapshot = null, receivedAt = 0, refreshFailed = false, refreshing = false;
let activeTab = 'services', session = 0, editor = null, dialogBusy = false;
let refreshTail = Promise.resolve();
const pending = new Set();
const endpoint = (kind, id) => `/api/${kind}/${encodeURIComponent(id)}`;
const isCurrent = () => snapshotHealth(snapshot, performance.now() - receivedAt, refreshFailed) === 'current';
const date = (s) => Number.isFinite(Date.parse(s)) ? fmtDate(s) : 'Time not supplied';
const names = (ids = []) => ids.map((id) => services.find((s) => s.id === id)?.name || 'Removed service').join(', ');

async function request(path, { method = 'GET', body, auth = token } = {}) {
  const controller = new AbortController();
  pending.add(controller);
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(path, { method, cache: 'no-store', signal: controller.signal,
      headers: { accept: 'application/json', authorization: `Bearer ${auth}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body) });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.error || `Request failed (HTTP ${res.status}).`);
      error.status = res.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out or was cancelled. Check the page before retrying a write.');
    throw error;
  } finally { clearTimeout(timeout); pending.delete(controller); }
}
function feedback(message, error = false) {
  $('admin-feedback').hidden = false;
  $('admin-feedback').className = `notice ${error ? 'error' : 'success'}`;
  $('admin-feedback').textContent = message;
}
function signOut(message = '') {
  session++;
  token = '';
  for (const c of pending) c.abort();
  try { localStorage.removeItem('adminToken'); } catch { /* No persistence available. */ }
  if ($('dialog').open) $('dialog').close();
  if ($('confirm-dialog').open) $('confirm-dialog').close();
  $('admin').hidden = true;
  $('gate').hidden = false;
  $('signout').hidden = true;
  $('gate-error').textContent = message;
  $('token').value = '';
  $('token').focus();
}
async function signIn(value) {
  $('gate-submit').disabled = true;
  $('gate-submit').textContent = 'Checking access…';
  $('gate-error').textContent = '';
  try {
    await request('/api/admin/whoami', { auth: value });
    token = value;
    session++;
    try { localStorage.setItem('adminToken', value); } catch { /* This session still works. */ }
    $('token').value = '';
    $('gate').hidden = true;
    $('admin').hidden = false;
    $('signout').hidden = false;
    selectTab(location.hash.slice(1));
    await refreshAll();
    $('tab-button-' + activeTab).focus();
  } catch (error) {
    $('gate-error').textContent = error.status === 401 ? 'That token was not accepted. Check your deployment configuration.' : 'Cannot reach administration. Check the connection and try again.';
    if (error.status === 401) { try { localStorage.removeItem('adminToken'); } catch { /* Optional storage. */ } token = ''; }
  } finally {
    $('gate-submit').disabled = false;
    $('gate-submit').textContent = 'Sign in to administration →';
  }
}
$('gate-form').addEventListener('submit', (e) => { e.preventDefault(); signIn($('token').value.trim()); });
$('signout').addEventListener('click', () => signOut());
$('admin-refresh').addEventListener('click', () => refreshAll(true));

function selectTab(name, focus = false) {
  const allowed = ['services', 'incidents', 'maintenance', 'posts'];
  activeTab = allowed.includes(name) ? name : 'services';
  for (const btn of document.querySelectorAll('[role="tab"]')) {
    const selected = btn.dataset.tab === activeTab;
    btn.setAttribute('aria-selected', String(selected));
    btn.tabIndex = selected ? 0 : -1;
    $(btn.getAttribute('aria-controls')).hidden = !selected;
  }
  if (focus) $('tab-button-' + activeTab).focus();
}
const tabs = [...document.querySelectorAll('[role="tab"]')];
for (const btn of tabs) {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
  btn.addEventListener('keydown', (e) => {
    const index = tabs.indexOf(btn);
    const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { e.preventDefault(); selectTab(tabs[next].dataset.tab, true); }
  });
}
function refreshAll(manual = false) {
  // Serialize reloads so an older read cannot replace the result of a saved edit.
  const task = refreshTail.then(() => readWorkspace(manual));
  refreshTail = task.catch(() => false);
  return task;
}
async function readWorkspace(manual = false) {
  if (!token) return false;
  refreshing = true;
  const generation = session;
  $('admin-refresh').disabled = true;
  $('admin-refresh').textContent = 'Refreshing…';
  try {
    const [p, s, m, n, snap] = await Promise.all(['/api/providers', '/api/services', '/api/maintenance', '/api/posts', '/api/status'].map((path) => request(path)));
    if (generation !== session) return false;
    if (![p, s, m, n, snap?.services].every(Array.isArray) || !snap?.site || !snap?.verdict) throw new Error('Invalid workspace response.');
    providers = p; services = s; maintenance = m; posts = n; snapshot = snap;
    receivedAt = performance.now(); refreshFailed = false;
    $('admin-error').hidden = true;
    $('admin-updated').textContent = `Snapshot: ${date(snap.generatedAt)}`;
    $('brand').textContent = snap.site.name;
    renderWorkspace();
    if (manual) feedback('Workspace refreshed.');
    return true;
  } catch (error) {
    if (generation !== session) return false;
    refreshFailed = true;
    if (error.status === 401) { signOut('Your token is no longer accepted. Sign in again.'); return false; }
    $('admin-error').hidden = false;
    $('admin-error').textContent = 'Could not refresh the workspace. Displayed status is unverified. Use Refresh workspace to retry.';
    $('admin-updated').textContent = 'Connection unavailable';
    if (snapshot) renderWorkspace();
    return false;
  } finally {
    refreshing = false;
    $('admin-refresh').disabled = false;
    $('admin-refresh').textContent = 'Refresh workspace';
  }
}
function button(action, label, title, id) {
  return `<button type="button" class="button small secondary" data-act="${action}" data-focus-key="${esc(`${id}-${action}`)}" aria-label="${esc(`${label} ${title}`)}">${label}</button>`;
}
function blankRow(columns, title, description, symbol) {
  return `<tr><td colspan="${columns}" class="table-empty">${emptyState(title, description, symbol)}</td></tr>`;
}
function renderWorkspace() {
  const incidents = posts.filter((p) => postKind(p) === 'incident');
  const notes = posts.filter((p) => postKind(p) === 'announcement');
  const planned = maintenance.filter((m) => ['active', 'upcoming'].includes(maintenancePhase(m)));
  $('admin-overview').innerHTML = [
    ['Enabled services', services.filter((s) => s.enabled !== false).length],
    ['Open IT incidents', incidents.filter((p) => !p.resolved).length],
    ['Active / scheduled work', planned.length],
    ['Published announcements', notes.filter((p) => !p.resolved).length],
  ].map(([label, value]) => `<div><span class="metric-label">${label}</span><strong>${value}</strong></div>`).join('');
  $('tab-count-services').textContent = services.length;
  $('tab-count-incidents').textContent = incidents.filter((p) => !p.resolved).length;
  renderServices(); renderMaintenance(); renderPosts(incidents, 'incidents'); renderPosts(notes, 'posts');
}
function renderServices() {
  const q = $('admin-search').value.trim().toLocaleLowerCase();
  const list = [...services].filter((s) => !q || `${s.name} ${s.group || ''}`.toLocaleLowerCase().includes(q)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  const cached = !isCurrent();
  updateRegion($('services-table').querySelector('tbody'), list.map((s) => {
    const st = snapshot?.services.find((row) => row.id === s.id);
    const enabled = s.enabled !== false;
    const status = !enabled ? badge('unknown', 'Disabled') : cached ? badge('unknown', 'Unverified') : st ? badge(st.state, st.label) : badge('unknown', 'Not checked');
    const summary = !enabled ? 'Not polled or shown publicly' : cached ? 'Refresh to verify current health' : st?.error || (st?.checkedAt ? `Checked ${ago(st.checkedAt)}` : 'Waiting for the first result');
    return `<tr data-id="${esc(s.id)}" class="${enabled ? '' : 'row-disabled'}"><td><strong>${esc(s.name)}</strong><p class="small muted">${esc(s.group || 'No group')} · Order ${esc(s.order ?? 0)}</p></td><td data-label="Source"><span>${esc(providers.find((p) => p.id === s.provider)?.label.split(' (')[0] || s.provider)}</span></td><td data-label="Ownership"><span>${s.owner === 'internal' ? 'Internal' : 'External vendor'}</span></td><td data-label="Latest status"><div>${status}<p class="small muted">${esc(summary)}</p></div></td><td><div class="row-actions">${s.provider === 'manual' ? button('state', 'Set state', s.name, s.id) : ''}${button('edit', 'Edit', s.name, s.id)}${enabled ? button('refresh', 'Check now', s.name, s.id) : ''}</div></td></tr>`;
  }).join('') || blankRow(5, q ? 'No matching services' : 'Start with one service', q ? 'Try another name or group.' : 'Use Add service to connect a vendor feed or an internal check.', 'server'));
}
function renderMaintenance() {
  const phase = { active: ['maintenance', 'In progress'], upcoming: ['info', 'Scheduled'], completed: ['operational', 'Completed'], cancelled: ['unknown', 'Cancelled'], unknown: ['unknown', 'Unknown'] };
  updateRegion($('maintenance-table').querySelector('tbody'), [...maintenance].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt)).map((m) => {
    const ph = maintenancePhase(m), [state, label] = phase[ph];
    return `<tr data-id="${esc(m.id)}"><td><strong>${esc(m.title)}</strong><p class="small muted">${esc(names(m.services) || 'General IT maintenance')}</p></td><td data-label="Window"><span>${esc(Number.isFinite(Date.parse(m.startsAt)) ? fmtRange(m.startsAt, m.endsAt) : 'Time unavailable')}</span></td><td data-label="Status"><div>${badge(state, label)}</div></td><td><div class="row-actions">${ph === 'upcoming' ? button('start', 'Start now', m.title, m.id) : ''}${ph === 'active' ? button('complete', 'Complete', m.title, m.id) : ''}${button('edit', 'Edit', m.title, m.id)}</div></td></tr>`;
  }).join('') || blankRow(4, 'No maintenance scheduled', 'Plan a window so employees know what to expect.', 'calendar'));
}
function renderPosts(list, tab) {
  const incident = tab === 'incidents';
  updateRegion($(tab + '-table').querySelector('tbody'), [...list].sort((a, b) => Number(a.resolved) - Number(b.resolved) || Date.parse(b.createdAt) - Date.parse(a.createdAt)).map((p) => {
    const state = p.resolved ? 'unknown' : p.severity;
    return `<tr data-id="${esc(p.id)}"><td><strong>${esc(p.title)}</strong>${p.pinned ? `<p class="small muted">${icon('pin')} Pinned</p>` : ''}<p class="small muted">${esc((p.updates?.[0]?.body || p.body || '').slice(0, 140))}</p></td><td data-label="${incident ? 'Affected services' : 'Published'}"><span>${esc(incident ? names(p.services) || 'General IT incident' : date(p.createdAt))}</span></td><td data-label="${incident ? 'Status' : 'Visibility'}"><div>${badge(state, p.resolved ? incident ? 'Resolved' : 'Archived' : incident ? p.severity === 'critical' ? 'Major incident' : 'Open incident' : 'Published')}</div></td><td><div class="row-actions">${incident ? button('update', 'Add update', p.title, p.id) : button('pin', p.pinned ? 'Unpin' : 'Pin', p.title, p.id)}${button('resolve', p.resolved ? incident ? 'Reopen' : 'Publish' : incident ? 'Resolve' : 'Archive', p.title, p.id)}${button('edit', 'Edit', p.title, p.id)}</div></td></tr>`;
  }).join('') || blankRow(4, incident ? 'No IT incidents recorded' : 'Nothing announced yet', incident ? 'Report an internal issue to start a clear incident timeline.' : 'Keep your team informed without changing service health.', incident ? 'check' : 'note'));
}
$('admin-search').addEventListener('input', renderServices);

// One editor, explicit pending state, and focus restored after list refreshes.
function field(name, label, { type = 'text', value = '', help = '', placeholder = '', required = false, options = [], max, min, full = false } = {}) {
  type = ['text', 'url', 'number', 'datetime-local', 'checkbox', 'select', 'textarea'].includes(type) ? type : 'text';
  const id = `field-${name.replace(/[^a-z0-9-]/gi, '-')}`;
  const attrs = `id="${id}" name="${esc(name)}"${required ? ' required' : ''}${max != null ? ` ${type === 'number' ? 'max' : 'maxlength'}="${max}"` : ''}${min != null ? ` min="${min}"` : ''}${help ? ` aria-describedby="${id}-help"` : ''}`;
  if (type === 'checkbox') return `<div class="${full ? 'full' : ''}"><label class="checkbox-label" for="${id}"><input type="checkbox" ${attrs}${value ? ' checked' : ''}>${esc(label)}</label>${help ? `<p class="field-help" id="${id}-help">${esc(help)}</p>` : ''}</div>`;
  const control = type === 'select' ? `<select ${attrs}>${options.map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>` : type === 'textarea' ? `<textarea ${attrs} placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input ${attrs} type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}">`;
  return `<div class="field ${full ? 'full' : ''}"><label for="${id}">${esc(label)}${required ? ' *' : ''}</label>${control}${help ? `<p class="field-help" id="${id}-help">${esc(help)}</p>` : ''}</div>`;
}
function serviceChoices(selected = []) {
  return `<fieldset class="form-section"><legend>Affected services</legend><p class="field-help">No selection publishes a general IT update.</p>${services.length ? `<div class="service-choices">${services.map((s) => `<label class="checkbox-label"><input type="checkbox" name="services[]" value="${esc(s.id)}"${selected.includes(s.id) ? ' checked' : ''}>${esc(s.name)}${s.enabled === false ? ' (disabled)' : ''}</label>`).join('')}</div>` : '<p class="muted small">No configured services. This will be a general update.</p>'}</fieldset>`;
}
function formData() {
  const out = {};
  for (const el of $('dialog-form').querySelectorAll('[name]')) {
    const name = el.name;
    if (el.type === 'checkbox' && name.endsWith('[]')) { const key = name.slice(0, -2); out[key] ||= []; if (el.checked) out[key].push(el.value); }
    else out[name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}
function openEditor({ title, kicker = 'WORKSPACE', body, save, test, remove, saveLabel = 'Save changes' }) {
  const opener = document.activeElement;
  editor = { save, test, remove, opener, key: opener?.dataset.focusKey };
  $('dialog-title').textContent = title;
  $('dialog-kicker').textContent = kicker;
  $('dialog-body').innerHTML = body;
  $('dialog-result').textContent = '';
  $('dialog-error').textContent = '';
  $('dialog-save').textContent = saveLabel;
  $('dialog-test').hidden = !test;
  $('dialog-delete').hidden = !remove;
  $('dialog').showModal();
  $('dialog-title').focus();
}
function restoreFocus(previous) {
  const element = previous?.key ? [...document.querySelectorAll('[data-focus-key]')].find((el) => el.dataset.focusKey === previous.key) : previous?.opener;
  if (element?.isConnected && !element.closest('[hidden]')) element.focus({ preventScroll: true });
  else $('tab-button-' + activeTab).focus({ preventScroll: true });
}
function closeEditor() {
  if (dialogBusy) return;
  const previous = editor;
  $('dialog').close();
  restoreFocus(previous);
}
for (const id of ['dialog-close', 'dialog-cancel']) $(id).addEventListener('click', closeEditor);
$('dialog').addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); });
for (const modal of [$('dialog'), $('confirm-dialog')]) modal.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')]
    .filter((el) => !el.disabled && el.getClientRects().length);
  if (!controls.length) { event.preventDefault(); return; }
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
});
async function editorAction(action, successMessage, close = true) {
  if (dialogBusy) return;
  const previous = editor, generation = session;
  const controls = [...$('dialog-form').querySelectorAll('button, input, select, textarea')].map((el) => [el, el.disabled]);
  dialogBusy = true;
  $('dialog-form').setAttribute('aria-busy', 'true');
  controls.forEach(([el]) => { el.disabled = true; });
  $('dialog-error').textContent = '';
  try {
    await action();
    if (generation !== session) return;
    if (close) {
      $('dialog').close();
      const refreshed = await refreshAll();
      feedback(successMessage + (refreshed ? '' : ' Saved, but the workspace could not be refreshed. Do not submit again.'));
      restoreFocus(previous);
    }
  } catch (error) {
    if (generation !== session) return;
    if (error.status === 401) signOut('Your token was not accepted. Sign in again.');
    else { $('dialog-error').textContent = error.message; $('dialog-error').scrollIntoView({ block: 'nearest' }); }
  } finally {
    controls.forEach(([el, disabled]) => { el.disabled = disabled; });
    dialogBusy = false;
    $('dialog-form').removeAttribute('aria-busy');
  }
}
$('dialog-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!$('dialog-form').reportValidity() || dialogBusy) return;
  const data = formData();
  editorAction(() => editor.save(data), 'Changes saved.');
});
$('dialog-test').addEventListener('click', () => {
  if (!$('dialog-form').reportValidity() || dialogBusy) return;
  const data = formData();
  $('dialog-result').textContent = 'Testing the configured feed…';
  editorAction(() => editor.test(data), '', false);
});
function confirmDelete(title) {
  $('confirm-description').textContent = `Permanently delete “${title}”?`;
  $('confirm-dialog').returnValue = 'cancel';
  $('confirm-dialog').showModal();
  return new Promise((resolve) => $('confirm-dialog').addEventListener('close', () => resolve($('confirm-dialog').returnValue === 'delete'), { once: true }));
}
$('dialog-delete').addEventListener('click', async () => {
  if (dialogBusy || !editor?.remove) return;
  const current = editor;
  if (await confirmDelete($('dialog-title').textContent.replace(/^Edit /, ''))) editorAction(current.remove, 'Item deleted.');
});
const toLocal = (iso) => {
  const d = new Date(iso); if (!Number.isFinite(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocal = (s) => { if (!s) return null; const d = new Date(s); if (!Number.isFinite(d.getTime())) throw new Error('Enter a valid date and time.'); return d.toISOString(); };

function providerFields(p, config = {}) {
  return `<div id="provider-fields"><p class="field-help">${esc(p.description)}</p><div class="form-grid">${p.fields.map((f) => field(`config.${f.key}`, f.label, { type: f.type, value: config[f.key] ?? (f.type === 'select' ? f.options?.[0]?.value || '' : ''), help: f.help, placeholder: f.placeholder, required: f.required, options: f.options, full: true, ...(f.type === 'number' ? { min: 0 } : { max: f.type === 'url' ? 2000 : 500 }) })).join('')}</div></div>`;
}
function serviceDialog(existing) {
  if (!providers.length) { feedback('Provider information is not available. Refresh the workspace first.', true); return; }
  const current = existing || { provider: providers[0].id, config: {}, enabled: true, order: services.length };
  const provider = providers.find((p) => p.id === current.provider) || providers[0];
  const drafts = new Map([[provider.id, { ...current.config }]]);
  let selectedProvider = provider.id;
  const parse = (data) => ({ name: data.name, provider: data.provider, owner: data.owner, group: data.group, statusPageUrl: data.statusPageUrl, description: data.description, order: Number(data.order), enabled: data.enabled, config: Object.fromEntries(Object.entries(data).filter(([k]) => k.startsWith('config.')).map(([k, v]) => [k.slice(7), v])) });
  openEditor({ title: existing ? `Edit ${existing.name}` : 'Add a service', kicker: 'SERVICE MONITORING',
    body: `<fieldset class="form-section"><legend>Service details</legend><div class="form-grid">${field('name', 'Service name', { value: current.name || '', placeholder: 'e.g. Company VPN', required: true, max: 100 })}${field('owner', 'Ownership', { type: 'select', value: current.owner || provider.defaultOwner, options: [{ value: 'internal', label: 'Internal · managed by IT' }, { value: 'vendor', label: 'External · vendor managed' }] })}${field('group', 'Group', { value: current.group || '', placeholder: 'e.g. Collaboration', max: 60 })}${field('order', 'Display order', { type: 'number', value: current.order ?? 0, min: -1000, max: 100000 })}${field('description', 'Short description', { value: current.description || '', max: 300, full: true })}</div></fieldset>
      <fieldset class="form-section"><legend>Monitoring source</legend><div class="form-grid">${field('provider', 'Provider', { type: 'select', value: provider.id, options: providers.map((p) => ({ value: p.id, label: p.label })), full: true })}</div>${providerFields(provider, current.config)}<p class="field-help">Private targets must be approved in CHECK_ALLOWED_TARGETS on the server. Test the feed before saving.</p></fieldset>
      <fieldset class="form-section"><legend>Public visibility</legend><div class="form-grid">${field('statusPageUrl', 'Public status source link', { type: 'url', value: current.statusPageUrl || '', help: 'Visible to status-page readers. Do not include credentials or private URLs.', max: 2000, full: true })}${field('enabled', 'Enabled: monitor and show on the status page', { type: 'checkbox', value: current.enabled !== false, full: true })}</div></fieldset>`,
    saveLabel: existing ? 'Save changes' : 'Add service',
    save: (data) => request(existing ? endpoint('services', existing.id) : '/api/services', { method: existing ? 'PUT' : 'POST', body: parse(data) }),
    remove: existing ? () => request(endpoint('services', existing.id), { method: 'DELETE' }) : null,
    test: async (data) => {
      const result = await request('/api/services/test', { method: 'POST', body: parse(data) });
      if (!result.ok) { $('dialog-result').innerHTML = `<div class="notice error">Feed check failed: ${esc(result.error || 'No result received.')}</div>`; return; }
      const st = result.status;
      $('dialog-result').innerHTML = `<div class="notice">${badge(st.state)}<p>${esc(st.summary || 'Feed response received.')}</p><p class="small muted">${st.latencyMs != null ? `${esc(st.latencyMs)} ms · ` : ''}This test does not save the service.</p></div>`;
    },
  });
  $('field-provider').addEventListener('change', (e) => {
    drafts.set(selectedProvider, Object.fromEntries(Object.entries(formData()).filter(([k]) => k.startsWith('config.')).map(([k, v]) => [k.slice(7), v])));
    selectedProvider = e.target.value;
    const p = providers.find((entry) => entry.id === selectedProvider);
    $('provider-fields').outerHTML = providerFields(p, drafts.get(selectedProvider) || {});
    $('dialog-result').textContent = '';
    if (!existing) $('field-owner').value = p.defaultOwner;
  });
}
function manualStateDialog(s) {
  openEditor({ title: `Set state: ${s.name}`, kicker: 'IT-DECLARED STATUS', body: `<div class="form-grid">${field('state', 'Service state', { type: 'select', value: s.config?.state || 'operational', options: Object.entries(STATE).filter(([key]) => key !== 'unknown').map(([value, meta]) => ({ value, label: meta.label })), full: true })}${field('message', 'Public message', { type: 'textarea', value: s.config?.message || '', max: 500, help: 'Explain the impact, not internal troubleshooting secrets.', full: true })}</div>`, saveLabel: 'Update state', save: (data) => request(endpoint('services', s.id) + '/state', { method: 'PATCH', body: data }) });
}
function maintenanceDialog(m) {
  const start = m?.startsAt || new Date(Math.ceil(Date.now() / 3600000) * 3600000).toISOString();
  const end = m ? m.endsAt : new Date(Date.parse(start) + 7200000).toISOString();
  openEditor({ title: m ? `Edit ${m.title}` : 'Schedule maintenance', kicker: 'PLANNED WORK', body: `<fieldset class="form-section"><legend>Maintenance window</legend><div class="form-grid">${field('title', 'Title', { value: m?.title || '', required: true, max: 200, full: true })}${field('startsAt', 'Starts (your local time)', { type: 'datetime-local', value: toLocal(start), required: true })}${field('endsAt', 'Ends (your local time)', { type: 'datetime-local', value: end ? toLocal(end) : '', help: 'Without an end time, scheduled windows default to one hour.' })}${field('status', 'Status', { type: 'select', value: m?.status || 'scheduled', options: [{ value: 'scheduled', label: 'Scheduled' }, { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }], full: true })}</div></fieldset>${serviceChoices(m?.services)}<div class="form-grid">${field('description', 'What should people expect?', { type: 'textarea', value: m?.description || '', max: 5000, full: true })}</div>`,
    saveLabel: m ? 'Save changes' : 'Schedule work', remove: m ? () => request(endpoint('maintenance', m.id), { method: 'DELETE' }) : null,
    save: (data) => { const body = { ...data, startsAt: fromLocal(data.startsAt), endsAt: fromLocal(data.endsAt), services: data.services || [] }; if (body.endsAt && body.endsAt < body.startsAt) throw new Error('End time must be after the start time.'); return request(m ? endpoint('maintenance', m.id) : '/api/maintenance', { method: m ? 'PUT' : 'POST', body }); },
  });
}
function postDialog(p, kind = 'announcement') {
  const incident = p ? postKind(p) === 'incident' : kind === 'incident';
  openEditor({ title: p ? `Edit ${p.title}` : incident ? 'Report an incident' : 'New announcement', kicker: incident ? 'INCIDENT COMMUNICATION' : 'FROM IT',
    body: `<fieldset class="form-section"><legend>${incident ? 'Describe the impact' : 'Your announcement'}</legend><p class="field-help">${incident ? 'This is an IT-managed incident. Affected services will show an internal issue until resolved.' : 'Announcements inform employees without changing service health.'}</p><div class="form-grid">${field('title', 'Title', { value: p?.title || '', required: true, max: 200, full: true })}${incident ? field('severity', 'Severity', { type: 'select', value: p?.severity || 'warning', options: [{ value: 'warning', label: 'Incident · degraded service' }, { value: 'critical', label: 'Major incident · outage' }], full: true }) : ''}${field('body', 'Message', { type: 'textarea', value: p?.body || '', placeholder: 'What is affected, what people should do, and the latest known information.', max: 10000, full: true })}${field('pinned', 'Pin this update', { type: 'checkbox', value: p?.pinned || false, full: true })}</div></fieldset>${serviceChoices(p?.services)}`,
    saveLabel: p ? 'Save changes' : incident ? 'Publish incident' : 'Publish announcement',
    remove: p ? () => request(endpoint('posts', p.id), { method: 'DELETE' }) : null,
    save: (data) => request(p ? endpoint('posts', p.id) : '/api/posts', { method: p ? 'PUT' : 'POST', body: { ...data, severity: incident ? data.severity : 'info', services: data.services || [] } }),
  });
}
function updateDialog(p) {
  openEditor({ title: `Update ${p.title}`, kicker: 'INCIDENT TIMELINE', body: `<div class="form-grid">${field('body', 'Latest update', { type: 'textarea', required: true, max: 5000, full: true, help: 'Explain what changed and what affected employees need to know.' })}${field('resolved', 'Mark this incident resolved', { type: 'checkbox', value: p.resolved, full: true })}</div>`, saveLabel: 'Publish update', save: (data) => request(endpoint('posts', p.id) + '/updates', { method: 'POST', body: data }) });
}
$('add-service').addEventListener('click', () => serviceDialog(null));
$('add-maintenance').addEventListener('click', () => maintenanceDialog(null));
$('add-incident').addEventListener('click', () => postDialog(null, 'incident'));
$('add-post').addEventListener('click', () => postDialog(null));
for (const table of ['services', 'maintenance', 'incidents', 'posts']) $(table + '-table').addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-act]'); if (!btn || btn.disabled) return;
  const id = btn.closest('tr').dataset.id, action = btn.dataset.act;
  const item = (table === 'services' ? services : table === 'maintenance' ? maintenance : posts).find((p) => p.id === id);
  if (!item) return;
  if (action === 'edit') return table === 'services' ? serviceDialog(item) : table === 'maintenance' ? maintenanceDialog(item) : postDialog(item);
  if (action === 'state') return manualStateDialog(item);
  if (action === 'update') return updateDialog(item);
  btn.disabled = true;
  const generation = session, key = btn.dataset.focusKey;
  try {
    if (table === 'services' && action === 'refresh') await request(endpoint('services', id) + '/refresh', { method: 'POST' });
    else if (table === 'maintenance') await request(endpoint('maintenance', id), { method: 'PUT', body: action === 'start' ? { status: 'in_progress', startsAt: new Date().toISOString() } : { status: 'completed', endsAt: new Date().toISOString() } });
    else await request(endpoint('posts', id), { method: 'PUT', body: action === 'pin' ? { pinned: !item.pinned } : { resolved: !item.resolved } });
    if (session !== generation) return;
    const refreshed = await refreshAll();
    feedback(refreshed ? action === 'refresh' ? 'Check completed. Review the reported result; completion is not proof of health.' : 'Changes saved.' : 'Action completed, but the workspace could not refresh. Do not submit again.');
    restoreFocus({ key });
  } catch (error) { if (session === generation) { if (error.status === 401) signOut('Sign in again to continue.'); else feedback(error.message, true); } }
  finally { btn.disabled = false; }
});
setInterval(() => {
  if (!token || !snapshot || isCurrent()) return;
  $('admin-updated').textContent = 'Check information is stale or unavailable';
  renderServices();
}, 5000);
// Background refresh never replaces a form while someone is editing it.
setInterval(() => { if (token && !refreshing && !dialogBusy && !$('dialog').open && document.visibilityState === 'visible') refreshAll(); }, 30000);
if (token) signIn(token);
