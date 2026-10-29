import { STATE, ICONS, SEVERITY_LABEL, esc, fmtDate, fmtRange, ago, pill, api, getToken, cycleTheme, toast } from './common.js';

const $ = (id) => document.getElementById(id);
const ISSUE = new Set(['degraded', 'partial_outage', 'major_outage']);
let providers = [];
let services = [];
let maintenance = [];
let posts = [];
let snapshot = null;

document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = ICONS[el.dataset.icon] || ''));

// ---------------------------------------------------------------- auth gate
async function tryToken(token) {
  await api('/api/admin/whoami', { token });
  localStorage.setItem('adminToken', token);
  $('gate').hidden = true;
  $('admin').hidden = false;
  await refreshAll();
}

$('gate-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('gate-error').textContent = '';
  try {
    await tryToken($('token').value.trim());
  } catch (err) {
    $('gate-error').textContent = err.status === 401 ? 'That token was not accepted.' : err.message;
  }
});
$('signout').addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('adminToken');
  location.reload();
});
$('theme').addEventListener('click', () => toast(`Theme: ${cycleTheme()}`));
if (getToken()) tryToken(getToken()).catch(() => localStorage.removeItem('adminToken'));

// ---------------------------------------------------------------- tabs
function showTab(name) {
  document.querySelectorAll('.sidebar nav button').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  history.replaceState(null, '', `#${name}`);
}
document.querySelectorAll('.sidebar nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
if (/^#(overview|services|maintenance|posts)$/.test(location.hash)) showTab(location.hash.slice(1));

async function refreshAll() {
  [providers, snapshot, services, maintenance, posts] = await Promise.all([
    api('/api/providers'),
    api('/api/status'),
    api('/api/services'),
    api('/api/maintenance'),
    api('/api/posts'),
  ]);
  $('n-services').textContent = services.length;
  const activeMaint = snapshot.maintenance.active.length + snapshot.maintenance.upcoming.length;
  $('n-maintenance').textContent = activeMaint || '';
  $('n-posts').textContent = snapshot.posts.open.length || '';
  renderOverview();
  renderServices();
  renderMaintenance();
  renderPosts();
}

// ---------------------------------------------------------------- dialog plumbing
const dialog = $('dialog');
let onSave = null;
let onTest = null;

function openDialog({ title, body, save, test, saveLabel = 'Save' }) {
  $('dialog-title').textContent = title;
  $('dialog-body').innerHTML = body;
  $('dialog-result').innerHTML = '';
  $('dialog-error').textContent = '';
  $('dialog-save').textContent = saveLabel;
  $('dialog-test').hidden = !test;
  onSave = save;
  onTest = test;
  dialog.showModal();
  dialog.querySelector('input:not([type=checkbox]), select, textarea')?.focus();
}
$('dialog-cancel').addEventListener('click', () => dialog.close());
$('dialog-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('dialog-error').textContent = '';
  $('dialog-save').disabled = true;
  try {
    await onSave?.(formData());
    dialog.close();
    toast('Saved');
    await refreshAll();
  } catch (err) {
    $('dialog-error').textContent = err.message;
  } finally {
    $('dialog-save').disabled = false;
  }
});
$('dialog-test').addEventListener('click', async () => {
  $('dialog-error').textContent = '';
  $('dialog-result').innerHTML = '<div class="notice">Checking the feed…</div>';
  try {
    await onTest?.(formData());
  } catch (err) {
    $('dialog-result').innerHTML = `<div class="notice error">${esc(err.message)}</div>`;
  }
});

function formData() {
  const out = {};
  for (const el of $('dialog-form').querySelectorAll('[name]')) {
    const name = el.name;
    if (el.type === 'checkbox') {
      if (name.endsWith('[]')) {
        const key = name.slice(0, -2);
        out[key] ||= [];
        if (el.checked) out[key].push(el.value);
      } else out[name] = el.checked;
    } else out[name] = el.value;
  }
  return out;
}

function field(name, label, { type = 'text', value = '', placeholder = '', help = '', required = false, options, full = false } = {}) {
  const cls = full ? ' class="full"' : '';
  const helpHtml = help ? `<span class="help">${esc(help)}</span>` : '';
  if (type === 'select') {
    return `<label${cls}>${esc(label)}${helpHtml}<select name="${esc(name)}">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
  }
  if (type === 'textarea') return `<label${cls}>${esc(label)}${helpHtml}<textarea name="${esc(name)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  if (type === 'checkbox') return `<label class="inline${full ? ' full' : ''}"><input type="checkbox" name="${esc(name)}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
  return `<label${cls}>${esc(label)}${helpHtml}<input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}></label>`;
}

function serviceChecks(selected = []) {
  if (!services.length) return '<span class="muted small">No services yet.</span>';
  const sorted = [...services].sort((a, b) => (a.owner === b.owner ? 0 : a.owner === 'internal' ? -1 : 1) || a.name.localeCompare(b.name));
  return `<div class="checks">${sorted
    .map((s) => `<label><input type="checkbox" name="services[]" value="${esc(s.id)}" ${selected.includes(s.id) ? 'checked' : ''}>${esc(s.name)}</label>`)
    .join('')}</div>`;
}

const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const confirmDelete = (what) => window.confirm(`Delete ${what}? This cannot be undone.`);
const nameOf = (id) => services.find((s) => s.id === id)?.name || '?';
const statusFor = (id) => snapshot?.services.find((s) => s.id === id) || null;

// ---------------------------------------------------------------- overview
function renderOverview() {
  const v = snapshot.verdict;
  $('ov-headline').textContent = v.headline;
  $('ov-detail').textContent = v.detail;
  const issues = snapshot.services.filter((s) => ISSUE.has(s.state));
  const unknown = snapshot.services.filter((s) => s.state === 'unknown');
  const openInc = snapshot.posts.open.filter((p) => p.severity !== 'info');
  const stat = (k, v, sub, cls = '') => `<div class="card stat ${cls}"><div class="k">${k}</div><div class="v">${v}${sub ? `<small>${esc(sub)}</small>` : ''}</div></div>`;
  $('stats').innerHTML = [
    stat('Tracked services', services.length, `${services.filter((s) => !s.enabled).length || 'none'} disabled`),
    stat('With issues', issues.length, issues.length ? `${v.them.length} them · ${v.us.length} us` : 'all clear', issues.length ? 'bad' : 'ok'),
    stat('Open incident posts', openInc.length, `${snapshot.posts.open.length - openInc.length} announcements`, openInc.length ? 'warn' : ''),
    stat('Maintenance', snapshot.maintenance.active.length, `${snapshot.maintenance.upcoming.length} upcoming`, snapshot.maintenance.active.length ? 'warn' : ''),
    stat('Feeds unreadable', unknown.length, unknown.length ? 'check config' : 'all feeds ok', unknown.length ? 'warn' : ''),
  ].join('');

  const rows = [];
  for (const s of issues) {
    rows.push(`<div class="card row"><span class="dot ${esc(s.state)}"></span><span class="grow"><b>${esc(s.name)}</b> · ${esc(s.reason ? `${s.reason.kind === 'maintenance' ? 'our maintenance' : 'our incident'}: ${s.reason.title}` : s.summary)}</span><span class="tag ${s.ours ? 'us' : 'them'}">${s.ours ? 'us' : 'them'}</span>${pill(s.state)}<button class="btn sm" data-goto="services">Manage</button></div>`);
  }
  for (const s of unknown) {
    rows.push(`<div class="card row"><span class="dot unknown"></span><span class="grow"><b>${esc(s.name)}</b> · feed unreadable: ${esc(s.error || 'no data yet')}</span><button class="btn sm" data-goto="services">Manage</button></div>`);
  }
  for (const p of openInc) {
    rows.push(`<div class="card row"><span class="dot ${p.severity === 'critical' ? 'major_outage' : 'degraded'}"></span><span class="grow"><b>${esc(p.title)}</b> · open since ${esc(ago(p.createdAt))}${p.updates?.length ? `, last update ${esc(ago(p.updates[0].at))}` : ''}</span><button class="btn sm" data-act="update" data-id="${esc(p.id)}">Add update</button><button class="btn sm" data-act="resolve" data-id="${esc(p.id)}">Resolve</button></div>`);
  }
  for (const m of snapshot.maintenance.active) {
    rows.push(`<div class="card row"><span class="dot maintenance"></span><span class="grow"><b>${esc(m.title)}</b> · in progress until ${esc(fmtDate(m.endsAt))}</span><button class="btn sm" data-act="complete" data-id="${esc(m.id)}">Mark complete</button></div>`);
  }
  $('attention').innerHTML = rows.join('') || '<div class="card empty">Nothing needs attention. Everything tracked is operational and nothing is open.</div>';
}

$('attention').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.goto) return showTab(btn.dataset.goto);
  const { act, id } = btn.dataset;
  try {
    if (act === 'update') return updateDialog(posts.find((p) => p.id === id));
    if (act === 'resolve') await api(`/api/posts/${id}`, { method: 'PUT', body: { resolved: true } });
    if (act === 'complete') await api(`/api/maintenance/${id}`, { method: 'PUT', body: { status: 'completed', endsAt: new Date().toISOString() } });
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
});
$('q-incident').addEventListener('click', () => postDialog(null, { severity: 'warning' }));
$('q-announce').addEventListener('click', () => postDialog(null, { severity: 'info' }));
$('q-maint').addEventListener('click', () => maintenanceDialog(null));
$('q-service').addEventListener('click', () => serviceDialog(null));

