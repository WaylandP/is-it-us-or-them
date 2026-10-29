import { Router } from 'express';
import { newId } from '../ids.js';
import { HttpError, bad, str, bool, oneOf, strArray } from '../validate.js';

const SEVERITIES = ['info', 'warning', 'critical'];

function knownServices(store, ids) {
  const known = new Set(store.list('services').map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw bad(`Unknown service id(s): ${unknown.join(', ')}`);
  return ids;
}

export function parsePost(body, store, existing = null) {
  const resolved = bool(body, 'resolved', existing?.resolved ?? false);
  return {
    title: str(body, 'title', { required: !existing, max: 200, fallback: existing?.title }),
    body: str(body, 'body', { max: 10000, fallback: existing?.body ?? '' }),
    severity: oneOf(body, 'severity', SEVERITIES, { fallback: existing?.severity || 'info' }),
    services: body.services === undefined ? existing?.services ?? [] : knownServices(store, strArray(body, 'services')),
    pinned: bool(body, 'pinned', existing?.pinned ?? false),
    resolved,
    resolvedAt: resolved ? existing?.resolvedAt || new Date().toISOString() : null,
  };
}

export function postRoutes({ store }) {
  const r = Router();

  r.post('/api/posts', (req, res) => {
    const now = new Date().toISOString();
    const item = { id: newId(), ...parsePost(req.body, store), updates: [], createdAt: now, updatedAt: now };
    store.insert('posts', item);
    res.status(201).json(item);
  });

  r.put('/api/posts/:id', (req, res) => {
    const existing = store.get('posts', req.params.id);
    if (!existing) throw new HttpError(404, 'Post not found');
    res.json(store.update('posts', existing.id, parsePost(req.body, store, existing)));
  });

  // Append a timeline update to a post (e.g. "Vendor has identified the cause").
  r.post('/api/posts/:id/updates', (req, res) => {
    const existing = store.get('posts', req.params.id);
    if (!existing) throw new HttpError(404, 'Post not found');
    const text = str(req.body, 'body', { required: true, max: 5000 });
    const update = { id: newId(), at: new Date().toISOString(), body: text };
    const patch = { updates: [update, ...(existing.updates || [])] };
    if (req.body.resolved !== undefined) {
      patch.resolved = bool(req.body, 'resolved');
      patch.resolvedAt = patch.resolved ? existing.resolvedAt || update.at : null;
    }
    res.status(201).json(store.update('posts', existing.id, patch));
  });

  r.delete('/api/posts/:id', (req, res) => {
    if (!store.remove('posts', req.params.id)) throw new HttpError(404, 'Post not found');
    res.status(204).end();
  });

  return r;
}
