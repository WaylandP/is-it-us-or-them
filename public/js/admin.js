import { STATE, SEVERITY_LABEL, esc, fmtDate, fmtRange, ago, pill, api, getToken } from './common.js';

const $ = (id) => document.getElementById(id);
let providers = [];
let services = [];
let snapshot = null;

// ---------------------------------------------------------------- auth gate
async function tryToken(token) {
  await api('/api/admin/whoami', { token });
  localStorage.setItem('adminToken', token);
  $('gate').hidden = true;
  $('admin').hidden = false;
  $('signout').hidden = false;
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
if (getToken()) tryToken(getToken()).catch(() => localStorage.removeItem('adminToken'));

// ---------------------------------------------------------------- tabs
document.querySelectorAll('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('active', p.id === `tab-${b.dataset.tab}`));
  }),
);

async function refreshAll() {
  [providers, snapshot] = await Promise.all([api('/api/providers'), api('/api/status')]);
  services = await api('/api/services');
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
}
$('dialog-cancel').addEventListener('click', () => dialog.close());
$('dialog-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('dialog-error').textContent = '';
  $('dialog-save').disabled = true;
  try {
    await onSave?.(formData());
    dialog.close();
    await refreshAll();
  } catch (err) {
    $('dialog-error').textContent = err.message;
  } finally {
    $('dialog-save').disabled = false;
  }
});
$('dialog-test').addEventListener('click', async () => {
  $('dialog-error').textContent = '';
  $('dialog-result').innerHTML = '<div class="notice">Testing…</div>';
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
  if (type === 'checkbox') return `<label class="inline"><input type="checkbox" name="${esc(name)}" ${value ? 'checked' : ''}> ${esc(label)}</label>`;
  return `<label${cls}>${esc(label)}${helpHtml}<input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''}></label>`;
}

function serviceChecks(selected = []) {
  if (!services.length) return '<span class="muted small">No services yet.</span>';
  return `<div class="checks">${services
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

function confirmDelete(what) {
  return window.confirm(`Delete ${what}? This cannot be undone.`);
}

// ---------------------------------------------------------------- services
function statusFor(id) {
  return snapshot?.services.find((s) => s.id === id) || null;
}

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
          ? `${pill(st.state, st.label)}<div class="small muted">${esc(st.reason ? `Our ${st.reason.kind === 'maintenance' ? 'maintenance' : 'incident'}: ${st.reason.title}` : st.error ? `Feed error: ${st.error}` : st.summary || '')}${st.checkedAt ? ` · ${esc(ago(st.checkedAt))}` : ''}</div>`
          : '<span class="muted small">pending</span>';
      return `<tr class="${s.enabled ? '' : 'disabled'}" data-id="${esc(s.id)}">
        <td>${esc(s.order ?? 0)}</td>
        <td><strong>${esc(s.name)}</strong><div class="small muted">${esc(s.group || '')}</div></td>
        <td class="small">${esc(prov?.label.split(' (')[0] || s.provider)}</td>
        <td><span class="tag ${s.owner === 'internal' ? 'us' : 'them'}">${esc(s.owner)}</span></td>
        <td>${status}</td>
        <td><div class="row-actions">
          ${s.provider === 'manual' ? '<button class="small" data-act="state">Set state</button>' : ''}
          <button class="small" data-act="edit">Edit</button>
          <button class="small" data-act="refresh" ${s.enabled ? '' : 'disabled'}>Refresh</button>
          <button class="small" data-act="toggle">${s.enabled ? 'Disable' : 'Enable'}</button>
          <button class="small danger" data-act="delete">Delete</button>
        </div></td></tr>`;
    })
    .join('');
}

$('services-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const s = services.find((x) => x.id === id);
  try {
    switch (btn.dataset.act) {
      case 'edit':
        return serviceDialog(s);
      case 'state':
        return manualStateDialog(s);
      case 'refresh':
        btn.disabled = true;
        await api(`/api/services/${id}/refresh`, { method: 'POST' });
        break;
      case 'toggle':
        await api(`/api/services/${id}`, { method: 'PUT', body: { enabled: !s.enabled } });
        break;
      case 'delete':
        if (!confirmDelete(`"${s.name}"`)) return;
        await api(`/api/services/${id}`, { method: 'DELETE' });
        break;
    }
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

$('add-service').addEventListener('click', () => serviceDialog(null));

function providerFields(provider, config = {}) {
  return `<div class="form-grid full" id="provider-fields">
    <p class="full muted small" style="margin:0">${esc(provider.description)}</p>
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
        { value: 'vendor', label: 'Vendor (problems are "them")' },
        { value: 'internal', label: 'Internal (problems are "us")' },
      ],
    })}
    ${field('group', 'Group', { value: current.group ?? '', placeholder: 'Vendors, Internal, Collaboration…', help: 'Services are grouped under this heading.' })}
    ${field('statusPageUrl', 'Public status page link', { type: 'url', value: current.statusPageUrl || '', placeholder: 'https://status.example.com', help: 'Shown to people as the "more info" link.' })}
    ${field('order', 'Sort order', { type: 'number', value: current.order ?? 0 })}
    ${field('description', 'Description', { value: current.description || '', placeholder: 'One line, optional', full: true })}
    ${field('enabled', 'Enabled (polled and shown on the page)', { type: 'checkbox', value: current.enabled !== false })}
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
      order: Number(data.order) || 0,
      enabled: data.enabled,
      config,
    };
  };

  openDialog({
    title: isNew ? 'Add service' : `Edit ${existing.name}`,
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

  // Swap the provider-specific fields when the provider changes.
  $('dialog-form').querySelector('[name=provider]').addEventListener('change', (e) => {
    const p = providers.find((x) => x.id === e.target.value);
    $('provider-fields').outerHTML = providerFields(p, {});
    const owner = $('dialog-form').querySelector('[name=owner]');
    if (isNew) owner.value = p.defaultOwner;
  });
}

function manualStateDialog(s) {
  const states = Object.keys(STATE).filter((k) => k !== 'unknown');
  openDialog({
    title: `Set state: ${s.name}`,
    body: `<div class="form-grid">
      ${field('state', 'State', { type: 'select', value: s.config?.state || 'operational', options: states.map((k) => ({ value: k, label: STATE[k].label })), full: true })}
      ${field('message', 'Message shown on the page', { value: s.config?.message || '', placeholder: 'e.g. Printers on floor 3 offline, vendor on site', full: true })}
    </div>`,
    saveLabel: 'Update',
    save: (data) => api(`/api/services/${s.id}/state`, { method: 'PATCH', body: data }),
  });
}

// ---------------------------------------------------------------- maintenance
const PHASE_PILL = { active: ['maintenance', 'In progress'], upcoming: ['unknown', 'Scheduled'], completed: ['operational', 'Completed'], cancelled: ['unknown', 'Cancelled'] };

async function renderMaintenance() {
  const items = await api('/api/maintenance');
  const phases = new Map([...snapshot.maintenance.active, ...snapshot.maintenance.upcoming].map((m) => [m.id, m.phase]));
  const phaseOf = (m) => phases.get(m.id) || (m.status === 'cancelled' ? 'cancelled' : m.status === 'in_progress' ? 'active' : new Date(m.startsAt) > new Date() ? 'upcoming' : 'completed');
  const tbody = $('maintenance-table').querySelector('tbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No maintenance windows scheduled.</td></tr>';
    return;
  }
  const nameOf = Object.fromEntries(services.map((s) => [s.id, s.name]));
  tbody.innerHTML = [...items]
    .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
    .map((m) => {
      const ph = phaseOf(m);
      const [cls, label] = PHASE_PILL[ph];
      return `<tr data-id="${esc(m.id)}">
        <td class="small">${esc(fmtRange(m.startsAt, m.endsAt))}</td>
        <td><strong>${esc(m.title)}</strong>${m.description ? `<div class="small muted">${esc(m.description.slice(0, 120))}</div>` : ''}</td>
        <td class="small">${esc(m.services.map((id) => nameOf[id] || '?').join(', ') || '—')}</td>
        <td>${pill(cls, label)}</td>
        <td><div class="row-actions">
          ${ph === 'upcoming' ? '<button class="small" data-act="start">Start now</button>' : ''}
          ${ph === 'active' ? '<button class="small" data-act="complete">Complete</button>' : ''}
          <button class="small" data-act="edit">Edit</button>
          <button class="small danger" data-act="delete">Delete</button>
        </div></td></tr>`;
    })
    .join('');
  tbody.dataset.items = JSON.stringify(items);
}

$('maintenance-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const items = JSON.parse(btn.closest('tbody').dataset.items);
  const m = items.find((x) => x.id === id);
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
    alert(err.message);
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
      ${field('title', 'Title', { value: existing?.title || '', placeholder: 'e.g. VPN firmware upgrade', required: true, full: true })}
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
async function renderPosts() {
  const items = await api('/api/posts');
  const tbody = $('posts-table').querySelector('tbody');
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">Nothing posted yet.</td></tr>';
    return;
  }
  const nameOf = Object.fromEntries(services.map((s) => [s.id, s.name]));
  tbody.innerHTML = [...items]
    .sort((a, b) => Number(a.resolved) - Number(b.resolved) || new Date(b.createdAt) - new Date(a.createdAt))
    .map(
      (p) => `<tr data-id="${esc(p.id)}" class="${p.resolved ? 'disabled' : ''}">
        <td>${pill(p.resolved ? 'operational' : p.severity, p.resolved ? 'Resolved' : SEVERITY_LABEL[p.severity])}${p.pinned ? ' <span class="tag">pinned</span>' : ''}</td>
        <td><strong>${esc(p.title)}</strong>${p.body ? `<div class="small muted">${esc(p.body.slice(0, 140))}</div>` : ''}${p.updates?.length ? `<div class="small muted">${p.updates.length} update(s), latest ${esc(ago(p.updates[0].at))}</div>` : ''}</td>
        <td class="small">${esc(p.services.map((id) => nameOf[id] || '?').join(', ') || '—')}</td>
        <td class="small">${esc(fmtDate(p.createdAt))}</td>
        <td><div class="row-actions">
          <button class="small" data-act="update">Add update</button>
          <button class="small" data-act="resolve">${p.resolved ? 'Reopen' : 'Resolve'}</button>
          <button class="small" data-act="pin">${p.pinned ? 'Unpin' : 'Pin'}</button>
          <button class="small" data-act="edit">Edit</button>
          <button class="small danger" data-act="delete">Delete</button>
        </div></td></tr>`,
    )
    .join('');
  tbody.dataset.items = JSON.stringify(items);
}

$('posts-table').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('tr').dataset.id;
  const items = JSON.parse(btn.closest('tbody').dataset.items);
  const p = items.find((x) => x.id === id);
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
    alert(err.message);
  }
});

