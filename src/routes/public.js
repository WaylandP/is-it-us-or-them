import { Router } from 'express';
import { buildSnapshot, renderBrief } from '../snapshot.js';
import { describeProviders } from '../providers/index.js';

export function publicRoutes({ store, poller, config }) {
  const r = Router();

  r.get('/healthz', (_req, res) => res.json({ ok: true, services: store.list('services').length }));

  r.get('/api/status', (_req, res) => {
    res.set('cache-control', 'no-store');
    res.json(buildSnapshot({ store, poller, config }));
  });

  r.get('/api/status.txt', (req, res) => {
    const snap = buildSnapshot({ store, poller, config });
    res.set('cache-control', 'no-store');
    res.type('text/plain').send(renderBrief(snap, { filter: String(req.query.q || '') }));
  });

  r.get('/api/providers', (_req, res) => res.json(describeProviders()));

  r.get('/api/services', (_req, res) => res.json(store.list('services')));
  r.get('/api/maintenance', (_req, res) => res.json(store.list('maintenance')));
  r.get('/api/posts', (_req, res) => res.json(store.list('posts')));

  return r;
}
