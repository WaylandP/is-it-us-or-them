import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function fixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

/** Start a throwaway HTTP server. `routes` maps path -> string | {status, body, type} | fn(req,res). */
export async function mockServer(routes) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const r = routes[url.pathname];
    if (r === undefined) {
      res.writeHead(404).end('nope');
      return;
    }
    if (typeof r === 'function') return r(req, res);
    const { status = 200, body = r, type = 'application/json' } = typeof r === 'object' ? r : {};
    res.writeHead(status, { 'content-type': type }).end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((ok) => server.close(ok)) };
}

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'iuot-'));
}

export const quietLog = { info() {}, warn() {}, error() {} };