$('add-post').addEventListener('click', () => postDialog(null));

function postDialog(existing) {
  const isNew = !existing;
  openDialog({
    title: isNew ? 'New post' : 'Edit post',
    body: `<div class="form-grid">
      ${field('title', 'Title', { value: existing?.title || '', placeholder: 'e.g. Email delivery delays', required: true, full: true })}
      ${field('severity', 'Type', {
        type: 'select',
        value: existing?.severity || 'info',
        options: [
          { value: 'info', label: 'Announcement (informational)' },
          { value: 'warning', label: 'Incident (degraded) — marks services as "us"' },
          { value: 'critical', label: 'Major incident (outage) — marks services as "us"' },
        ],
      })}
      ${field('pinned', 'Pin to the top', { type: 'checkbox', value: existing?.pinned || false })}
      <label class="full">Affected services ${serviceChecks(existing?.services || [])}</label>
      ${field('body', 'Message', { type: 'textarea', value: existing?.body || '', placeholder: 'What people need to know. URLs become links.', full: true })}
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
      ${field('resolved', 'This update resolves the post', { type: 'checkbox', value: false })}
    </div>`,
    saveLabel: 'Post update',
    save: (data) => api(`/api/posts/${p.id}/updates`, { method: 'POST', body: data }),
  });
}
