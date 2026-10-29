import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Store } from '../src/store.js';
import { buildTimeline, availability } from '../src/timeline.js';
import { tmpDir } from './helpers.js';

describe('store history', () => {
  test('collapses repeated states and keeps the first timestamp', () => {
    const store = new Store(path.join(tmpDir(), 'data.json'), { seed: false });
    const a = store.appendHistory('svc', 'operational', '2026-10-28T10:00:00Z');
    const b = store.appendHistory('svc', 'operational', '2026-10-28T11:00:00Z');
    assert.equal(a, b);
    store.appendHistory('svc', 'degraded', '2026-10-28T12:00:00Z');
    store.appendHistory('other', 'operational', '2026-10-28T12:00:00Z');
    assert.equal(store.historyFor('svc').length, 2);
    assert.equal(store.historyFor('other').length, 1);
    store.removeHistory('svc');
    assert.equal(store.historyFor('svc').length, 0);
    assert.equal(store.historyFor('other').length, 1);
  });

  test('prunes old entries but keeps the newest pre-cutoff entry per service', () => {
    const store = new Store(path.join(tmpDir(), 'data.json'), { seed: false });
    const now = Date.parse('2026-10-28T00:00:00Z');
    const day = 86400e3;
    store.data.history = [
      { serviceId: 'a', state: 'operational', at: new Date(now - 200 * day).toISOString() },
      { serviceId: 'a', state: 'degraded', at: new Date(now - 120 * day).toISOString() },
      { serviceId: 'a', state: 'operational', at: new Date(now - 10 * day).toISOString() },
      { serviceId: 'b', state: 'operational', at: new Date(now - 150 * day).toISOString() },
    ];
    store.pruneHistory(now);
    assert.deepEqual(
      store.data.history.map((e) => `${e.serviceId}:${e.state}`),
      ['a:degraded', 'a:operational', 'b:operational'],
    );
  });

  test('reorder sets order by position', () => {
    const store = new Store(path.join(tmpDir(), 'data.json'), { seed: false });
    store.insert('services', { id: 'x', name: 'X', order: 0 });
    store.insert('services', { id: 'y', name: 'Y', order: 1 });
    store.insert('services', { id: 'z', name: 'Z', order: 2 });
    let changes = 0;
    store.on('change', () => changes++);
    assert.equal(store.reorder('services', ['z', 'x', 'y']), true);
    assert.deepEqual(Object.fromEntries(store.list('services').map((s) => [s.id, s.order])), { x: 1, y: 2, z: 0 });
    assert.equal(store.reorder('services', ['z', 'x', 'y']), false, 'no-op when already in order');
    assert.equal(changes, 1);
  });
});

describe('buildTimeline', () => {
  const now = new Date('2026-10-28T12:00:00Z');

  test('empty history is all null', () => {
    const t = buildTimeline([], now, { hours: 24, slots: 4 });
    assert.deepEqual(t.slots, [null, null, null, null]);
    assert.equal(t.slotMinutes, 360);
    assert.equal(availability(t), null);
  });

  test('state carries forward and the worst state within a slot wins', () => {
    const events = [
      { state: 'operational', at: '2026-10-27T06:00:00Z' }, // before window start (window: 27T12:00 -> 28T12:00)
      { state: 'major_outage', at: '2026-10-27T20:00:00Z' }, // in slot 1 (18:00-00:00)
      { state: 'operational', at: '2026-10-27T21:00:00Z' }, // still slot 1
      { state: 'degraded', at: '2026-10-28T09:00:00Z' }, // slot 3 (06:00-12:00)
    ];
    const t = buildTimeline(events, now, { hours: 24, slots: 4 });
    assert.deepEqual(t.slots, ['operational', 'major_outage', 'operational', 'degraded']);
    assert.equal(availability(t), 50);
  });

  test('history that starts mid-window leaves earlier slots null', () => {
    const t = buildTimeline([{ state: 'unknown', at: '2026-10-28T03:00:00Z' }, { state: 'operational', at: '2026-10-28T07:00:00Z' }], now, { hours: 24, slots: 4 });
    assert.deepEqual(t.slots, [null, null, 'unknown', 'operational']);
    assert.equal(availability(t), 100, 'unknown slots are not counted');
  });

  test('a known state beats unknown in the same slot', () => {
    const t = buildTimeline([{ state: 'unknown', at: '2026-10-28T06:30:00Z' }, { state: 'operational', at: '2026-10-28T07:00:00Z' }], now, { hours: 24, slots: 4 });
    assert.equal(t.slots[3], 'operational');
  });
});
