import test from 'node:test';
import assert from 'node:assert/strict';
import {PanelPoller} from '../src/poller.mjs';

const id = '11111111-1111-4111-8111-111111111111';
const state = (revision = 1, status = 'running', run_id = id) => ({schema_version: 1, panel_kind: 'relayforge_product',
  source: 'agent_declared', run_id, revision, status, title: '任务', summary: '实现中',
  steps: [{label: '实现', status: status === 'completed' ? 'done' : 'active'}]});
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(callTool) {
  const snapshots = [], states = [], timers = new Map();
  let nextTimer = 0;
  const poller = new PanelPoller({callTool, onSnapshot: value => snapshots.push(value),
    onState: value => states.push(value), schedule: (fn, delay) => {
      timers.set(++nextTimer, {fn, delay}); return nextTimer;
    }, cancel: timer => timers.delete(timer)});
  return {poller, snapshots, states, timers};
}

test('binds only its own task, waits for handshake, and polls without another model call', async () => {
  let calls = 0;
  const s = setup(async args => {
    assert.equal(args.arguments.run_id, id); calls++;
    return {structuredContent: state(calls + 1)};
  });
  assert.equal(s.poller.bind(state()), true);
  assert.equal(calls, 0);
  s.poller.connected(); await flush();
  assert.equal(calls, 1);
  assert.equal(s.timers.size, 1);
  assert.equal(s.poller.bind(state(9, 'running', '22222222-2222-4222-8222-222222222222')), false);
  const timer = [...s.timers.values()][0]; s.timers.clear();
  assert.equal(timer.delay, 2000);
  await timer.fn();
  assert.equal(calls, 2);
  assert.equal(s.snapshots.at(-1).revision, 3);
  s.poller.close();
});

test('closing a panel discards a delayed response and never schedules again', async () => {
  let resolve;
  const s = setup(() => new Promise(done => {resolve = done;}));
  s.poller.bind(state()); s.poller.connected(); s.poller.close();
  resolve({structuredContent: state(2)}); await flush();
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.timers.size, 0);
  s.poller.resume();
  assert.equal(s.timers.size, 0);
});

test('foreign or older responses keep the last known state and retry with backoff', async () => {
  const s = setup(async () => ({structuredContent: state(2, 'running', '22222222-2222-4222-8222-222222222222')}));
  s.poller.bind(state(3)); s.poller.connected(); await flush();
  assert.equal(s.snapshots.at(-1).revision, 3);
  assert.equal(s.states.at(-1), 'disconnected');
  assert.equal([...s.timers.values()][0].delay, 4000);
  s.poller.pause(); assert.equal(s.timers.size, 0);
  s.poller.callTool = async () => ({structuredContent: state(2)});
  s.poller.resume(); await flush();
  assert.equal(s.snapshots.at(-1).revision, 3);
  s.poller.close();
});

test('a terminal declaration cancels the timer and freezes polling', async () => {
  let calls = 0;
  const s = setup(async () => {calls++; return {structuredContent: state(2)};});
  s.poller.bind(state()); s.poller.connected(); await flush();
  assert.equal(calls, 1);
  s.poller.bind(state(3, 'completed'));
  assert.equal(s.timers.size, 0);
  s.poller.pause(); s.poller.resume(); await flush();
  assert.equal(calls, 1);
});

test('default timer adapters do not pass the poller as a browser timer receiver', async () => {
  const originalSchedule = globalThis.setTimeout;
  const originalCancel = globalThis.clearTimeout;
  let scheduled = 0;
  globalThis.setTimeout = function () {
    assert.equal(this, undefined, 'browser timers require their native global receiver');
    scheduled++;
    return 1;
  };
  globalThis.clearTimeout = function () {
    assert.equal(this, undefined, 'browser timer cancellation must not receive the poller');
  };
  try {
    const poller = new PanelPoller({callTool: async () => ({structuredContent: state(2)}),
      onSnapshot: () => {}, onState: () => {}});
    poller.bind(state());
    poller.ready = true;
    await poller.poll();
    assert.equal(scheduled, 1);
    poller.pause();
    poller.close();
  } finally {
    globalThis.setTimeout = originalSchedule;
    globalThis.clearTimeout = originalCancel;
  }
});

test('a new render can replace the task in a reused panel, discarding the old pending read', async () => {
  const nextId = '22222222-2222-4222-8222-222222222222';
  let resolve;
  const s = setup(() => new Promise(done => {resolve = done;}));
  s.poller.bind(state(9)); s.poller.connected();
  assert.equal(s.poller.bind(state(1, 'running', nextId), {replace: true}), true);
  resolve({structuredContent: state(10)}); await flush();
  assert.equal(s.snapshots.at(-1).run_id, nextId);
  assert.equal(s.snapshots.at(-1).revision, 1);
  assert.equal(s.timers.size, 1);
  s.poller.callTool = async args => {
    assert.equal(args.arguments.run_id, nextId);
    return {structuredContent: state(2, 'running', nextId)};
  };
  const timer = [...s.timers.values()][0]; s.timers.clear();
  await timer.fn();
  assert.equal(s.snapshots.at(-1).revision, 2);
  s.poller.bind(state(3, 'completed', nextId));
  assert.equal(s.timers.size, 0);
  s.poller.pause();
  s.poller.callTool = async args => {
    assert.equal(args.arguments.run_id, id);
    return {structuredContent: state(2)};
  };
  assert.equal(s.poller.bind(state(1), {replace: true}), true);
  assert.equal(s.poller.runId, id);
  assert.equal(s.poller.paused, false);
  await flush();
  assert.equal(s.snapshots.at(-1).revision, 2);
  s.poller.close(); await flush();
});

test('unchanged revisions update sync status without rebuilding the card', async () => {
  const s = setup(async () => ({structuredContent: state(1)}));
  s.poller.bind(state()); s.poller.connected(); await flush();
  assert.equal(s.snapshots.length, 1);
  assert.equal(s.states.at(-1), 'synced');
  s.poller.bind(state());
  assert.equal(s.snapshots.length, 1);
  s.poller.close();
});

test('unknown task stops retries while storage errors remain recoverable', async () => {
  const s = setup(async () => ({isError: true, structuredContent: {error: 'unknown_run'}}));
  s.poller.bind(state()); s.poller.connected(); await flush();
  assert.equal(s.states.at(-1), 'unavailable');
  assert.equal(s.timers.size, 0);
  s.poller.pause(); s.poller.resume(); await flush();
  assert.equal(s.timers.size, 0);
  s.poller.close();
  const temporary = setup(async () => ({isError: true, content: [{type: 'text', text: 'storage_unavailable'}]}));
  temporary.poller.bind(state()); temporary.poller.connected(); await flush();
  assert.equal(temporary.states.at(-1), 'disconnected');
  assert.equal(temporary.timers.size, 1);
  temporary.poller.close();
});

test('hidden panels suspend reads and immediately refresh when visible', async () => {
  let calls = 0;
  const s = setup(async () => {calls++; return {structuredContent: state(2)};});
  s.poller.setVisible(false); s.poller.bind(state()); s.poller.connected(); await flush();
  assert.equal(calls, 0);
  s.poller.setVisible(true); await flush();
  assert.equal(calls, 1);
  s.poller.setVisible(false);
  assert.equal(s.timers.size, 0);
  s.poller.close();
});
