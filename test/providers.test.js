import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { providers } from '../src/providers/index.js';
import { parseFeedItems } from '../src/providers/rss.js';
import { fixture, mockServer } from './helpers.js';

const ctx = { timeoutMs: 2000, now: new Date('2026-10-28T20:00:00Z') };
let srv;

before(async () => {
  srv = await mockServer({
    '/api/v2/summary.json': fixture('statuspage-summary.json'),
    '/slack/current': fixture('slack-current.json'),
    '/slack/ok': fixture('slack-ok.json'),
    '/google/incidents.json': fixture('google-incidents.json'),
    '/feed.rss': { body: fixture('feed.rss').replace('__RECENT__', new Date(Date.now() - 3600e3).toUTCString()), type: 'application/rss+xml' },
    '/ok': { body: 'hi', type: 'text/plain' },
    '/slow': (_req, res) => setTimeout(() => res.end('late'), 300),
    '/broken': { status: 503, body: 'down', type: 'text/plain' },
    '/html': { body: '<html></html>', type: 'text/html' },
  });
});
after(() => srv.close());

describe('statuspage provider', () => {
  test('page-wide indicator and incidents', async () => {
    const r = await providers.statuspage.check({ name: 'Zoom', config: { baseUrl: srv.base } }, ctx);
    assert.equal(r.state, 'partial_outage');
    assert.equal(r.summary, 'Partial System Outage');
    assert.equal(r.incidents.length, 1);
    assert.equal(r.incidents[0].title, 'Zoom Phone call quality degraded in EMEA');
    assert.equal(r.incidents[0].impact, 'major');
    assert.equal(r.incidents[0].latestUpdate, 'We have identified the cause and are rolling out a fix.');
    assert.deepEqual(r.incidents[0].components, ['Zoom Phone']);
    assert.equal(r.maintenances.length, 1);
    assert.equal(r.maintenances[0].startsAt, '2026-11-02T02:00:00.000Z');
  });

  test('component filter narrows state and incidents', async () => {
    const ok = await providers.statuspage.check({ name: 'Zoom', config: { baseUrl: srv.base, components: 'Zoom Meetings, zoom webinars' } }, ctx);
    assert.equal(ok.state, 'operational');
    assert.equal(ok.incidents.length, 0);
    assert.equal(ok.maintenances.length, 1, 'maintenance on a watched component is kept');

    const bad = await providers.statuspage.check({ name: 'Zoom', config: { baseUrl: srv.base, components: 'Zoom Phone' } }, ctx);
    assert.equal(bad.state, 'partial_outage');
    assert.equal(bad.incidents.length, 1);
    assert.equal(bad.maintenances.length, 0);
  });

  test('unknown component name is an error', async () => {
    await assert.rejects(providers.statuspage.check({ name: 'Zoom', config: { baseUrl: srv.base, components: 'Nope' } }, ctx), /No components named/);
  });

  test('non-JSON response is an error', async () => {
    await assert.rejects(providers.statuspage.check({ name: 'x', config: { baseUrl: `${srv.base}/html` } }, ctx), /HTTP 404|not JSON/);
  });
});

describe('slack provider', () => {
  test('active incident', async () => {
    const r = await providers.slack.check({ name: 'Slack', config: { apiUrl: `${srv.base}/slack/current` } }, ctx);
    assert.equal(r.state, 'degraded');
    assert.equal(r.incidents.length, 1);
    assert.equal(r.incidents[0].title, 'Trouble sending messages');
    assert.deepEqual(r.incidents[0].components, ['Messaging', 'Notifications']);
    assert.match(r.incidents[0].latestUpdate, /seeing improvement/);
  });
  test('all ok', async () => {
    const r = await providers.slack.check({ name: 'Slack', config: { apiUrl: `${srv.base}/slack/ok` } }, ctx);
    assert.equal(r.state, 'operational');
    assert.equal(r.incidents.length, 0);
  });
});

