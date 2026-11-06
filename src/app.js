import path from 'node:path';
import express from 'express';
import { Store } from './store.js';
import { Poller } from './poller.js';
import { requireAdmin, resolveAdminToken } from './auth.js';
import { publicRoutes } from './routes/public.js';
import { serviceRoutes } from './routes/services.js';
import { maintenanceRoutes } from './routes/maintenance.js';
import { postRoutes } from './routes/posts.js';
import { slackRoutes } from './routes/slack.js';
import { HttpError } from './validate.js';
import { policyFromEnvironment } from './check-network.js';
import { staleAfterSeconds } from './freshness.js';

/** App factory also validates operator-controlled security settings at startup. */
export function createApp(config, { log = console, store, poller } = {}) {
  policyFromEnvironment();
  staleAfterSeconds(config);
  store ||= new Store(path.join(config.dataDir, 'data.json'), { seed: config.seedServices });
  poller ||= new Poller(store, { intervalSeconds: config.pollIntervalSeconds, timeoutMs: config.fetchTimeoutMs, log });
  const adminToken = resolveAdminToken(config.adminToken, log);
  const guard = requireAdmin(adminToken);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const ctx = { store, poller, config };

  // Configuration is not public status data. Protect GET and HEAD before the read router.
  app.use('/api/services', (req, res, next) => ['GET', 'HEAD'].includes(req.method) ? guard(req, res, next) : next());
  app.use('/api', (_req, res, next) => { res.set('cache-control', 'no-store'); next(); });
  app.use(publicRoutes(ctx));
  app.use(slackRoutes(ctx));
  app.use('/api', (req, res, next) => ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : guard(req, res, next));
  app.use(serviceRoutes(ctx));
  app.use(maintenanceRoutes(ctx));
  app.use(postRoutes(ctx));
  app.get('/api/admin/whoami', guard, (_req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(config.root, 'public'), { extensions: ['html'] }));
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
    res.status(404).type('text/plain').send('Not found');
  });
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    log.error?.(err);
    res.status(500).json({ error: 'Internal error' });
  });
  return { app, store, poller, adminToken };
}
