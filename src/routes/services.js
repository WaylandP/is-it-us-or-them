import { Router } from 'express';
import { getProvider } from '../providers/index.js';
import { newId } from '../ids.js';
import { HttpError, bad, str, bool, int, oneOf, httpUrl, strArray } from '../validate.js';
import { STATES } from '../states.js';
import { describeError } from '../providers/util.js';

const OWNERS = ['vendor', 'internal'];

/** Validate the provider-specific config block against the provider's field list. */
export function validateConfig(provider, raw) {
  const cfg = {};
  const input = raw && typeof raw === 'object' ? raw : {};
  for (const f of provider.fields) {
    let v = input[f.key];
    if (v === undefined || v === null || v === '') {
      if (f.required) throw bad(`"${f.label}" is required for ${provider.label}`);
      cfg[f.key] = '';
      continue;
    }
    if (f.type === 'url') v = httpUrl({ v: String(v) }, 'v');
    else if (f.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw bad(`"${f.label}" must be a non-negative number`);
      v = n;
    } else if (f.type === 'select') {
      const allowed = f.options.map((o) => o.value);
      if (!allowed.includes(v)) throw bad(`"${f.label}" must be one of: ${allowed.join(', ')}`);
    } else {
      v = String(v).trim();
      if (v.length > 500) throw bad(`"${f.label}" is too long`);
    }
    cfg[f.key] = v;
  }
  return cfg;
}

export function parseService(body, existing = null) {
  const providerId = str(body, 'provider', { required: !existing, max: 50, fallback: existing?.provider });
  const provider = getProvider(providerId);
  if (!provider) throw bad(`Unknown provider "${providerId}"`);

  return {
    name: str(body, 'name', { required: !existing, max: 100, fallback: existing?.name }),
    provider: providerId,
    owner: oneOf(body, 'owner', OWNERS, { fallback: existing?.owner || provider.defaultOwner }),
    group: str(body, 'group', { max: 60, fallback: existing?.group ?? (provider.defaultOwner === 'vendor' ? 'Vendors' : 'Internal') }),
    description: str(body, 'description', { max: 300, fallback: existing?.description ?? '' }),
    statusPageUrl: body.statusPageUrl === undefined ? existing?.statusPageUrl ?? '' : httpUrl(body, 'statusPageUrl'),
    enabled: bool(body, 'enabled', existing?.enabled ?? true),
    order: int(body, 'order', { fallback: existing?.order ?? 0, min: -1000, max: 100000 }),
    config: validateConfig(provider, body.config === undefined ? existing?.config : body.config),
  };
}

export function serviceRoutes({ store, poller }) {
  const r = Router();

  // Dry-run a configuration without saving it.
  r.post('/api/services/test', async (req, res) => {
    const draft = { id: 'test', ...parseService(req.body) };
    try {
      const status = await poller.check(draft);
      res.json({ ok: true, status });
    } catch (err) {
      res.json({ ok: false, error: describeError(err) });
    }
  });

  // Reorder: body { ids: [...] } in the desired display order. Must precede the /:id routes.
  r.put('/api/services/order', (req, res) => {
    const ids = strArray(req.body, 'ids', { max: 500 });
    const known = new Set(store.list('services').map((s) => s.id));
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) throw bad(`Unknown service id(s): ${unknown.join(', ')}`);
    store.reorder('services', ids);
    res.json(store.list('services'));
  });

  r.post('/api/services', async (req, res) => {
    const now = new Date().toISOString();
    const service = { id: newId(), ...parseService(req.body), createdAt: now, updatedAt: now };
    store.insert('services', service);
    if (service.enabled) poller.poll(service).catch(() => {});
    res.status(201).json(service);
  });

  r.put('/api/services/:id', async (req, res) => {
    const existing = store.get('services', req.params.id);
    if (!existing) throw new HttpError(404, 'Service not found');
    const updated = store.update('services', existing.id, parseService(req.body, existing));
    if (updated.enabled) await poller.poll(updated).catch(() => {});
    else poller.forget(updated.id);
    res.json({ ...updated, status: poller.status(updated.id) });
  });

  // Convenience for manual services: PATCH just the state/message.
  r.patch('/api/services/:id/state', async (req, res) => {
    const existing = store.get('services', req.params.id);
    if (!existing) throw new HttpError(404, 'Service not found');
    if (existing.provider !== 'manual') throw bad('Only manual services can have their state set directly');
    const state = oneOf(req.body, 'state', STATES.filter((s) => s !== 'unknown'), { required: true });
    const message = str(req.body, 'message', { max: 500, fallback: existing.config?.message ?? '' });
    const updated = store.update('services', existing.id, { config: { ...existing.config, state, message } });
    await poller.poll(updated).catch(() => {});
    res.json({ ...updated, status: poller.status(updated.id) });
  });

  r.post('/api/services/:id/refresh', async (req, res) => {
    const existing = store.get('services', req.params.id);
    if (!existing) throw new HttpError(404, 'Service not found');
    const status = await poller.poll(existing);
    res.json({ ...existing, status });
  });

  r.delete('/api/services/:id', (req, res) => {
    const id = req.params.id;
    if (!store.remove('services', id)) throw new HttpError(404, 'Service not found');
    poller.forget(id);
    store.removeHistory(id);
    // Detach from maintenance windows and posts so nothing dangles.
    for (const col of ['maintenance', 'posts']) {
      for (const item of store.list(col)) {
        if (item.services?.includes(id)) store.update(col, item.id, { services: item.services.filter((x) => x !== id) });
      }
    }
    res.status(204).end();
  });

  return r;
}