// ---------------------------------------------------------------- services
function renderServices() {
  const tbody = $('services-table').querySelector('tbody');
  const sorted = [...services].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">No services yet. Add one to start tracking.</td></tr>';
    return;
  }
  tbody.innerHTML = sorted
    .map((s) => {
      const st = statusFor(s.id);
      const prov = providers.find((p) => p.id === s.provider);
      const status = !s.enabled
        ? '<span class="muted small">disabled</span>'
        : st
          ? `${pill(st.state, STATE[st.state]?.short)}<span class="sub">${esc(st.reason ? `Our ${st.reason.kind === 'maintenance' ? 'maintenance' : 'incident'}: ${st.reason.title}` : st.error ? `Feed error: ${st.error}` : st.summary || '')}${st.checkedAt ? ` · ${esc(ago(st.checkedAt))}` : ''}</span>`
          : '<span class="muted small">pending</span>';
      const sub = [prov?.short || s.provider, s.group, s.description].filter(Boolean).join(' · ');
      return `<tr class="${s.enabled ? '' : 'disabled'}" data-id="${esc(s.id)}">
        <td><span class="handle" tabindex="0" title="Drag to reorder (or use ↑/↓ keys)" aria-label="Reorder ${esc(s.name)}">${ICONS.grip}</span></td>
        <td><span class="name">${esc(s.name)}</span><span class="sub" title="${esc(sub)}">${esc(sub)}</span></td>
        <td><span class="owner-seg" title="Click to switch"><button class="${s.owner === 'vendor' ? 'on vendor' : ''}" data-act="owner" data-owner="vendor">them</button><button class="${s.owner === 'internal' ? 'on internal' : ''}" data-act="owner" data-owner="internal">us</button></span></td>
        <td>${status}</td>
        <td><label class="switch" title="${s.enabled ? 'Enabled' : 'Disabled'}"><input type="checkbox" data-act="toggle" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(s.name)}"><span></span></label></td>
        <td><div class="btn-group">
          ${s.provider === 'manual' ? '<button class="btn sm" data-act="state">Set state</button>' : `<button class="btn sm ghost icon" data-act="refresh" title="Poll the feed now" aria-label="Refresh ${esc(s.name)}">${ICONS.refresh}</button>`}
          <button class="btn sm ghost" data-act="edit">Edit</button>
          <button class="btn sm ghost icon danger" data-act="delete" title="Delete" aria-label="Delete ${esc(s.name)}">${ICONS.trash}</button>
        </div></td></tr>`;
    })
    .join('');
}

