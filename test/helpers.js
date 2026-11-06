import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
export function fixture(name) { return fs.readFileSync(path.join(fixturesDir, name), 'utf8'); }

/** Local fixtures get explicit, exact network approvals, never a production bypass. */
export async function mockServer(routes) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const r = routes[url.pathname];
    if (r === undefined) { res.writeHead(404).end('nope'); return; }
    if (typeof r === 'function') return r(req, res);
    const { status = 200, body = r, type = 'application/json' } = typeof r === 'object' ? r : {};
    res.writeHead(status, { 'content-type': type }).end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  const targets = JSON.parse(process.env.CHECK_ALLOWED_TARGETS || '{}');
  const previous = targets[base];
  process.env.CHECK_ALLOWED_TARGETS = JSON.stringify({ ...targets, [base]: ['127.0.0.1/32'] });
  return { base, close: async () => {
    await new Promise((ok) => server.close(ok));
    const current = JSON.parse(process.env.CHECK_ALLOWED_TARGETS || '{}');
    if (previous) current[base] = previous; else delete current[base];
    if (Object.keys(current).length) process.env.CHECK_ALLOWED_TARGETS = JSON.stringify(current);
    else delete process.env.CHECK_ALLOWED_TARGETS;
  } };
}
export function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'iuot-')); }
export const quietLog = { info() {}, warn() {}, error() {} };
