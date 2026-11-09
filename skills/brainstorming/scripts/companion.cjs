#!/usr/bin/env node
// Shared session lifecycle for the native PowerShell and Bash launchers.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseArgs(argv) {
  const args = { command: argv[0] };
  const switches = new Set(['open', 'foreground', 'background', 'new-session']);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    if (switches.has(key)) args[key] = true;
    else if (['project-dir', 'session-dir', 'host', 'url-host', 'idle-timeout-minutes'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) args[key] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
  }
  return args;
}

function readInfo(sessionDir) {
  try { return JSON.parse(fs.readFileSync(path.join(sessionDir, 'state', 'server-info'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function recordedPid(info, stateDir) {
  if (Number.isInteger(info?.pid)) return info.pid;
  try { return Number(fs.readFileSync(path.join(stateDir, 'server.pid'), 'utf8').trim()); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function endpoint(info, pathname) {
  const url = new URL(info.url);
  url.hostname = info.host === '0.0.0.0' ? '127.0.0.1' : info.host === '::' ? '[::1]' : info.host;
  url.pathname = pathname;
  return url;
}

function request(info, pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(endpoint(info, pathname), {
      method, timeout: 1500, headers: { 'X-Brainstorm-Instance': info.server_id }
    }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`Session endpoint returned ${res.statusCode}`));
        try { resolve(JSON.parse(text)); } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Session endpoint timed out')));
    req.end();
  });
}

async function verifyInfo(info, sessionDir) {
  const actual = await request(info, '/session');
  if (actual.server_id !== info.server_id || actual.pid !== info.pid ||
      path.resolve(actual.session_dir) !== path.resolve(sessionDir)) {
    throw new Error('Session identity does not match; preserving process metadata');
  }
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
}

function resolveSession(args) {
  if (args['session-dir']) {
    if (args['new-session']) throw new Error('--new-session cannot be combined with --session-dir');
    const sessionDir = path.resolve(args['session-dir']);
    if (!fs.existsSync(path.join(sessionDir, 'content')) || !fs.existsSync(path.join(sessionDir, 'state'))) {
      throw new Error('The requested session must already contain content/ and state/');
    }
    return sessionDir;
  }
  if (!args['project-dir']) return fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-brainstorm-'));
  const projectDir = path.resolve(args['project-dir']);
  if (!fs.statSync(projectDir).isDirectory()) throw new Error('Project directory does not exist');
  const root = path.join(projectDir, '.relayforge', 'brainstorm');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const pointer = path.join(root, '.active-session');
  let name;
  if (!args['new-session']) {
    try { name = fs.readFileSync(pointer, 'utf8').trim(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (name && (!/^[a-zA-Z0-9-]+$/.test(name) || !fs.existsSync(path.join(root, name)))) throw new Error('Invalid active session pointer; choose --new-session or an explicit --session-dir');
    if (!name) {
      const legacy = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory() && /^\d+-\d+$/.test(e.name));
      legacy.sort((a, b) => fs.statSync(path.join(root, b.name)).mtimeMs - fs.statSync(path.join(root, a.name)).mtimeMs);
      name = legacy[0]?.name;
    }
  }
  if (!name) name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(pointer, name + '\n', { mode: 0o600 });
  return path.join(root, name);
}

async function start(args) {
  const minutes = Number(args['idle-timeout-minutes'] || 240);
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 525600) throw new Error('Idle timeout must be an integer from 1 to 525600 minutes');
  const sessionDir = resolveSession(args);
  const stateDir = path.join(sessionDir, 'state');
  fs.mkdirSync(path.join(sessionDir, 'content'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const previous = readInfo(sessionDir);
  if (previous) {
    try {
      await verifyInfo(previous, sessionDir);
      process.stdout.write(JSON.stringify({ ...previous, reused: true }) + '\n');
      return;
    } catch (error) {
      if (alive(recordedPid(previous, stateDir))) throw new Error(`Cannot verify the existing session: ${error.message}. Stop it explicitly before retrying.`);
    }
  }
  const serverId = crypto.randomBytes(24).toString('hex');
  const host = args.host || '127.0.0.1';
  const portFile = path.join(stateDir, 'port');
  const tokenFile = path.join(stateDir, 'token');
  if (/^\d+-\d+$/.test(path.basename(sessionDir))) {
    for (const [oldName, target] of [['.last-port', portFile], ['.last-token', tokenFile]]) {
      const source = path.join(path.dirname(sessionDir), oldName);
      if (!fs.existsSync(target) && fs.existsSync(source)) fs.copyFileSync(source, target);
    }
  }
  fs.writeFileSync(path.join(stateDir, 'server-instance-id'), serverId + '\n', { mode: 0o600 });
  fs.rmSync(path.join(stateDir, 'server-info'), { force: true });
  const foreground = args.foreground || (!!process.env.CODEX_CI && !args.background);
  const out = foreground ? 'pipe' : fs.openSync(path.join(stateDir, 'server.log'), 'a', 0o600);
  const err = foreground ? 'pipe' : fs.openSync(path.join(stateDir, 'server-error.log'), 'a', 0o600);
  const child = spawn(process.execPath, [path.join(__dirname, 'server.cjs'), `--brainstorm-server-id=${serverId}`], {
    detached: !foreground, windowsHide: true, stdio: ['ignore', out, err],
    env: { ...process.env, BRAINSTORM_DIR: sessionDir, BRAINSTORM_HOST: host,
      BRAINSTORM_URL_HOST: args['url-host'] || (host === '127.0.0.1' || host === 'localhost' ? 'localhost' : host),
      BRAINSTORM_PORT_FILE: portFile, BRAINSTORM_TOKEN_FILE: tokenFile,
      BRAINSTORM_OWNER_PID: foreground ? String(process.pid) : '',
      BRAINSTORM_IDLE_TIMEOUT_MS: String(minutes * 60 * 1000), BRAINSTORM_OPEN: args.open ? '1' : '' }
  });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  if (!foreground) { fs.closeSync(out); fs.closeSync(err); child.unref(); }
  else { child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); }
  if (child.pid) fs.writeFileSync(path.join(stateDir, 'server.pid'), String(child.pid), { mode: 0o600 });
  let ready;
  for (let i = 0; i < 70; i++) {
    if (spawnError || child.exitCode !== null) break;
    const info = readInfo(sessionDir);
    if (info?.server_id === serverId) { ready = info; break; }
    await delay(100);
  }
  if (!ready) {
    if (child.pid && child.exitCode === null) child.kill();
    throw new Error(`Visual companion failed to start: ${spawnError?.message || 'see state/server-error.log'}`);
  }
  if (!foreground) process.stdout.write(JSON.stringify(ready) + '\n');
  else {
    const code = await new Promise(resolve => {
      if (child.exitCode !== null) resolve(child.exitCode);
      else child.once('exit', resolve);
    });
    process.exitCode = code || 0;
  }
}

async function stop(args) {
  if (!args['session-dir']) throw new Error('--session-dir is required');
  const sessionDir = path.resolve(args['session-dir']);
  const stateDir = path.join(sessionDir, 'state');
  const info = readInfo(sessionDir);
  if (!info) {
    const pidFile = path.join(stateDir, 'server.pid');
    if (fs.existsSync(pidFile) && alive(Number(fs.readFileSync(pidFile, 'utf8').trim()))) {
      throw new Error('Cannot verify a live PID without server-info; preserving metadata');
    }
    return { status: 'not_running' };
  }
  try { await verifyInfo(info, sessionDir); }
  catch (error) {
    if (alive(recordedPid(info, stateDir))) throw new Error(`Cannot verify the running session: ${error.message}; preserving metadata`);
    return { status: 'not_running' };
  }
  await request(info, '/shutdown', 'POST');
  for (let i = 0; i < 50; i++) {
    if (!alive(info.pid)) {
      fs.rmSync(path.join(stateDir, 'server.pid'), { force: true });
      fs.rmSync(path.join(stateDir, 'server-instance-id'), { force: true });
      return { status: 'stopped' };
    }
    await delay(100);
  }
  throw new Error('Server did not exit after authenticated shutdown; preserving metadata');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'start') await start(args);
  else if (args.command === 'stop') process.stdout.write(JSON.stringify(await stop(args)) + '\n');
  else throw new Error('Usage: companion.cjs <start|stop> [options]');
}
if (require.main === module) main().catch(error => {
  process.stderr.write(JSON.stringify({ error: error.message }) + '\n');
  process.exitCode = 1;
});
module.exports = { resolveSession, verifyInfo, start, stop };