$('services-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn || btn.dataset.act === 'toggle') return;
  const id = btn.closest('tr').dataset.id;
  const s = services.find((x) => x.id === id);
  try {
    switch (btn.dataset.act) {
      case 'edit':
        return serviceDialog(s);
      case 'state':
        return manualStateDialog(s);
      case 'owner':
        if (btn.dataset.owner === s.owner) return;
        await api(`/api/services/${id}`, { method: 'PUT', body: { owner: btn.dataset.owner } });
        break;
      case 'refresh':
        btn.disabled = true;
        await api(`/api/services/${id}/refresh`, { method: 'POST' });
        toast(`${s.name} refreshed`);
        break;
      case 'delete':
        if (!confirmDelete(`"${s.name}"`)) return;
        await api(`/api/services/${id}`, { method: 'DELETE' });
        toast(`${s.name} removed`);
        break;
    }
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
});
$('services-table').addEventListener('change', async (e) => {
  const input = e.target.closest('input[data-act=toggle]');
  if (!input) return;
  const id = input.closest('tr').dataset.id;
  try {
    await api(`/api/services/${id}`, { method: 'PUT', body: { enabled: input.checked } });
    await refreshAll();
  } catch (err) {
    toast(err.message);
    input.checked = !input.checked;
  }
});

