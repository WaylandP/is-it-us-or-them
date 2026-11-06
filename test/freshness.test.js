import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observedStatus, staleAfterSeconds } from '../src/freshness.js';
import { computeVerdict } from '../src/verdict.js';
import { buildSnapshot, renderBrief } from '../src/snapshot.js';
import { snapshotHealth } from '../public/js/snapshot-health.js';

const now = new Date('2026-11-06T12:00:00.000Z');
const status = (age, extra = {}) => ({ state: 'operational', checkedAt: new Date(now - age * 1000).toISOString(), incidents: [], maintenances: [], ...extra });
const service = { id: 's', name: 'Service', owner: 'vendor', provider: 'http', enabled: true };
const verdict = (record, extra = {}) => computeVerdict({ services: [service], statuses: new Map([['s', record]]), maintenance: [], posts: [], now, ...extra });

test('fresh until the exact expiry boundary, then unknown with retained history', () => {
  assert.equal(observedStatus(status(179.999), now).state, 'operational');
  const old = status(180);
  const result = observedStatus(old, now);
  assert.equal(result.state, 'unknown');
  assert.equal(result.freshness, 'stale');
  assert.equal(result.lastKnown.state, 'operational');
  assert.equal(old.state, 'operational', 'reading a snapshot must not mutate observations');
  assert.equal(verdict(old).who, 'unknown');
  assert.equal(verdict(old).counts.stale, 1);
});

test('missing, malformed and future timestamps cannot establish health', () => {
  for (const checkedAt of [undefined, null, '', 0, 'bad date', '2026-11-06T12:01:00Z']) {
    const v = verdict({ state: 'operational', checkedAt });
    assert.equal(v.who, 'unknown');
    assert.equal(v.services[0].freshness, 'invalid');
  }
  assert.equal(verdict(undefined).services[0].freshness, 'pending');
});

test('recent failed attempts never refresh the last successful observation', () => {
  const result = observedStatus(status(0, { state: 'unknown', error: 'failed', lastKnown: status(1000) }), now);
  assert.equal(result.freshness, 'failed');
  assert.equal(result.state, 'unknown');
  assert.equal(result.lastSuccessfulAt, status(1000).checkedAt);
});

test('an old outage is retained as history, not called a current verified outage', () => {
  const result = verdict(status(181, { state: 'major_outage', incidents: [{ title: 'Old incident' }] }));
  assert.equal(result.who, 'unknown');
  assert.equal(result.services[0].lastKnown.state, 'major_outage');
  assert.deepEqual(result.services[0].incidents, []);
});

test('IT maintenance cannot hide a current vendor outage on the same service', () => {
  const result = verdict(status(0, { state: 'major_outage' }), { maintenance: [{ id: 'm', title: 'SSO maintenance', services: ['s'], startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(+now + 1000).toISOString() }] });
  assert.equal(result.who, 'both');
  assert.equal(result.level, 'major_outage');
  assert.equal(result.services[0].state, 'major_outage');
  assert.ok(result.services[0].ours && result.services[0].theirs);
});

test('internal incident remains known while its independent feed is stale', () => {
  const result = verdict(status(181), { posts: [{ id: 'p', title: 'Local issue', severity: 'critical', services: ['s'], resolved: false }] });
  assert.equal(result.who, 'us');
  assert.equal(result.level, 'major_outage');
  assert.equal(result.counts.unknown, 1);
  assert.equal(result.counts.stale, 1);
  assert.match(result.detail, /coverage is incomplete/);
});

test('general critical incidents cannot have green aggregate severity', () => {
  assert.equal(verdict(status(0), { posts: [{ id: 'p', title: 'Office down', severity: 'critical', services: [], resolved: false }] }).level, 'major_outage');
});

test('freshness default scales with polling/timeout and rejects unsafe overrides', () => {
  assert.equal(staleAfterSeconds(), 180);
  assert.equal(staleAfterSeconds({ pollIntervalSeconds: 300 }), 900);
  assert.equal(staleAfterSeconds({ fetchTimeoutMs: 200000 }), 400);
  for (const value of ['bad', -1, 0, 1, Infinity, 86400 * 31]) assert.throws(() => staleAfterSeconds({ statusStaleAfterSeconds: value }));
});

test('JSON, filtered text and Slack-compatible brief use the same stale observation', () => {
  const store = { list: (col) => col === 'services' ? [service] : [] };
  const poller = { statuses: new Map([['s', status(180)]]) };
  const config = { siteName: 'Status', orgName: 'IT', pollIntervalSeconds: 60 };
  const snap = buildSnapshot({ store, poller, config, now });
  assert.equal(snap.verdict.who, 'unknown');
  assert.equal(snap.site.staleAfterSeconds, 180);
  assert.match(renderBrief(snap, { filter: 'service' }), /Stale data/);
  assert.match(renderBrief(snap), /Last known operational/);
  assert.equal(buildSnapshot({ store, poller, config, now: new Date(+now + 1000) }).services[0].checkedAt, snap.services[0].checkedAt);
});

test('browser expiry uses server sample age, not its own wall-clock timestamp', () => {
  const snap = { generatedAt: now.toISOString(), site: { staleAfterSeconds: 180 }, services: [{ freshness: 'fresh', expiresAt: new Date(+now + 5000).toISOString() }] };
  assert.equal(snapshotHealth(snap, 4999), 'current');
  assert.equal(snapshotHealth(snap, 5000), 'stale');
  assert.equal(snapshotHealth(snap, 0, true), 'offline');
  assert.equal(snapshotHealth(snap, 10000, true), 'offline', 'relative-time redraw cannot restore a green banner');
  assert.equal(snapshotHealth(snap, 0, false), 'current', 'a new successful request can recover');
  assert.equal(snapshotHealth({ ...snap, generatedAt: 'bad' }, 0), 'stale');
});

test('untrusted provider links reject executable schemes and credentialed URLs', async () => {
  const { safeHref } = await import('../public/js/snapshot-health.js');
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://example.com\n']) assert.equal(safeHref(url), '');
  assert.equal(safeHref('https://status.example.com/incident/1'), 'https://status.example.com/incident/1');
});
