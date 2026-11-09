const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');

const scripts = path.resolve(__dirname, '../skills/brainstorming/scripts');

const launchers = [{ name: 'Node lifecycle', bin: process.execPath,
  start: ['companion.cjs', 'start'], stop: ['companion.cjs', 'stop'], native: false }];
if (process.platform === 'win32') {
  for (const shell of ['powershell', 'pwsh']) {
    if (spawnSync(shell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).status === 0) {
      launchers.push({ name: shell, bin: shell, start: ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', 'start-server.ps1'], stop: ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned', '-File', 'stop-server.ps1'], native: true });
    }
  }
}
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
if ((process.platform !== 'win32' || fs.existsSync(bash)) && spawnSync(bash, ['--version']).status === 0) {
  launchers.push({ name: 'Bash', bin: bash, start: ['start-server.sh'], stop: ['stop-server.sh'], native: false });
}

for (const launcher of launchers) {
  test(`${launcher.name}: resume preserves screens, port/key and clears stop markers; running start reuses its instance`, { timeout: 45000 }, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge lifecycle 中文 '));
    let started;
    const run = (verb, extra) => {
      const result = spawnSync(launcher.bin, [...launcher[verb], ...extra], {
        cwd: scripts, encoding: 'utf8', timeout: 15000, windowsHide: true,
        env: { ...process.env, CODEX_CI: '' }
      });
      assert.strictEqual(result.status, 0, `${launcher.name}: ${result.stderr || result.error}`);
      return JSON.parse(result.stdout.trim());
    };
    const startArgs = launcher.native ? ['-ProjectDir', root] : ['--project-dir', root, '--background'];
    const stopArgs = session => launcher.native ? ['-SessionDir', session] :
      launcher.name === 'Bash' ? [session] : ['--session-dir', session];
    t.after(() => {
      // Only terminate the exact PID returned by a launcher during this test if
      // shutdown failed; never discover or signal unrelated system processes.
      if (started?.pid) { try { process.kill(started.pid); } catch {} }
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    });
    started = run('start', startArgs);
    const first = started;
    const content = path.join(first.screen_dir, 'persisted.html');
    fs.writeFileSync(content, '<h2>Persisted product design</h2>');
    const reused = run('start', startArgs);
    assert.strictEqual(reused.reused, true);
    assert.strictEqual(reused.server_id, first.server_id);
    assert.strictEqual(run('stop', stopArgs(first.session_dir)).status, 'stopped');
    started = undefined;
    assert.strictEqual(fs.existsSync(path.join(first.state_dir, 'server-stopped')), true);
    started = run('start', startArgs);
    assert.strictEqual(started.session_dir, first.session_dir);
    assert.strictEqual(started.port, first.port);
    assert.strictEqual(new URL(started.url).search, new URL(first.url).search);
    assert.notStrictEqual(started.server_id, first.server_id);
    assert.strictEqual(fs.existsSync(path.join(started.state_dir, 'server-stopped')), false);
    assert.strictEqual(fs.readFileSync(content, 'utf8'), '<h2>Persisted product design</h2>');
    const cookie = `brainstorm-key-${started.port}=${new URL(started.url).searchParams.get('key')}`;
    const rendered = await fetch(`http://localhost:${started.port}/`, { headers: { Cookie: cookie } });
    const html = await rendered.text();
    assert.match(html, /Persisted product design/);
    assert.match(html, /brainstorm-screen" content="persisted.html"/);
    const version = JSON.parse(fs.readFileSync(path.join(__dirname, '../plugin.json'), 'utf8')).version;
    assert.ok(html.includes(`RelayForge v${version}`));
    assert.strictEqual(run('stop', stopArgs(started.session_dir)).status, 'stopped');
    started = undefined;
  });
}