// Drag-and-drop (and keyboard) reordering.
{
  const tbody = $('services-table').querySelector('tbody');
  let dragId = null;
  const clear = () => tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('drop-before', 'drop-after', 'dragging'));
  const commit = async (ids) => {
    try {
      await api('/api/services/order', { method: 'PUT', body: { ids } });
      await refreshAll();
    } catch (err) {
      toast(err.message);
    }
  };
  tbody.addEventListener('mousedown', (e) => {
    const tr = e.target.closest('tr');
    if (tr) tr.draggable = Boolean(e.target.closest('.handle'));
  });
  tbody.addEventListener('dragstart', (e) => {
    const tr = e.target.closest('tr');
    if (!tr?.draggable) return e.preventDefault();
    dragId = tr.dataset.id;
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });
  tbody.addEventListener('dragover', (e) => {
    if (!dragId) return;
    e.preventDefault();
    const tr = e.target.closest('tr');
    if (!tr || tr.dataset.id === dragId) return;
    const rect = tr.getBoundingClientRect();
    tbody.querySelectorAll('tr').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
    tr.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
  });
  tbody.addEventListener('drop', async (e) => {
    e.preventDefault();
    const target = e.target.closest('tr');
    if (!dragId || !target || target.dataset.id === dragId) return clear();
    const before = target.classList.contains('drop-before');
    const ids = [...tbody.querySelectorAll('tr')].map((r) => r.dataset.id).filter((id) => id !== dragId);
    const idx = ids.indexOf(target.dataset.id);
    ids.splice(before ? idx : idx + 1, 0, dragId);
    clear();
    dragId = null;
    await commit(ids);
  });
  tbody.addEventListener('dragend', () => {
    clear();
    dragId = null;
  });
  tbody.addEventListener('keydown', async (e) => {
    if (!e.target.classList.contains('handle') || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const tr = e.target.closest('tr');
    const ids = [...tbody.querySelectorAll('tr')].map((r) => r.dataset.id);
    const i = ids.indexOf(tr.dataset.id);
    const j = e.key === 'ArrowUp' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await commit(ids);
    tbody.querySelector(`tr[data-id="${tr.dataset.id}"] .handle`)?.focus();
  });
}

$('add-service').addEventListener('click', () => serviceDialog(null));

function providerFields(provider, config = {}) {
  return `<div class="form-section" id="provider-fields">
    <p>${esc(provider.description)}</p>
    <div class="form-grid">
    ${provider.fields
      .map((f) =>
        field(`config.${f.key}`, f.label, {
          type: f.type === 'select' ? 'select' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text',
          value: config[f.key] ?? (f.type === 'select' ? f.options[0].value : ''),
          placeholder: f.placeholder || '',
          help: f.help || '',
          required: f.required,
          options: f.options,
          full: true,
        }),
      )
      .join('')}
    </div>
  </div>`;
}

