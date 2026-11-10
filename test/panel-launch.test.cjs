const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {EventEmitter} = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {launch} = require('../progress_panel/launch.cjs');
const {findPython, diagnose} = require('../skills/using-relayforge-product/scripts/panel-runtime.cjs');

const root = path.resolve(__dirname, '..');
const interpreter = path.resolve(os.tmpdir(), '用户 Python 空格', 'python.exe');
const missing = {status: null, error: {code: 'ENOENT'}};
const python = (version = [3, 12, 3], sqlite3 = true) => ({status: 0,
  stdout: JSON.stringify({version, executable: interpreter, sqlite3})});

test('Windows launches an existing python when python3 and py are broken, without probing them', () => {
  const checked = [];
  let started = false;
  const child = new EventEmitter();
  const result = launch({platform: 'win32',
    run(command) {checked.push(command); return command === 'python' ? python() : {status: 1};},
    start(command, args, options) {
      started = true;
      assert.equal(command, interpreter);
      assert.deepEqual(args, ['-m', 'progress_panel.server']);
      assert.equal(options.cwd, root);
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      assert.equal(options.stdio, 'inherit');
      assert.equal(options.env.PYTHON_MANAGER_AUTOMATIC_INSTALL, 'false');
      return child;
    },
  });
  assert.equal(result, child);
  assert.equal(started, true);
  assert.deepEqual(checked, ['python']);
});

test('POSIX falls back after a failed python3 probe and rejects old or sqlite-less candidates', () => {
  for (const failed of [{status: 1}, python([3, 10, 9]), python([3, 12, 3], false)]) {
    const results = findPython({platform: 'linux', stopWhenReady: true,
      run: command => command === 'python3' ? failed : python()});
    assert.equal(results.find(item => item.status === 'ready').command, 'python');
  }
});

test('no compatible interpreter produces a stderr explanation and never starts a child', () => {
  let stderr = '';
  const child = launch({platform: 'win32', run: () => missing,
    start() {throw new Error('Must not launch or install anything');},
    stderr: {write(value) {stderr += value;}},
  });
  assert.equal(child, null);
  assert.match(stderr, /Python 3\.11\+/);
  assert.match(stderr, /no software was installed/);
});

test('automatic launcher registration does not diagnose existing python as a command mismatch', () => {
  const report = diagnose({platform: 'win32', nodeVersion: '24.22.1',
    run(command, args) {
      if (args[0] === '-m') return {status: 0,
        stdout: JSON.stringify({id: 1, result: {serverInfo: {name: 'relayforge-product-progress'}}})};
      return command === 'python' ? python() : {status: 1};
    },
  });
  assert.equal(report.status, 'runtime_ready_host_unverified');
  assert.deepEqual(report.installation_candidates, []);
});

test('packaged launcher preserves clean stdio from a Unicode install path and unrelated cwd', t => {
  if (!findPython({stopWhenReady: true}).some(item => item.status === 'ready')) {
    t.skip('A compatible Python is needed for a real service handshake');
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge 中文 空格-'));
  t.after(() => fs.rmSync(directory, {recursive: true, force: true}));
  for (const relative of ['plugin.json', '.mcp.json',
    'skills/using-relayforge-product/scripts/panel-runtime.cjs',
    ...fs.readdirSync(path.join(root, 'progress_panel')).filter(name => name.endsWith('.py') || name === 'launch.cjs')
      .map(name => `progress_panel/${name}`)]) {
    const target = path.join(directory, relative);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(path.join(root, relative), target);
  }
  const requests = [{jsonrpc: '2.0', id: 1, method: 'initialize', params: {protocolVersion: '2025-11-25'}},
    {jsonrpc: '2.0', id: 2, method: 'tools/list'}];
  const result = spawnSync(process.execPath, [path.join(directory, 'progress_panel/launch.cjs')], {
    cwd: os.tmpdir(), input: requests.map(value => JSON.stringify(value) + '\n').join(''),
    encoding: 'utf8', timeout: 20000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.equal(result.stderr, '');
  const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(rows.length, requests.length);
  assert.equal(rows[0].result.serverInfo.name, 'relayforge-product-progress');
  assert.ok(rows[1].result.tools.some(tool => tool.name === 'start_product_progress'));
});
