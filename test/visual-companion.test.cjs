const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const test = require('node:test');

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
  t.after(() => {
    if (child.exitCode === null) child.kill();
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
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
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