function serviceDialog(existing) {
  const isNew = !existing;
  const current = existing || { provider: providers[0]?.id, owner: '', group: '', config: {}, enabled: true, order: services.length };
  const provider = providers.find((p) => p.id === current.provider) || providers[0];
  const body = `<div class="form-grid">
    ${field('name', 'Name', { value: current.name || '', placeholder: 'e.g. Zoom', required: true })}
    ${field('provider', 'Feed provider', { type: 'select', value: provider.id, options: providers.map((p) => ({ value: p.id, label: p.label })) })}
    ${field('owner', 'Owner', {
      type: 'select',
      value: current.owner || provider.defaultOwner,
      options: [
        { value: 'vendor', label: 'Vendor (them)' },
        { value: 'internal', label: 'Internal (us)' },
      ],
    })}
    ${field('group', 'Group', { value: current.group ?? '', placeholder: 'Collaboration, Identity, Network…', help: 'Optional heading within the Us / Them column.' })}
    ${field('statusPageUrl', 'Public status page link', { type: 'url', value: current.statusPageUrl || '', placeholder: 'https://status.example.com', help: 'Shown as the “more info” link.' })}
    ${field('description', 'Description', { value: current.description || '', placeholder: 'One line, optional' })}
    ${field('enabled', 'Enabled (polled and shown on the page)', { type: 'checkbox', value: current.enabled !== false, full: true })}
    ${providerFields(provider, current.config || {})}
  </div>`;

  const parse = (data) => {
    const config = {};
    for (const [k, v] of Object.entries(data)) if (k.startsWith('config.')) config[k.slice(7)] = v;
    return {
      name: data.name,
      provider: data.provider,
      owner: data.owner,
      group: data.group,
      statusPageUrl: data.statusPageUrl,
      description: data.description,
      enabled: data.enabled,
      config,
      ...(isNew ? { order: services.length } : {}),
    };
  };

  openDialog({
    title: isNew ? 'Track a new service' : `Edit ${existing.name}`,
    body,
    saveLabel: isNew ? 'Add service' : 'Save changes',
    save: (data) => (isNew ? api('/api/services', { method: 'POST', body: parse(data) }) : api(`/api/services/${existing.id}`, { method: 'PUT', body: parse(data) })),
    test: async (data) => {
      const res = await api('/api/services/test', { method: 'POST', body: parse(data) });
      if (!res.ok) {
        $('dialog-result').innerHTML = `<div class="notice error">Feed check failed: ${esc(res.error)}</div>`;
        return;
      }
      const st = res.status;
      $('dialog-result').innerHTML = `<div class="notice ok">${pill(st.state)} ${esc(st.summary || '')}${st.incidents?.length ? ` · ${st.incidents.length} active incident(s)` : ''}${st.latencyMs != null ? ` · ${st.latencyMs} ms` : ''}</div>`;
    },
  });

  $('dialog-form').querySelector('[name=provider]').addEventListener('change', (e) => {
    const p = providers.find((x) => x.id === e.target.value);
    $('provider-fields').outerHTML = providerFields(p, {});
    if (isNew) $('dialog-form').querySelector('[name=owner]').value = p.defaultOwner;
  });
}

function manualStateDialog(s) {
  const states = Object.keys(STATE).filter((k) => k !== 'unknown');
  openDialog({
    title: `Set state: ${s.name}`,
    body: `<div class="form-grid">
      ${field('state', 'State', { type: 'select', value: s.config?.state || 'operational', options: states.map((k) => ({ value: k, label: STATE[k].label })), full: true })}
      ${field('message', 'Message shown on the page', { value: s.config?.message || '', placeholder: 'e.g. Floor 3 printers offline, vendor on site', full: true })}
    </div>`,
    saveLabel: 'Update',
    save: (data) => api(`/api/services/${s.id}/state`, { method: 'PATCH', body: data }),
  });
}

// ---------------------------------------------------------------- maintenance
const PHASE_PILL = { active: ['maintenance', 'In progress'], upcoming: ['unknown', 'Scheduled'], completed: ['operational', 'Completed'], cancelled: ['unknown', 'Cancelled'] };
const phaseOf = (m) => {
  if (m.status === 'cancelled') return 'cancelled';
  if (m.status === 'completed') return 'completed';
  const now = Date.now();
  const start = new Date(m.startsAt).getTime();
  const end = m.endsAt ? new Date(m.endsAt).getTime() : start + 3600e3;
  if (m.status === 'in_progress') return 'active';
  return now < start ? 'upcoming' : now <= end ? 'active' : 'completed';
};

