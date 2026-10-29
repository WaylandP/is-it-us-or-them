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

/**
 * Build the Express app. Exported separately from server.js so tests can
 * spin up an instance with a temp data file and no network.
 */
export function createApp(config, { log = console, store, poller } = {}) {
  store ||= new Store(path.join(config.dataDir, 'data.json'), { seed: config.seedServices });
  poller ||= new Poller(store, { intervalSeconds: config.pollIntervalSeconds, timeoutMs: config.fetchTimeoutMs, log });
  const adminToken = resolveAdminToken(config.adminToken, log);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '256kb' }));

  const ctx = { store, poller, config };

  app.use(publicRoutes(ctx));
  app.use(slackRoutes(ctx));

  // Reads are public; anything under /api that writes requires the admin token.
  const guard = requireAdmin(adminToken);
  app.use('/api', (req, res, next) => (['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? next() : guard(req, res, next)));
  app.use(serviceRoutes(ctx));
  app.use(maintenanceRoutes(ctx));
  app.use(postRoutes(ctx));

  // Lets the admin page check a token before showing the forms.
  app.get('/api/admin/whoami', requireAdmin(adminToken), (_req, res) => res.json({ ok: true }));

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
