import { Router } from 'express';
import { newId } from '../ids.js';
import { HttpError, bad, str, oneOf, isoDate, strArray } from '../validate.js';

const STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'];

function knownServices(store, ids) {
  const known = new Set(store.list('services').map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw bad(`Unknown service id(s): ${unknown.join(', ')}`);
  return ids;
}

export function parseMaintenance(body, store, existing = null) {
  const startsAt = isoDate(body, 'startsAt', { required: !existing }) ?? existing?.startsAt;
  const endsAt = isoDate(body, 'endsAt') ?? (body.endsAt === undefined ? existing?.endsAt ?? null : null);
  if (endsAt && new Date(endsAt) < new Date(startsAt)) throw bad('"endsAt" must be after "startsAt"');
  return {
    title: str(body, 'title', { required: !existing, max: 200, fallback: existing?.title }),
    description: str(body, 'description', { max: 5000, fallback: existing?.description ?? '' }),
    services: body.services === undefined ? existing?.services ?? [] : knownServices(store, strArray(body, 'services')),
    startsAt,
    endsAt,
    status: oneOf(body, 'status', STATUSES, { fallback: existing?.status || 'scheduled' }),
  };
}

export function maintenanceRoutes({ store }) {
  const r = Router();

  r.post('/api/maintenance', (req, res) => {
    const now = new Date().toISOString();
    const item = { id: newId(), ...parseMaintenance(req.body, store), createdAt: now, updatedAt: now };
    store.insert('maintenance', item);
    res.status(201).json(item);
  });

  r.put('/api/maintenance/:id', (req, res) => {
    const existing = store.get('maintenance', req.params.id);
    if (!existing) throw new HttpError(404, 'Maintenance window not found');
    res.json(store.update('maintenance', existing.id, parseMaintenance(req.body, store, existing)));
  });

  r.delete('/api/maintenance/:id', (req, res) => {
    if (!store.remove('maintenance', req.params.id)) throw new HttpError(404, 'Maintenance window not found');
    res.status(204).end();
  });

  return r;
}
