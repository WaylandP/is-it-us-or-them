import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { mockServer, tmpDir, quietLog, fixture } from './helpers.js';

const TOKEN = 'test-token';
let server, base, feeds, app;

const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` };
const call = async (method, path, body, extra = {}) => {
  const res = await fetch(base + path, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { status: res.status, json, text };
};

before(async () => {
  feeds = await mockServer({
    '/api/v2/summary.json': fixture('statuspage-summary.json'),
    '/ok': { body: 'ok', type: 'text/plain' },
  });
  const dir = tmpDir();
  const config = {
    root: path.resolve('.'),
    dataDir: dir,
    adminToken: TOKEN,
    pollIntervalSeconds: 3600,
    fetchTimeoutMs: 2000,
    siteName: 'Test Status',
    orgName: 'IT',
    slackSigningSecret: 'shh',
    seedServices: false,
  };
  app = createApp(config, { log: quietLog });
  server = app.app.listen(0, '127.0.0.1');
  await new Promise((ok) => server.once('listening', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  app.poller.stop();
  await new Promise((ok) => server.close(ok));
  await feeds.close();
});

describe('auth', () => {
  test('writes need the admin token', async () => {
    const r = await call('POST', '/api/services', { name: 'x' }, { authorization: '' });
    assert.equal(r.status, 401);
    const bad = await call('POST', '/api/services', { name: 'x' }, { authorization: 'Bearer nope' });
    assert.equal(bad.status, 401);
    const who = await call('GET', '/api/admin/whoami');
    assert.equal(who.status, 200);
  });
  test('public reads do not', async () => {
    const r = await fetch(`${base}/api/status`);
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.site.name, 'Test Status');
    assert.equal(j.verdict.who, 'none');
    assert.match(j.verdict.detail, /Nothing is being tracked yet/);
  });
});

describe('services', () => {
  let zoom, wiki;

  test('validation errors are 400 with a message', async () => {
    let r = await call('POST', '/api/services', { name: 'Zoom', provider: 'statuspage', config: {} });
    assert.equal(r.status, 400);
    assert.match(r.json.error, /Status page URL.*required/);
    r = await call('POST', '/api/services', { name: 'Zoom', provider: 'nope' });
    assert.equal(r.status, 400);
    r = await call('POST', '/api/services', { provider: 'slack' });
    assert.match(r.json.error, /"name" is required/);
    r = await call('POST', '/api/services', { name: 'x', provider: 'http', config: { url: 'ftp://x' } });
    assert.match(r.json.error, /http\(s\) URL/);
  });

  test('test endpoint checks a feed without saving', async () => {
    const r = await call('POST', '/api/services/test', { name: 'Zoom', provider: 'statuspage', config: { baseUrl: feeds.base } });
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.status.state, 'partial_outage');
    assert.equal((await call('GET', '/api/services')).json.length, 0);

    const dead = await call('POST', '/api/services/test', { name: 'x', provider: 'statuspage', config: { baseUrl: 'http://127.0.0.1:1' } });
    assert.equal(dead.json.ok, false);
    assert.ok(dead.json.error);
  });

  test('add a vendor service and see it polled', async () => {
    const r = await call('POST', '/api/services', {
      name: 'Zoom',
      provider: 'statuspage',
      statusPageUrl: 'https://status.zoom.us/',
      config: { baseUrl: feeds.base },
    });
    assert.equal(r.status, 201);
    zoom = r.json;
    assert.equal(zoom.owner, 'vendor');
    assert.equal(zoom.group, 'Vendors');
    assert.equal(zoom.statusPageUrl, 'https://status.zoom.us');

    // The first poll is kicked off on create; refresh forces a synchronous one.
    const ref = await call('POST', `/api/services/${zoom.id}/refresh`);
    assert.equal(ref.json.status.state, 'partial_outage');

    const snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.verdict.who, 'them');
    assert.deepEqual(snap.verdict.them, ['Zoom']);
    assert.equal(snap.incidents.length, 1);
    assert.equal(snap.maintenance.vendor.length, 1);

    const txt = (await call('GET', '/api/status.txt')).text;
    assert.match(txt, /It's them\./);
    assert.match(txt, /Zoom — Partial outage/);
  });

  test('add an internal http service', async () => {
    const r = await call('POST', '/api/services', { name: 'Wiki', provider: 'http', config: { url: `${feeds.base}/ok` } });
    assert.equal(r.status, 201);
    wiki = r.json;
    assert.equal(wiki.owner, 'internal');
    await call('POST', `/api/services/${wiki.id}/refresh`);
    const snap = (await call('GET', '/api/status')).json;
    const w = snap.services.find((s) => s.id === wiki.id);
    assert.equal(w.state, 'operational');
  });

  test('edit a service (partial update keeps the rest)', async () => {
    const r = await call('PUT', `/api/services/${zoom.id}`, { name: 'Zoom Video', order: 5 });
    assert.equal(r.status, 200);
    assert.equal(r.json.name, 'Zoom Video');
    assert.equal(r.json.order, 5);
    assert.equal(r.json.provider, 'statuspage');
    assert.equal(r.json.config.baseUrl, feeds.base);
    assert.equal(r.json.status.state, 'partial_outage');
  });

  test('disable hides a service from the page', async () => {
    await call('PUT', `/api/services/${zoom.id}`, { enabled: false });
    let snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.services.length, 1);
    assert.equal(snap.verdict.who, 'none');
    await call('PUT', `/api/services/${zoom.id}`, { enabled: true });
    snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.services.length, 2);
  });

  test('manual service state can be patched', async () => {
    const r = await call('POST', '/api/services', { name: 'Printers', provider: 'manual', config: { state: 'operational' } });
    assert.equal(r.status, 201);
    const p = await call('PATCH', `/api/services/${r.json.id}/state`, { state: 'degraded', message: 'Floor 3 offline' });
    assert.equal(p.status, 200);
    assert.equal(p.json.status.state, 'degraded');
    const snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.verdict.who, 'both');
    assert.ok(snap.verdict.us.includes('Printers'));
    const notManual = await call('PATCH', `/api/services/${zoom.id}/state`, { state: 'degraded' });
    assert.equal(notManual.status, 400);
    await call('DELETE', `/api/services/${r.json.id}`);
  });

  test('delete removes the service and detaches it from maintenance/posts', async () => {
    const m = await call('POST', '/api/maintenance', { title: 'Wiki upgrade', services: [wiki.id], startsAt: '2030-01-01T00:00:00Z', endsAt: '2030-01-01T02:00:00Z' });
    assert.equal(m.status, 201);
    const del = await call('DELETE', `/api/services/${wiki.id}`);
    assert.equal(del.status, 204);
    assert.equal((await call('DELETE', `/api/services/${wiki.id}`)).status, 404);
    const after = (await call('GET', '/api/maintenance')).json.find((x) => x.id === m.json.id);
    assert.deepEqual(after.services, []);
    await call('DELETE', `/api/maintenance/${m.json.id}`);
  });
});

describe('maintenance', () => {
  test('active window marks the service as maintenance and "us"', async () => {
    const zoom = (await call('GET', '/api/services')).json[0];
    const now = Date.now();
    const bad = await call('POST', '/api/maintenance', { title: 'x', startsAt: new Date(now).toISOString(), endsAt: new Date(now - 1000).toISOString() });
    assert.equal(bad.status, 400);
    const unknownSvc = await call('POST', '/api/maintenance', { title: 'x', startsAt: new Date(now).toISOString(), services: ['nope'] });
    assert.equal(unknownSvc.status, 400);

    const m = await call('POST', '/api/maintenance', {
      title: 'Zoom SSO change',
      services: [zoom.id],
      startsAt: new Date(now - 60e3).toISOString(),
      endsAt: new Date(now + 3600e3).toISOString(),
    });
    assert.equal(m.status, 201);
    let snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.maintenance.active.length, 1);
    assert.deepEqual(snap.maintenance.active[0].serviceNames, ['Zoom Video']);
    assert.equal(snap.services[0].state, 'maintenance');
    assert.equal(snap.verdict.who, 'us');

    const done = await call('PUT', `/api/maintenance/${m.json.id}`, { status: 'completed' });
    assert.equal(done.json.status, 'completed');
    snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.maintenance.active.length, 0);
    assert.equal(snap.verdict.who, 'them');

    assert.equal((await call('DELETE', `/api/maintenance/${m.json.id}`)).status, 204);
    assert.equal((await call('DELETE', `/api/maintenance/${m.json.id}`)).status, 404);
  });

  test('upcoming windows within two weeks are listed', async () => {
    const soon = await call('POST', '/api/maintenance', { title: 'Soon', startsAt: new Date(Date.now() + 2 * 86400e3).toISOString() });
    const far = await call('POST', '/api/maintenance', { title: 'Far', startsAt: new Date(Date.now() + 40 * 86400e3).toISOString() });
    const snap = (await call('GET', '/api/status')).json;
    assert.deepEqual(snap.maintenance.upcoming.map((m) => m.title), ['Soon']);
    await call('DELETE', `/api/maintenance/${soon.json.id}`);
    await call('DELETE', `/api/maintenance/${far.json.id}`);
  });
});

describe('posts', () => {
  test('announcements, incidents, updates and resolution', async () => {
    const zoom = (await call('GET', '/api/services')).json[0];
    const info = await call('POST', '/api/posts', { title: 'New VPN client', body: 'Install from Self Service. https://example.com', pinned: true });
    assert.equal(info.status, 201);
    assert.equal(info.json.severity, 'info');

    const inc = await call('POST', '/api/posts', { title: 'Zoom SSO broken', severity: 'critical', services: [zoom.id] });
    assert.equal(inc.status, 201);
    let snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.posts.open.length, 2);
    assert.equal(snap.posts.open[0].title, 'New VPN client', 'pinned first');
    assert.equal(snap.services[0].state, 'major_outage');
    assert.equal(snap.services[0].reason.kind, 'post');
    assert.equal(snap.verdict.who, 'us', 'our incident overrides the vendor signal');

    const up = await call('POST', `/api/posts/${inc.json.id}/updates`, { body: 'Fixed the IdP config.', resolved: true });
    assert.equal(up.status, 201);
    assert.equal(up.json.updates.length, 1);
    assert.equal(up.json.resolved, true);
    assert.ok(up.json.resolvedAt);

    snap = (await call('GET', '/api/status')).json;
    assert.equal(snap.posts.open.length, 1);
    assert.equal(snap.posts.recent.length, 1);
    assert.equal(snap.verdict.who, 'them');

    const reopened = await call('PUT', `/api/posts/${inc.json.id}`, { resolved: false });
    assert.equal(reopened.json.resolved, false);
    assert.equal(reopened.json.resolvedAt, null);

    assert.equal((await call('POST', `/api/posts/${inc.json.id}/updates`, { body: '' })).status, 400);
    assert.equal((await call('DELETE', `/api/posts/${inc.json.id}`)).status, 204);
    assert.equal((await call('DELETE', `/api/posts/${info.json.id}`)).status, 204);
    assert.equal((await call('DELETE', `/api/posts/${info.json.id}`)).status, 404);
  });
});

describe('misc', () => {
  test('persistence survives a reload of the store', async () => {
    const { Store } = await import('../src/store.js');
    const reloaded = new Store(path.join(app.store.filePath), { seed: false });
    assert.equal(reloaded.list('services').length, app.store.list('services').length);
    assert.equal(reloaded.list('services')[0].name, 'Zoom Video');
  });

  test('invalid JSON body is a 400', async () => {
    const res = await fetch(`${base}/api/posts`, { method: 'POST', headers, body: '{nope' });
    assert.equal(res.status, 400);
  });

  test('static pages and 404s', async () => {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/admin`)).status, 200);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });

  test('providers are described for the admin form', async () => {
    const r = await call('GET', '/api/providers');
    const ids = r.json.map((p) => p.id);
    assert.deepEqual(ids, ['statuspage', 'slack', 'google', 'rss', 'http', 'manual']);
    assert.ok(r.json.every((p) => Array.isArray(p.fields) && !('check' in p)));
  });

  test('slack slash command verifies signatures and answers', async () => {
    const body = 'token=x&text=zoom&user_name=wayland';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = `v0=${crypto.createHmac('sha256', 'shh').update(`v0:${ts}:${body}`).digest('hex')}`;
    const ok = await fetch(`${base}/slack/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': ts, 'x-slack-signature': sig },
      body,
    });
    assert.equal(ok.status, 200);
    const j = await ok.json();
    assert.equal(j.response_type, 'in_channel');
    assert.match(j.text, /Zoom Video — Partial outage/);

    const forged = await fetch(`${base}/slack/command`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-slack-request-timestamp': ts, 'x-slack-signature': 'v0=bad' },
      body,
    });
    assert.equal(forged.status, 401);
  });
});
