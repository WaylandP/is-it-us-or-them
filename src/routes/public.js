import { Router } from 'express';
import { buildSnapshot, renderBrief } from '../snapshot.js';
import { describeProviders } from '../providers/index.js';
import { renderBadge } from '../badge.js';

export function publicRoutes({ store, poller, config }) {
  const r = Router();
  const snapshot = () => buildSnapshot({ store, poller, config });

  r.get('/healthz', (_req, res) => res.json({ ok: true, services: store.list('services').length }));

  r.get('/api/status', (_req, res) => {
    res.set('cache-control', 'no-store');
    res.json(snapshot());
  });

  r.get('/api/status.txt', (req, res) => {
    res.set('cache-control', 'no-store');
    res.type('text/plain').send(renderBrief(snapshot(), { filter: String(req.query.q || '') }));
  });

  /**
   * Server-sent events. Pushes a fresh snapshot whenever a poll cycle finishes
   * or an admin changes something, so open pages update within a second.
   */
  r.get('/api/stream', (req, res) => {
    res.set({
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.flushHeaders();

    let timer = null;
    const send = () => {
      timer = null;
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
    };
    const schedule = () => {
      if (!timer) timer = setTimeout(send, 250);
    };
    send();
    store.on('change', schedule);
    poller.on('poll', schedule);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(heartbeat);
      if (timer) clearTimeout(timer);
      store.off('change', schedule);
      poller.off('poll', schedule);
    });
  });

  // Embeddable status badge for wikis and dashboards.
  r.get('/badge.svg', (req, res) => {
    const snap = snapshot();
    res.set('cache-control', 'no-store');
    res.type('image/svg+xml').send(renderBadge(snap, { label: String(req.query.label || 'status') }));
  });

  r.get('/api/providers', (_req, res) => res.json(describeProviders()));

  r.get('/api/services', (_req, res) => res.json(store.list('services')));
  r.get('/api/maintenance', (_req, res) => res.json(store.list('maintenance')));
  r.get('/api/posts', (_req, res) => res.json(store.list('posts')));

  return r;
}
