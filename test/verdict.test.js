import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeVerdict, maintenancePhase, joinNames } from '../src/verdict.js';
import { renderBrief, buildSnapshot } from '../src/snapshot.js';

const now = new Date('2026-10-28T20:00:00Z');
const svc = (id, name, owner = 'vendor', extra = {}) => ({ id, name, owner, provider: 'manual', enabled: true, order: 0, ...extra });
const status = (state, summary = '') => ({ state, summary, incidents: [], maintenances: [], checkedAt: now.toISOString(), since: now.toISOString() });

describe('computeVerdict', () => {
  test('all clear', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google'), svc('s', 'Slack')],
      statuses: new Map([['g', status('operational')], ['s', status('operational')]]),
      maintenance: [],
      posts: [],
      now,
    });
    assert.equal(v.who, 'none');
    assert.equal(v.headline, 'All clear.');
    assert.equal(v.level, 'operational');
    assert.equal(v.counts.total, 2);
  });

  test('vendor outage is "them"', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google'), svc('s', 'Slack')],
      statuses: new Map([['g', status('major_outage')], ['s', status('operational')]]),
      maintenance: [],
      posts: [],
      now,
    });
    assert.equal(v.who, 'them');
    assert.deepEqual(v.them, ['Google']);
    assert.equal(v.level, 'major_outage');
    assert.match(v.detail, /Google is having problems on the vendor side/);
  });

  test('internal service outage is "us"', () => {
    const v = computeVerdict({
      services: [svc('v', 'VPN', 'internal')],
      statuses: new Map([['v', status('major_outage')]]),
      maintenance: [],
      posts: [],
      now,
    });
    assert.equal(v.who, 'us');
    assert.deepEqual(v.us, ['VPN']);
    assert.match(v.detail, /VPN has an internal issue/);
  });

  test('active maintenance overrides the feed and is "us"', () => {
    const v = computeVerdict({
      services: [svc('v', 'VPN', 'internal')],
      statuses: new Map([['v', status('operational')]]),
      maintenance: [{ id: 'm', title: 'Firewall upgrade', services: ['v'], startsAt: '2026-10-28T19:00:00Z', endsAt: '2026-10-28T21:00:00Z', status: 'scheduled' }],
      posts: [],
      now,
    });
    assert.equal(v.who, 'us');
    assert.equal(v.services[0].state, 'maintenance');
    assert.equal(v.services[0].reason.kind, 'maintenance');
    assert.match(v.detail, /under scheduled maintenance/);
  });

  test('upcoming maintenance does not change anything yet', () => {
    const v = computeVerdict({
      services: [svc('v', 'VPN', 'internal')],
      statuses: new Map([['v', status('operational')]]),
      maintenance: [{ id: 'm', title: 'Later', services: ['v'], startsAt: '2026-10-29T19:00:00Z', endsAt: '2026-10-29T21:00:00Z', status: 'scheduled' }],
      posts: [],
      now,
    });
    assert.equal(v.who, 'none');
  });

  test('internal incident post on a vendor service makes it "us", not "them"', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google')],
      statuses: new Map([['g', status('operational')]]),
      maintenance: [],
      posts: [{ id: 'p', title: 'SSO misconfiguration blocks Gmail', severity: 'critical', services: ['g'], resolved: false }],
      now,
    });
    assert.equal(v.who, 'us');
    assert.equal(v.services[0].state, 'major_outage');
    assert.equal(v.services[0].reason.kind, 'post');
  });

  test('both', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google'), svc('v', 'VPN', 'internal')],
      statuses: new Map([['g', status('degraded')], ['v', status('major_outage')]]),
      maintenance: [],
      posts: [],
      now,
    });
    assert.equal(v.who, 'both');
    assert.equal(v.headline, "It's both.");
  });

  test('general incident post with no services still counts as "us"', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google')],
      statuses: new Map([['g', status('operational')]]),
      maintenance: [],
      posts: [{ id: 'p', title: 'Office Wi-Fi down', severity: 'warning', services: [], resolved: false }],
      now,
    });
    assert.equal(v.who, 'us');
    assert.match(v.detail, /Open incident: Office Wi-Fi down/);
  });

  test('resolved posts and info posts are ignored', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google')],
      statuses: new Map([['g', status('operational')]]),
      maintenance: [],
      posts: [
        { id: 'p1', title: 'x', severity: 'critical', services: ['g'], resolved: true },
        { id: 'p2', title: 'y', severity: 'info', services: ['g'], resolved: false },
      ],
      now,
    });
    assert.equal(v.who, 'none');
  });

  test('unknown feeds are reported but not alarming; disabled services hidden', () => {
    const v = computeVerdict({
      services: [svc('g', 'Google'), svc('z', 'Zoom', 'vendor', { enabled: false })],
      statuses: new Map(),
      maintenance: [],
      posts: [],
      now,
    });
    assert.equal(v.who, 'none');
    assert.equal(v.counts.total, 1);
    assert.equal(v.counts.unknown, 1);
    assert.match(v.detail, /1 feed could not be read yet/);
  });
});

