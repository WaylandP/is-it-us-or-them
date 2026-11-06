import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Poller } from '../src/poller.js';

const quiet = { info() {}, warn() {} };
const service = () => ({ id: 's', name: 'Service', provider: 'manual', enabled: true, config: { state: 'operational' }, updatedAt: '2026-11-06T12:00:00Z' });
function harness() {
  let services = [service()];
  const poller = new Poller({ list: () => services }, { log: quiet });
  return { poller, get: () => services[0], set: (list) => { services = list; } };
}
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const observed = (state = 'operational') => ({ state, checkedAt: new Date().toISOString(), lastSuccessfulAt: new Date().toISOString(), error: null, incidents: [], maintenances: [] });

test('successful timestamp is recorded on completion, not when a check began', async () => {
  const { poller, get } = harness();
  const finished = new Date('2026-11-06T12:00:03Z');
  poller.clock = () => finished;
  const result = await poller.check(get(), new Date('2026-11-06T12:00:00Z'));
  assert.equal(result.checkedAt, finished.toISOString());
  assert.equal(result.lastSuccessfulAt, result.checkedAt);
  assert.notEqual(result.checkStartedAt, result.checkedAt);
});

for (const action of ['delete', 'disable', 'stop']) test(`late checks cannot resurrect status after ${action}`, async () => {
  const { poller, get, set } = harness();
  const pending = deferred();
  poller.check = () => pending.promise;
  const request = poller.poll(get());
  if (action === 'delete') { set([]); poller.forget('s'); }
  if (action === 'disable') { set([{ ...get(), enabled: false }]); poller.forget('s'); }
  if (action === 'stop') poller.stop();
  pending.resolve(observed());
  await request;
  assert.equal(poller.status('s'), null);
});

test('an older configuration result cannot overwrite a new check', async () => {
  const { poller, get, set } = harness();
  const old = deferred();
  let calls = 0;
  poller.check = () => ++calls === 1 ? old.promise : Promise.resolve(observed('degraded'));
  const first = poller.poll(get());
  set([{ ...get(), config: { state: 'degraded' }, updatedAt: '2026-11-06T12:01:00Z' }]);
  await poller.poll(get());
  old.resolve(observed('operational'));
  await first;
  assert.equal(poller.status('s').state, 'degraded');
  assert.equal(calls, 2);
});

test('simultaneous requests for one configuration share the same actual check', async () => {
  const { poller, get } = harness();
  const pending = deferred();
  let calls = 0;
  poller.check = () => { calls++; return pending.promise; };
  const requests = [poller.poll(get()), poller.poll(get())];
  pending.resolve(observed());
  await Promise.all(requests);
  assert.equal(calls, 1);
});

test('repeated errors preserve the original last-known observation and successful time', async () => {
  const { poller, get } = harness();
  const first = observed('major_outage');
  poller.check = async () => first;
  await poller.poll(get());
  poller.check = async () => { throw Object.assign(new Error('request includes http://secret.example/?token=sensitive'), { code: 'ECONNREFUSED' }); };
  await poller.poll(get());
  await poller.poll(get());
  const status = poller.status('s');
  assert.equal(status.state, 'unknown');
  assert.equal(status.lastKnown.state, 'major_outage');
  assert.equal(status.lastKnown.checkedAt, first.checkedAt);
  assert.equal(status.lastSuccessfulAt, first.lastSuccessfulAt);
  assert.ok(!status.error.includes('sensitive'));
});
