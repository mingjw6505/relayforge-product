const assert = require('node:assert/strict');
const test = require('node:test');
const {diagnose} = require('../skills/using-relayforge-product/scripts/panel-runtime.cjs');

const executable = process.execPath; // Absolute on every test platform; never executed by the fake runner.
const missing = {error: {code: 'ENOENT'}, status: null};
const ok = value => ({status: 0, stdout: JSON.stringify(value)});
const python = (version = [3, 11, 0], sqlite3 = true) => ok({version, executable, sqlite3});
function runner(commands = {}, service = ok({id: 1, result: {serverInfo: {name: 'relayforge-product-progress'}}})) {
  return (command, args, options) => {
    assert.equal(options.shell, false);
    assert.equal(options.windowsHide, true);
    assert.equal(options.env.PYTHON_MANAGER_AUTOMATIC_INSTALL, 'false');
    assert.equal(options.env.PYTHONDONTWRITEBYTECODE, '1');
    assert.equal(options.env.PYLAUNCHER_ALLOW_INSTALL, undefined);
    assert.equal(options.env.PYLAUNCHER_ALWAYS_INSTALL, undefined);
    assert.equal(options.timeout, 5000);
    if (args[0] === '-m') {
      assert.equal(JSON.parse(options.input).method, 'initialize');
      return service;
    }
    assert.equal(args.at(-2), '-c');
    return commands[command] || missing;
  };
}
const check = (commands, extra = {}) => diagnose({platform: 'win32', nodeVersion: '22.0.0', run: runner(commands), ...extra});

test('ready runtimes and an initialized service never claim UI rendering success', () => {
  const report = check({python3: python()});
  assert.equal(report.status, 'runtime_ready_host_unverified');
  assert.equal(report.host_ui, 'unverified');
  assert.equal(report.service, 'ready');
  assert.deepEqual(report.installation_candidates, []);
});

test('missing Python is distinguished from old Python, missing sqlite and denied execution', () => {
  assert.equal(check({}).status, 'python_missing');
  assert.deepEqual(check({}).installation_candidates, ['python']);
  assert.equal(check({python3: python([3, 10, 9])}).status, 'python_incompatible');
  assert.equal(check({python3: python([3, 12, 0], false)}).status, 'python_sqlite_unavailable');
  for (const result of [{error: {code: 'ETIMEDOUT'}}, {error: {code: 'EACCES'}},
    {status: 1, stderr: 'launcher failed'}, {status: 0, stdout: 'not json'}, ok(null)]) {
    const report = check({python3: result});
    assert.equal(report.status, 'python_probe_failed');
    assert.deepEqual(report.installation_candidates, []);
  }
});

test('existing python and py launchers suggest a host command override rather than reinstalling', () => {
  for (const command of ['python', 'py']) {
    const report = check({[command]: python([3, 12, 0])});
    assert.equal(report.status, 'launch_command_mismatch');
    assert.equal(report.python.selected.command, command);
    assert.equal(report.suggested_mcp.command, executable);
    assert.deepEqual(report.installation_candidates, []);
  }
});

test('broken service is not reported as a missing runtime', () => {
  const report = check({}, {run: runner({python3: python()}, {status: 1})});
  assert.equal(report.status, 'service_unavailable');
  assert.deepEqual(report.installation_candidates, []);
});

test('companion requires only Node and never probes Python', () => {
  const run = () => {throw new Error('Python must not be probed for the companion');};
  assert.equal(diagnose({component: 'companion', nodeVersion: '22.0.0', run}).status, 'runtime_ready_host_unverified');
  const report = diagnose({component: 'companion', nodeVersion: '16.0.0', run});
  assert.equal(report.status, 'node_incompatible');
  assert.deepEqual(report.installation_candidates, ['node']);
});

test('POSIX probes do not assume the Windows py launcher exists', () => {
  const commands = [];
  diagnose({platform: 'linux', nodeVersion: '22.0.0', run: command => {commands.push(command); return missing;}});
  assert.deepEqual(commands, ['python3', 'python']);
});

test('diagnosis removes inherited launcher installation flags only from child processes', () => {
  const keys = ['PYLAUNCHER_ALLOW_INSTALL', 'PYLAUNCHER_ALWAYS_INSTALL'];
  const previous = keys.map(key => process.env[key]);
  try {
    for (const key of keys) process.env[key] = '1';
    check({python3: python()});
    for (const key of keys) assert.equal(process.env[key], '1');
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