describe('google provider', () => {
  test('open incidents only, worst state wins', async () => {
    const r = await providers.google.check({ name: 'G', config: { feedUrl: `${srv.base}/google/incidents.json` } }, ctx);
    assert.equal(r.state, 'major_outage');
    assert.equal(r.incidents.length, 2);
    const meet = r.incidents.find((i) => i.title.startsWith('Google Meet'));
    assert.equal(meet.url, `${srv.base}/google/incidents/open1`);
    assert.equal(meet.latestUpdate, 'We are investigating reports of an issue with Google Meet.');
    assert.match(r.summary, /2 open incidents affecting Google Meet, Google Drive/);
  });
  test('product filter', async () => {
    const r = await providers.google.check({ name: 'G', config: { feedUrl: `${srv.base}/google/incidents.json`, products: 'Gmail, Google Drive' } }, ctx);
    assert.equal(r.state, 'degraded');
    assert.equal(r.incidents.length, 1);
    assert.equal(r.incidents[0].title, 'Google Drive slow file uploads');
    const none = await providers.google.check({ name: 'G', config: { feedUrl: `${srv.base}/google/incidents.json`, products: 'Gmail' } }, ctx);
    assert.equal(none.state, 'operational');
  });
});

describe('rss provider', () => {
  test('parses RSS items with CDATA and HTML', () => {
    const items = parseFeedItems(fixture('feed.rss').replace('__RECENT__', 'Wed, 28 Oct 2026 19:00:00 GMT'));
    assert.equal(items.length, 2);
    assert.equal(items[0].title, 'Elevated API errors');
    assert.equal(items[0].link, 'https://status.example.com/i/1');
    assert.equal(items[0].description, 'We are investigating elevated errors.');
    assert.equal(items[0].publishedAt, '2026-10-28T19:00:00.000Z');
  });
  test('parses Atom entries', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Hi</title><link href="https://a/b"/><updated>2026-10-28T19:00:00Z</updated><summary>s</summary></entry></feed>`;
    const items = parseFeedItems(atom);
    assert.equal(items.length, 1);
    assert.equal(items[0].link, 'https://a/b');
  });
  test('recent item marks degraded; window respected', async () => {
    const recent = await providers.rss.check({ name: 'R', config: { feedUrl: `${srv.base}/feed.rss` } }, { ...ctx, now: new Date() });
    assert.equal(recent.state, 'degraded');
    assert.equal(recent.incidents.length, 1);
    const tiny = await providers.rss.check({ name: 'R', config: { feedUrl: `${srv.base}/feed.rss`, windowHours: 0.1 } }, { ...ctx, now: new Date() });
    assert.equal(tiny.state, 'operational');
  });
});

describe('http provider', () => {
  test('2xx is operational with latency', async () => {
    const r = await providers.http.check({ name: 'Wiki', config: { url: `${srv.base}/ok` } }, ctx);
    assert.equal(r.state, 'operational');
    assert.ok(r.latencyMs >= 0);
  });
  test('5xx is a major outage with an incident', async () => {
    const r = await providers.http.check({ name: 'Wiki', config: { url: `${srv.base}/broken` } }, ctx);
    assert.equal(r.state, 'major_outage');
    assert.equal(r.incidents[0].title, 'Wiki returned HTTP 503');
  });
  test('expected status code', async () => {
    const r = await providers.http.check({ name: 'Wiki', config: { url: `${srv.base}/broken`, expectStatus: 503 } }, ctx);
    assert.equal(r.state, 'operational');
  });
  test('slow response is degraded', async () => {
    const r = await providers.http.check({ name: 'Wiki', config: { url: `${srv.base}/slow`, degradedAfterMs: 50 } }, ctx);
    assert.equal(r.state, 'degraded');
  });
  test('unreachable host', async () => {
    const r = await providers.http.check({ name: 'Wiki', config: { url: 'http://127.0.0.1:1/' } }, ctx);
    assert.equal(r.state, 'major_outage');
    assert.match(r.summary, /Unreachable/);
  });
});

describe('manual provider', () => {
  test('reflects configured state and message', async () => {
    const r = await providers.manual.check({ name: 'Printers', config: { state: 'degraded', message: 'Floor 3 printers offline' }, updatedAt: '2026-10-28T10:00:00Z' }, ctx);
    assert.equal(r.state, 'degraded');
    assert.equal(r.incidents[0].title, 'Floor 3 printers offline');
    const ok = await providers.manual.check({ name: 'Printers', config: { state: 'operational' } }, ctx);
    assert.equal(ok.state, 'operational');
    assert.equal(ok.incidents.length, 0);
  });
});
