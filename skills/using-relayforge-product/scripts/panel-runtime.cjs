#!/usr/bin/env node
'use strict';

// Read-only diagnostics: no downloads, installs, state writes or server restart.
const {spawnSync} = require('node:child_process');
const path = require('node:path');

const pluginRoot = path.resolve(__dirname, '../../..');
const pythonProbe = [
  'import sys, json',
  'sqlite = False',
  'try:',
  ' import sqlite3; sqlite3.connect(":memory:").close(); sqlite = True',
  'except (ImportError, OSError): pass',
  'print(json.dumps({"version": list(sys.version_info[:3]), "executable": sys.executable, "sqlite3": sqlite}))',
].join('\n');

function probe(command, args, run, options = {}) {
  // Recent Python launchers can install a runtime on first launch. Disable that
  // behavior during diagnosis, including opt-in flags inherited from the host.
  const env = {...process.env, PYTHON_MANAGER_AUTOMATIC_INSTALL: 'false', PYTHONDONTWRITEBYTECODE: '1'};
  delete env.PYLAUNCHER_ALLOW_INSTALL;
  delete env.PYLAUNCHER_ALWAYS_INSTALL;
  const result = run(command, args, {cwd: pluginRoot, encoding: 'utf8',
    timeout: 5000, maxBuffer: 256 * 1024, windowsHide: true, shell: false, env, ...options});
  if (result.error || result.status !== 0) {
    return {status: result.error?.code === 'ENOENT' ? 'missing_command' : 'probe_failed'};
  }
  try { return {status: 'ok', value: JSON.parse(result.stdout)}; }
  catch { return {status: 'probe_failed'}; }
}

function diagnose({component = 'progress', run = spawnSync, nodeVersion = process.versions.node,
  platform = process.platform} = {}) {
  if (!['progress', 'companion'].includes(component)) throw new Error('invalid_component');
  const node = {version: nodeVersion, status: Number(nodeVersion.split('.')[0]) >= 18 ? 'ready' : 'unsupported'};
  const report = {component, platform, node, status: 'runtime_ready_host_unverified',
    host_ui: 'unverified', installation_candidates: []};
  if (node.status !== 'ready') report.installation_candidates.push('node');
  if (component === 'companion') {
    if (node.status !== 'ready') report.status = 'node_incompatible';
    return report;
  }
  const candidates = [['python3', []], ['python', []]];
  if (platform === 'win32') candidates.push(['py', ['-3']]);
  const results = candidates.map(([command, args]) => {
    const result = probe(command, [...args, '-c', pythonProbe], run);
    if (result.status !== 'ok') return {command, args, status: result.status};
    const value = result.value;
    if (!value || !Array.isArray(value.version) || value.version.length !== 3 ||
        !value.version.every(Number.isInteger) || typeof value.executable !== 'string' ||
        !path.isAbsolute(value.executable) || typeof value.sqlite3 !== 'boolean') {
      return {command, args, status: 'probe_failed'};
    }
    const supported = value.version[0] === 3 && value.version[1] >= 11;
    return {command, args, version: value.version.join('.'), executable: value.executable,
      status: !supported ? 'unsupported' : value.sqlite3 ? 'ready' : 'sqlite_unavailable'};
  });
  report.python = {candidates: results};
  const selected = results.find(item => item.status === 'ready');
  if (!selected) {
    if (results.every(item => item.status === 'missing_command')) {
      report.status = 'python_missing';
      report.installation_candidates.push('python');
    } else if (results.some(item => item.status === 'probe_failed')) {
      // A timeout, denied execution or launcher stub is not evidence of absence.
      report.status = 'python_probe_failed';
    } else if (results.some(item => item.status === 'sqlite_unavailable')) {
      report.status = 'python_sqlite_unavailable';
    } else {
      report.status = 'python_incompatible';
      report.installation_candidates.push('python');
    }
    return report;
  }
  report.python.selected = selected;
  // Initialize a short-lived stdio process only; no progress task or cache is created.
  const result = probe(selected.executable, ['-m', 'progress_panel.server'], run, {
    input: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize',
      params: {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'runtime-check', version: '1'}}}) + '\n',
  });
  report.service = result.status === 'ok' && result.value?.id === 1 &&
    result.value?.result?.serverInfo?.name === 'relayforge-product-progress' ? 'ready' : 'unavailable';
  if (report.service !== 'ready') report.status = 'service_unavailable';
  else if (selected.command !== 'python3') {
    report.status = 'launch_command_mismatch';
    report.suggested_mcp = {command: selected.executable, args: ['-m', 'progress_panel.server'], cwd: pluginRoot};
  } else if (node.status !== 'ready') report.status = 'node_incompatible';
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !['progress', 'companion'].includes(args[0]))) {
    console.error('Usage: node panel-runtime.cjs [progress|companion]');
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify(diagnose({component: args[0] || 'progress'}), null, 2));
  }
}

module.exports = {diagnose};
