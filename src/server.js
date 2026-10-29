import { config } from './config.js';
import { createApp } from './app.js';

const { app, poller, store } = createApp(config);
poller.start();

const server = app.listen(config.port, () => {
  console.log(`${config.siteName} listening on http://localhost:${config.port}`);
  console.log(`Tracking ${store.list('services').length} service(s); polling every ${config.pollIntervalSeconds}s. Admin: /admin`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    poller.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