function renderMaintenance() {
  const tbody = $('maintenance-table').querySelector('tbody');
  if (!maintenance.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No maintenance windows scheduled.</td></tr>';
    return;
  }
  tbody.innerHTML = [...maintenance]
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    .map((m) => {
      const ph = phaseOf(m);
      const [cls, label] = PHASE_PILL[ph];
      const sub = [m.services.map(nameOf).join(', ') || 'No services attached', m.description].filter(Boolean).join(' · ');
      return `<tr data-id="${esc(m.id)}" class="${ph === 'completed' || ph === 'cancelled' ? 'disabled' : ''}">
        <td class="small nowrap">${esc(fmtRange(m.startsAt, m.endsAt))}</td>
        <td><span class="name">${esc(m.title)}</span><span class="sub" title="${esc(sub)}">${esc(sub)}</span></td>
        <td>${pill(cls, label)}</td>
        <td><div class="btn-group">
          ${ph === 'upcoming' ? '<button class="btn sm" data-act="start">Start now</button>' : ''}
          ${ph === 'active' ? '<button class="btn sm" data-act="complete">Complete</button>' : ''}
          <button class="btn sm ghost" data-act="edit">Edit</button>
          <button class="btn sm ghost icon danger" data-act="delete" title="Delete" aria-label="Delete ${esc(m.title)}">${ICONS.trash}</button>
        </div></td></tr>`;
    })
    .join('');
}

$('maintenance-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const m = maintenance.find((x) => x.id === id);
  try {
    switch (btn.dataset.act) {
      case 'edit':
        return maintenanceDialog(m);
      case 'start':
        await api(`/api/maintenance/${id}`, { method: 'PUT', body: { status: 'in_progress', startsAt: new Date().toISOString() } });
        break;
      case 'complete':
        await api(`/api/maintenance/${id}`, { method: 'PUT', body: { status: 'completed', endsAt: new Date().toISOString() } });
        break;
      case 'delete':
        if (!confirmDelete(`maintenance "${m.title}"`)) return;
        await api(`/api/maintenance/${id}`, { method: 'DELETE' });
        break;
    }
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
});
$('add-maintenance').addEventListener('click', () => maintenanceDialog(null));

function maintenanceDialog(existing) {
  const isNew = !existing;
  const start = existing?.startsAt || new Date(Math.ceil(Date.now() / 3.6e6) * 3.6e6).toISOString();
  const end = existing?.endsAt || new Date(new Date(start).getTime() + 2 * 3.6e6).toISOString();
  openDialog({
    title: isNew ? 'Schedule maintenance' : 'Edit maintenance',
    body: `<div class="form-grid">
      ${field('title', 'Title', { value: existing?.title || '', placeholder: 'e.g. VPN firewall firmware upgrade', required: true, full: true })}
      ${field('startsAt', 'Starts', { type: 'datetime-local', value: toLocalInput(start), required: true })}
      ${field('endsAt', 'Ends', { type: 'datetime-local', value: toLocalInput(end) })}
      ${field('status', 'Status', {
        type: 'select',
        value: existing?.status || 'scheduled',
        options: [
          { value: 'scheduled', label: 'Scheduled' },
          { value: 'in_progress', label: 'In progress' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ],
      })}
      <label class="full">Affected services ${serviceChecks(existing?.services || [])}</label>
      ${field('description', 'Details', { type: 'textarea', value: existing?.description || '', placeholder: 'What is happening, what people should expect, who to contact.', full: true })}
    </div>`,
    saveLabel: isNew ? 'Schedule' : 'Save changes',
    save: (data) => {
      const body = { ...data, services: data.services || [], startsAt: fromLocalInput(data.startsAt), endsAt: fromLocalInput(data.endsAt) };
      return isNew ? api('/api/maintenance', { method: 'POST', body }) : api(`/api/maintenance/${existing.id}`, { method: 'PUT', body });
    },
  });
}

