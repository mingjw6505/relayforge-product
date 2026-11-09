const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const test = require('node:test');
const vm = require('vm');
const { stop } = require('../skills/brainstorming/scripts/companion.cjs');

const serverScript = path.resolve(__dirname, '../skills/brainstorming/scripts/server.cjs');

function startServer(t, extraEnv = {}) {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-visual-'));
  fs.mkdirSync(path.join(sessionDir, 'content'));
  fs.mkdirSync(path.join(sessionDir, 'state'));
  const child = spawn(process.execPath, [serverScript, '--brainstorm-server-id=test-instance'], {
    env: {
      ...process.env,
      BRAINSTORM_DIR: sessionDir,
      BRAINSTORM_HOST: '127.0.0.1',
      BRAINSTORM_URL_HOST: 'localhost',
      BRAINSTORM_OWNER_PID: '',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await waitForExit(child);
    }
    fs.rmSync(sessionDir, { recursive: true, force: true });
  });
  return { child, sessionDir };
}

function waitForJsonLine(stream, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for server output')), timeoutMs);
    function finish(error, value) {
      clearTimeout(timeout);
      stream.off('data', onData);
      if (error) reject(error);
      else resolve(value);
    }
    function onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) {
        try {
          const value = JSON.parse(line);
          if (predicate(value)) return finish(null, value);
        } catch (error) {
          // Ignore non-JSON diagnostics while waiting for the expected record.
        }
      }
    }
    stream.on('data', onData);
  });
}

function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for server exit')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve(code);
    });
  });
}

test('requires the session key for HTTP access', { timeout: 10000 }, async (t) => {
  const { child } = startServer(t);
  const started = await waitForJsonLine(child.stdout, (value) => value.type === 'server-started');
  const unauthenticated = await fetch(`http://localhost:${started.port}/`);
  const authenticated = await fetch(started.url);
  assert.strictEqual(unauthenticated.status, 403);
  assert.strictEqual(authenticated.status, 200);
});

test('custom choice API emits the canonical choice and displayed screen', () => {
  let socket;
  const sent = [];
  class BrowserSocket {
    static OPEN = 1;
    constructor() { this.readyState = 1; socket = this; }
    send(value) { sent.push(JSON.parse(value)); }
  }
  const window = { location: { host: 'localhost:12345' }, sessionStorage: { getItem: () => 'test-key' } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../skills/brainstorming/scripts/helper.js'), 'utf8'), {
    window, WebSocket: BrowserSocket, setTimeout, clearTimeout,
    document: { addEventListener() {}, querySelector: selector => selector.startsWith('meta') ? { content: 'layout.html' } : null }
  });
  socket.onopen();
  window.brainstorm.choice(false);
  window.brainstorm.choice(0);
  assert.strictEqual(sent[0].choice, false);
  assert.strictEqual(sent[1].choice, 0);
  assert.ok(sent.every(event => event.screen === 'layout.html' && event.type === 'choice'));
});

test('persists canonical and legacy choices, including false/zero, and rejects obsolete-screen events', { timeout: 10000 }, async t => {
  const { child, sessionDir } = startServer(t);
  const started = await waitForJsonLine(child.stdout, value => value.type === 'server-started');
  const screenAdded = waitForJsonLine(child.stdout, value => value.type === 'screen-added');
  fs.writeFileSync(path.join(sessionDir, 'content', 'layout.html'), '<h2>Layout</h2>');
  await screenAdded;
  const ws = new WebSocket(started.url.replace('http:', 'ws:'));
  t.after(() => ws.close());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  const recorded = waitForJsonLine(child.stdout, value => value.source === 'user-event' && value.choice === 'last');
  ws.send(JSON.stringify({ type: 'choice', value: 'legacy' }));
  ws.send(JSON.stringify({ type: 'choice', choice: false, screen: 'layout.html' }));
  ws.send(JSON.stringify({ type: 'choice', choice: 0, screen: 'layout.html' }));
  ws.send(JSON.stringify({ type: 'choice', choice: 'obsolete', screen: 'old-layout.html' }));
  ws.send(JSON.stringify({ type: 'click', choice: 'last', screen: 'layout.html' }));
  await recorded;
  const events = fs.readFileSync(path.join(sessionDir, 'state', 'events'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(events.map(event => event.choice), ['legacy', false, 0, 'last']);
  assert.ok(events.every(event => event.screen === 'layout.html'));
});

test('shutdown requires both the session key and exact server instance', { timeout: 10000 }, async t => {
  const { child } = startServer(t);
  const started = await waitForJsonLine(child.stdout, value => value.type === 'server-started');
  const url = new URL(started.url);
  url.pathname = '/shutdown';
  const noKey = new URL(url); noKey.search = '';
  assert.strictEqual((await fetch(noKey, { method: 'POST' })).status, 403);
  assert.strictEqual((await fetch(url, { method: 'POST', headers: { 'X-Brainstorm-Instance': 'wrong-instance' } })).status, 409);
  const exiting = waitForExit(child);
  assert.strictEqual((await fetch(url, { method: 'POST', headers: { 'X-Brainstorm-Instance': started.server_id } })).status, 200);
  assert.strictEqual(await exiting, 0);
});

test('an unverifiable live instance preserves metadata and never kills the process', { timeout: 10000 }, async t => {
  const { child, sessionDir } = startServer(t);
  const started = await waitForJsonLine(child.stdout, value => value.type === 'server-started');
  const infoPath = path.join(sessionDir, 'state', 'server-info');
  const fakeInfo = JSON.stringify({ ...started, server_id: 'wrong-instance' });
  fs.writeFileSync(infoPath, fakeInfo);
  await assert.rejects(stop({ 'session-dir': sessionDir }), /Cannot verify/);
  assert.strictEqual(fs.readFileSync(infoPath, 'utf8'), fakeInfo);
  assert.strictEqual(child.exitCode, null);
  assert.strictEqual((await fetch(started.url)).status, 200);
});

test('exits after the configured idle timeout and records the reason', { timeout: 10000 }, async (t) => {
  const { child, sessionDir } = startServer(t, {
    BRAINSTORM_IDLE_TIMEOUT_MS: '100',
    BRAINSTORM_LIFECYCLE_CHECK_MS: '20'
  });
  await waitForJsonLine(child.stdout, (value) => value.type === 'server-started');
  const stoppedPromise = waitForJsonLine(child.stdout, (value) => value.type === 'server-stopped');
  const stopped = await stoppedPromise;
  assert.strictEqual(stopped.reason, 'idle timeout');
  assert.strictEqual(await waitForExit(child), 0);
  const record = JSON.parse(fs.readFileSync(path.join(sessionDir, 'state', 'server-stopped'), 'utf8'));
  assert.strictEqual(record.reason, 'idle timeout');
  assert.strictEqual(fs.existsSync(path.join(sessionDir, 'state', 'server-info')), false);
});
