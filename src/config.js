import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function num(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  root,
  port: num('PORT', 3000),
  dataDir: process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data'),
  adminToken: process.env.ADMIN_TOKEN || '',
  pollIntervalSeconds: num('POLL_INTERVAL_SECONDS', 60),
  fetchTimeoutMs: num('FETCH_TIMEOUT_MS', 10000),
  siteName: process.env.SITE_NAME || 'Is it us or them?',
  orgName: process.env.ORG_NAME || 'IT',
  slackSigningSecret: process.env.SLACK_SIGNING_SECRET || '',
  seedServices: process.env.SEED_SERVICES !== 'false',
};