// ---------------------------------------------------------------- posts
function renderPosts() {
  const tbody = $('posts-table').querySelector('tbody');
  if (!posts.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty">Nothing posted yet.</td></tr>';
    return;
  }
  tbody.innerHTML = [...posts]
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || new Date(b.createdAt) - new Date(a.createdAt))
    .map(
      (p) => {
        const meta = [fmtDate(p.createdAt), p.services.map(nameOf).join(', '), p.updates?.length ? `${p.updates.length} update${p.updates.length === 1 ? '' : 's'}, latest ${ago(p.updates[0].at)}` : ''].filter(Boolean).join(' · ');
        return `<tr data-id="${esc(p.id)}" class="${p.resolved ? 'disabled' : ''}">
        <td>${pill(p.resolved ? 'operational' : p.severity, p.resolved ? 'Resolved' : SEVERITY_LABEL[p.severity])}${p.pinned ? '<br><span class="tag" style="margin-top:0.3rem">pinned</span>' : ''}</td>
        <td><span class="name">${esc(p.title)}</span>${p.body ? `<span class="sub" title="${esc(p.body)}">${esc(p.body)}</span>` : ''}<span class="sub">${esc(meta)}</span></td>
        <td><div class="btn-group">
          ${p.resolved ? '' : '<button class="btn sm" data-act="update">Add update</button>'}
          <button class="btn sm ghost" data-act="resolve">${p.resolved ? 'Reopen' : 'Resolve'}</button>
          <button class="btn sm ghost" data-act="pin">${p.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="btn sm ghost" data-act="edit">Edit</button>
          <button class="btn sm ghost icon danger" data-act="delete" title="Delete" aria-label="Delete ${esc(p.title)}">${ICONS.trash}</button>
        </div></td></tr>`;
      },
    )
    .join('');
}

$('posts-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const p = posts.find((x) => x.id === id);
  try {
    switch (btn.dataset.act) {
      case 'edit':
        return postDialog(p);
      case 'update':
        return updateDialog(p);
      case 'resolve':
        await api(`/api/posts/${id}`, { method: 'PUT', body: { resolved: !p.resolved } });
        break;
      case 'pin':
        await api(`/api/posts/${id}`, { method: 'PUT', body: { pinned: !p.pinned } });
        break;
      case 'delete':
        if (!confirmDelete(`post "${p.title}"`)) return;
        await api(`/api/posts/${id}`, { method: 'DELETE' });
        break;
    }
    await refreshAll();
  } catch (err) {
    toast(err.message);
  }
});
$('add-post').addEventListener('click', () => postDialog(null));

function postDialog(existing, defaults = {}) {
  const isNew = !existing;
  const cur = existing || defaults;
  openDialog({
    title: isNew ? (cur.severity && cur.severity !== 'info' ? 'Post an incident' : 'New post') : 'Edit post',
    body: `<div class="form-grid">
      ${field('title', 'Title', { value: cur.title || '', placeholder: 'e.g. Email delivery delays', required: true, full: true })}
      ${field('severity', 'Type', {
        type: 'select',
        value: cur.severity || 'info',
        options: [
          { value: 'info', label: 'Announcement — informational' },
          { value: 'warning', label: 'Incident — degraded, marks services as “us”' },
          { value: 'critical', label: 'Major incident — outage, marks services as “us”' },
        ],
      })}
      ${field('pinned', 'Pin to the top', { type: 'checkbox', value: cur.pinned || false })}
      <label class="full">Affected services ${serviceChecks(cur.services || [])}</label>
      ${field('body', 'Message', { type: 'textarea', value: cur.body || '', placeholder: 'What people need to know. URLs become links.', full: true })}
    </div>`,
    saveLabel: isNew ? 'Post' : 'Save changes',
    save: (data) => {
      const body = { ...data, services: data.services || [] };
      return isNew ? api('/api/posts', { method: 'POST', body }) : api(`/api/posts/${existing.id}`, { method: 'PUT', body });
    },
  });
}

function updateDialog(p) {
  openDialog({
    title: `Update: ${p.title}`,
    body: `<div class="form-grid">
      ${field('body', 'Update', { type: 'textarea', value: '', placeholder: 'e.g. Vendor has identified the cause; fix rolling out.', full: true })}
      ${field('resolved', 'This update resolves the post', { type: 'checkbox', value: false, full: true })}
    </div>`,
    saveLabel: 'Post update',
    save: (data) => api(`/api/posts/${p.id}/updates`, { method: 'POST', body: data }),
  });
}
