#!/usr/bin/env node
'use strict';

// Only stdio JSON-RPC belongs on stdout. Runtime checks never install software.
const {spawn} = require('node:child_process');
const {findPython, pythonEnvironment, pluginRoot} = require('../skills/using-relayforge-product/scripts/panel-runtime.cjs');

function launch({run, platform, start = spawn, stderr = process.stderr} = {}) {
  const selected = findPython({run, platform, stopWhenReady: true}).find(item => item.status === 'ready');
  if (!selected) {
    stderr.write('relayforge-product: compatible Python 3.11+ with sqlite3 was not found. '
      + 'Run panel-runtime.cjs progress through the product Skill to diagnose; no software was installed.\n');
    return null;
  }
  return start(selected.executable, ['-m', 'progress_panel.server'], {
    cwd: pluginRoot, env: pythonEnvironment(), stdio: 'inherit', windowsHide: true, shell: false,
  });
}

if (require.main === module) {
  const child = launch();
  if (!child) process.exitCode = 1;
  else {
    child.on('error', () => {
      console.error('relayforge-product: Python service could not start; check the runtime and plugin directory.');
      process.exitCode = 1;
    });
    child.on('exit', (code, signal) => {process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);});
    process.on('SIGINT', () => child.kill('SIGINT'));
    process.on('SIGTERM', () => child.kill('SIGTERM'));
  }
}

module.exports = {launch};
