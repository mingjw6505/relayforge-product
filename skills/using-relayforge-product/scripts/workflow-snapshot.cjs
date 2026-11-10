// Read-only projection. The bookkeeping helper supplies its existing rule engine.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const STAGES = ['discovery', 'clarifying', 'prd', 'prototype', 'spec', 'completed'];
const READINESS = ['problem', 'user', 'goal', 'scope', 'non_goals', 'success_signal'];
const error = code => { throw new Error(code); };

function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)) error('unsafe_source');
  const absolute = path.resolve(root, relative);
  const rel = path.relative(root, absolute);
  if (!rel || rel === '..' || rel.startsWith(`..${path.sep}`)) error('unsafe_source');
  let part = root;
  for (const name of rel.split(path.sep)) {
    part = path.join(part, name);
    if (fs.existsSync(part) && fs.lstatSync(part).isSymbolicLink()) error('unsafe_source');
  }
  return absolute;
}

function section(text, name) {
  const lines = text.split('\n');
  const start = lines.indexOf(`## ${name}`);
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && line.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

function list(text, name) {
  const content = section(text, name);
  if (content === null || /Identify any material gaps using the readiness checklist/.test(content)) return { items: [], total: null };
  if (/^(?:- )?(?:None(?: yet)?\.?|无[。.]?)$/i.test(content)) return { items: [], total: 0 };
  const lines = content.split('\n').filter(line => line.trim());
  if (!lines.every(line => /^- .+/.test(line))) return { items: [], total: null };
  return { items: lines.slice(0, 20).map(line => line.slice(2, 242)), total: lines.length };
}

function snapshot(args, rules) {
  if (!args['project-dir'] || !args.state) error('invalid_binding');
  const root = fs.realpathSync(args['project-dir']);
  const state = safePath(root, args.state);
  if (fs.statSync(state).size > 1024 * 1024) error('source_too_large');
  const bytes = fs.readFileSync(state);
  let ctx;
  try { ctx = rules.loadContext({ 'project-dir': root, state: args.state }); }
  catch (err) { error(err.message.includes('migration') ? 'migration_required' : 'invalid_source'); }
  if (!bytes.equals(fs.readFileSync(state))) error('source_changed');
  const original = structuredClone(ctx.records);
  const entries = Object.entries(original.artifacts);
  if (entries.length > 64 || original.approvals.length > 64) error('source_too_large');
  let edges = 0;
  const seen = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) error('invalid_source');
    if (seen.has(id) || !original.artifacts[id]) return;
    visiting.add(id);
    for (const input of original.artifacts[id].inputs) visit(input.artifact);
    visiting.delete(id); seen.add(id);
  }
  let files = 0, totalBytes = 0;
  function inspect(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) error('unsafe_source');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(file)) inspect(path.join(file, name));
    } else if (stat.isFile()) {
      files++; totalBytes += stat.size;
      if (files > 1024 || totalBytes > 64 * 1024 * 1024) error('source_too_large');
    } else error('unsafe_source');
  }
  const initial = new Map();
  for (const [id, record] of entries) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !Array.isArray(record.inputs) ||
        !/^v[1-9]\d*$/.test(record.version) || !/^[a-f0-9]{64}$/.test(record.sha256)) error('invalid_source');
    edges += record.inputs.length;
    if (edges > 128) error('source_too_large');
    const file = safePath(root, record.path);
    if (fs.existsSync(file)) { inspect(file); initial.set(id, rules.fingerprint(file)); }
    else initial.set(id, null);
  }
  for (const [id] of entries) visit(id);
  const affected = rules.checkArtifacts(ctx); // mutates ONLY this private in-memory context
  const approvals = ctx.records.approvals.map(a => ({
    artifact: a.artifact, path: a.path, version: a.version, sha256: a.sha256,
    scope: String(a.scope || '').slice(0, 600), at: a.at, state: a.state,
    includes_input_scope: a.includes_input_scope === true, inputs: a.inputs || []
  }));
  const artifacts = entries.map(([id, r]) => {
    const effective = ctx.records.artifacts[id];
    const approval = approvals.find(a => a.artifact === id && a.state === 'valid' &&
      a.path === r.path && a.version === r.version && a.sha256 === r.sha256);
    const status = initial.get(id) === null ? 'missing' : affected.includes(id) ? 'needs-review' :
      r.status === 'approved' && !approval ? 'needs-review' : r.status;
    return { id, kind: r.kind, path: r.path, version: r.version, recorded_status: r.status,
      effective_status: status, sha256: r.sha256, review_required: effective.review_required === true,
      inputs: r.inputs, approval_state: approval ? 'valid' : approvals.some(a => a.artifact === id && a.state === 'stale') ? 'stale' : 'none' };
  });
  const get = name => rules.extractField(ctx.text, name);
  const recordedStage = rules.extractField(bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'Current stage');
  const earliest = artifacts.filter(a => affected.includes(a.id)).map(a =>
    ['boundary', 'decision'].includes(a.kind) ? 'clarifying' : a.kind).sort((a,b) => STAGES.indexOf(a)-STAGES.indexOf(b))[0];
  const readinessBlock = section(ctx.text, 'Readiness') || '';
  const readiness = Object.fromEntries(READINESS.map(key => {
    const matches = [...readinessBlock.matchAll(new RegExp(`^${key}: (present|assumed|missing)\\s*$`, 'gm'))];
    return [key, matches.length === 1 ? matches[0][1] : 'unknown'];
  }));
  const mode = rules.extractField(ctx.text, 'Workflow mode');
  for (const [id, r] of entries) {
    const file = safePath(root, r.path);
    const now = fs.existsSync(file) ? rules.fingerprint(file) : null;
    if (now !== initial.get(id)) error('source_changed');
  }
  if (!bytes.equals(fs.readFileSync(state))) error('source_changed');
  const product = {
    requirement: { slug: get('Requirement slug'), name: (ctx.text.match(/^# (.+)$/m)?.[1] || '').slice(0, 120) },
    workflow_mode: ['standard', 'fast'].includes(mode) ? mode : null,
    current_stage: STAGES.includes(recordedStage) ? recordedStage : null,
    observed_stage: earliest || (STAGES.includes(get('Current stage')) ? get('Current stage') : null),
    workflow_status: get('Status') || null, artifacts, approvals, readiness,
    assumptions: list(ctx.text, '待确认假设'), questions: list(ctx.text, 'Open questions'), blockers: list(ctx.text, 'Blockers'),
    integrity: { status: affected.length ? 'invalid' : 'valid', affected }
  };
  const result = { product, source_state: { status: 'available', state_sha256: hash(bytes), checked_at: new Date().toISOString() } };
  if (Buffer.byteLength(JSON.stringify(result)) > 256 * 1024) error('source_too_large');
  return result;
}

module.exports = { snapshot, safePath };