describe('maintenancePhase', () => {
  const m = { startsAt: '2026-10-28T19:00:00Z', endsAt: '2026-10-28T21:00:00Z', status: 'scheduled' };
  test('by time', () => {
    assert.equal(maintenancePhase(m, new Date('2026-10-28T18:00:00Z')), 'upcoming');
    assert.equal(maintenancePhase(m, new Date('2026-10-28T20:00:00Z')), 'active');
    assert.equal(maintenancePhase(m, new Date('2026-10-28T22:00:00Z')), 'completed');
  });
  test('explicit status wins', () => {
    assert.equal(maintenancePhase({ ...m, status: 'cancelled' }, now), 'cancelled');
    assert.equal(maintenancePhase({ ...m, status: 'completed' }, now), 'completed');
    assert.equal(maintenancePhase({ ...m, status: 'in_progress', startsAt: '2026-10-29T00:00:00Z', endsAt: '2026-10-29T01:00:00Z' }, now), 'active');
  });
  test('no end defaults to one hour', () => {
    assert.equal(maintenancePhase({ startsAt: '2026-10-28T19:30:00Z', status: 'scheduled' }, now), 'active');
    assert.equal(maintenancePhase({ startsAt: '2026-10-28T18:30:00Z', status: 'scheduled' }, now), 'completed');
  });
});

test('joinNames', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['A']), 'A');
  assert.equal(joinNames(['A', 'B']), 'A and B');
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B, and C');
});

test('renderBrief', () => {
  const store = {
    historyFor: (id) => (id === 'g' ? [{ state: 'degraded', at: '2026-10-28T18:00:00Z' }] : []),
    list: (col) =>
      ({
        services: [svc('g', 'Google'), svc('v', 'VPN', 'internal')],
        maintenance: [{ id: 'm', title: 'Patch night', services: ['v'], startsAt: '2026-10-29T02:00:00Z', endsAt: '2026-10-29T04:00:00Z', status: 'scheduled' }],
        posts: [{ id: 'p', title: 'New laptop policy', body: '', severity: 'info', services: [], pinned: true, resolved: false, createdAt: now.toISOString() }],
      })[col],
  };
  const poller = { statuses: new Map([['g', { ...status('degraded', 'Elevated error rates'), incidents: [{ title: 'Gmail delays', url: 'https://g/1' }] }], ['v', status('operational')]]) };
  const snap = buildSnapshot({ store, poller, config: { siteName: 'Status', orgName: 'IT', pollIntervalSeconds: 60 }, now });
  assert.equal(snap.services.find((s) => s.id === 'g').timeline.slots.at(-1), 'degraded');
  const text = renderBrief(snap);
  assert.match(text, /It's them\./);
  assert.match(text, /⚠️ Google — Degraded performance — Elevated error rates/);
  assert.match(text, /• Gmail delays https:\/\/g\/1/);
  assert.match(text, /Upcoming maintenance:\n {2}📅 2026-10-29 02:00 UTC — Patch night/);
  assert.match(text, /From IT:\n {2}ℹ️ New laptop policy/);

  const filtered = renderBrief(snap, { filter: 'vpn' });
  assert.match(filtered, /✅ VPN — Operational/);
  assert.doesNotMatch(filtered, /Google/);
  assert.match(renderBrief(snap, { filter: 'zoom' }), /Nothing tracked matches "zoom"/);
});
