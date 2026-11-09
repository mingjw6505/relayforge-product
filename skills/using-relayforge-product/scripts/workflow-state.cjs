#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ARTIFACT_KINDS = ['boundary', 'decision', 'prd', 'prototype', 'spec'];
const GATED_STAGES = ['prd', 'prototype', 'spec'];

function fail(message) {
  process.stderr.write(JSON.stringify({ error: message }) + '\n');
  process.exitCode = 1;
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (!key || i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    result[key] = argv[i + 1];
    i += 1;
  }
  return result;
}

function validateSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(slug)) {
    throw new Error('slug must contain lowercase ASCII letters, numbers, and single hyphens only');
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fingerprint(target) {
  const stat = fs.lstatSync(target);
  if (stat.isFile()) return sha256(fs.readFileSync(target));
  if (!stat.isDirectory()) throw new Error('hash target must be a regular file or directory');

  const root = path.resolve(target);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Artifact fingerprints require regular files, not symbolic links');
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  walk(root);
  const relativePath = (file) => path.relative(root, file).split(path.sep).join('/');
  files.sort((a, b) => relativePath(a) < relativePath(b) ? -1 : relativePath(a) > relativePath(b) ? 1 : 0);
  const manifest = files.map((file) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    return `${relative}\t${sha256(fs.readFileSync(file))}`;
  }).join('\n') + (files.length ? '\n' : '');
  return sha256(Buffer.from(manifest, 'utf8'));
}

function extractField(markdown, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^- ${escaped}:[ \\t]*(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function sameRequirement(statePath, name, request) {
  try {
    const text = fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    return extractField(text, 'Initial request') === request &&
      text.startsWith(`# ${name}\n`);
  } catch (error) {
    return false;
  }
}

function oneLine(value) {
  return value.replace(/\r?\n/g, ' ');
}

function availableSlug(workflowsDir, requestedSlug, name, request) {
  let candidate = requestedSlug;
  let suffix = 2;
  while (fs.existsSync(path.join(workflowsDir, candidate))) {
    const statePath = path.join(workflowsDir, candidate, 'state.md');
    if (sameRequirement(statePath, name, request)) {
      return { slug: candidate, existing: true };
    }
    candidate = `${requestedSlug}-${suffix}`;
    suffix += 1;
  }
  return { slug: candidate, existing: false };
}

function normalizeTimestamp(value) {
  if (value && !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('--now must be an ISO 8601 timestamp with timezone');
  }
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('--now must be a valid ISO 8601 timestamp');
  return value || date.toISOString();
}

function stateTemplate({ name, slug, request, now, mode = 'standard' }) {
  return `# ${name}\n\n` +
    `- Requirement slug: ${slug}\n` +
    `- Current stage: discovery\n` +
    `- Workflow mode: ${mode}\n` +
    `- Status: draft\n` +
    `- Last updated: ${now}\n` +
    `- Initial request: ${request}\n\n` +
    `## Readiness\n\n` +
    '```yaml\n' +
    `problem: missing\n` +
    `user: missing\n` +
    `goal: missing\n` +
    `scope: missing\n` +
    `non_goals: missing\n` +
    `success_signal: missing\n` +
    '```\n\n' +
    `## Confirmed decisions\n\n- None yet.\n\n` +
    `## 待确认假设\n\n- None yet.\n\n` +
    `## Open questions\n\n- Identify any material gaps using the readiness checklist.\n\n` +
    `## Blockers\n\n- None.\n\n` +
    `## Produced files\n\n` +
    `| Artifact | Path | Version | Status | SHA-256 |\n` +
    `| --- | --- | --- | --- | --- |\n\n` +
    `## Approval log\n\n` +
    `| Artifact | Path | Version | SHA-256 | Approved scope | Approved at | Approved by | Approval state |\n` +
    `| --- | --- | --- | --- | --- | --- | --- | --- |\n\n` +
    `## Next step\n\n- Continue discovery or use the PRD fast path when its checklist is complete.\n`;
}

function initialize(args) {
  for (const key of ['project-dir', 'slug', 'name', 'request']) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  validateSlug(args.slug);
  const projectDir = path.resolve(args['project-dir']);
  const relayforgeDir = path.resolve(projectDir, args['docs-dir'] || 'docs/relayforge');
  const docsRelative = path.relative(projectDir, relayforgeDir);
  if (!docsRelative || docsRelative.startsWith('..') || path.isAbsolute(docsRelative)) {
    throw new Error('--docs-dir must be a directory inside the project');
  }
  const workflowsDir = path.join(relayforgeDir, 'workflows');
  const now = normalizeTimestamp(args.now);
  const request = oneLine(args.request);
  const name = oneLine(args.name);
  if (args.mode && !['standard', 'fast'].includes(args.mode)) throw new Error('--mode must be standard or fast');
  fs.mkdirSync(workflowsDir, { recursive: true });

  const resolved = availableSlug(workflowsDir, args.slug, name, request);
  const requirementDir = path.join(workflowsDir, resolved.slug);
  const statePath = path.join(requirementDir, 'state.md');
  if (!resolved.existing) {
    fs.mkdirSync(requirementDir);
    fs.writeFileSync(statePath, stateTemplate({
      name,
      slug: resolved.slug,
      request,
      now,
      mode: args.mode || 'standard'
    }), { encoding: 'utf8', flag: 'wx' });
  }

  if (resolved.existing && args.mode) {
    setMode(statePath, args.mode);
  }
  const relativeState = path.relative(projectDir, statePath).split(path.sep).join('/');
  const pointer = `# RelayForge workflow\n\n` +
    `- Active requirement: ${resolved.slug}\n` +
    `- State file: ${relativeState}\n` +
    `- Last updated: ${now}\n`;
  fs.writeFileSync(path.join(relayforgeDir, 'workflow-state.md'), pointer, 'utf8');

  process.stdout.write(JSON.stringify({
    type: resolved.existing ? 'requirement-resumed' : 'requirement-initialized',
    slug: resolved.slug,
    state_file: statePath,
    pointer_file: path.join(relayforgeDir, 'workflow-state.md')
  }) + '\n');
}

function setField(text, field, value) {
  const pattern = new RegExp(`^- ${field}:.*$`, 'm');
  return pattern.test(text) ? text.replace(pattern, `- ${field}: ${value}`) :
    text.replace(/^(# .*\n)/, `$1\n- ${field}: ${value}\n`);
}

function setMode(statePath, mode) {
  if (!['standard', 'fast'].includes(mode)) throw new Error('mode must be standard or fast');
  const text = fs.readFileSync(statePath, 'utf8').replace(/\r\n/g, '\n');
  fs.writeFileSync(statePath, setField(setField(text, 'Workflow mode', mode), 'Last updated', new Date().toISOString()), 'utf8');
}

function insideProject(projectDir, target) {
  const absolute = path.resolve(projectDir, target);
  const relative = path.relative(projectDir, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('state and artifact paths must stay inside the project');
  }
  return absolute;
}

function loadContext(args) {
  if (!args['project-dir'] || !args.state) throw new Error('--project-dir and --state are required');
  const projectDir = path.resolve(args['project-dir']);
  const statePath = insideProject(projectDir, args.state);
  const text = fs.readFileSync(statePath, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = text.match(/## Artifact records\n\n```json\n([\s\S]*?)\n```/);
  if (!match && /^\| (?!Artifact|---).+\| .+\| v\d+ \|/m.test(text)) {
    throw new Error('Existing artifact tables need migration to Artifact records; preserve paths, versions, inputs and approval history');
  }
  const records = match ? JSON.parse(match[1]) : { schema_version: 1, artifacts: {}, approvals: [] };
  if (records.schema_version !== 1 || !records.artifacts || !Array.isArray(records.approvals)) {
    throw new Error('Unsupported artifact records');
  }
  if (Object.values(records.artifacts).some(record => !ARTIFACT_KINDS.includes(record.kind))) {
    throw new Error('State contains out-of-scope artifact kinds; move their records to the appropriate workflow before resuming');
  }
  return { projectDir, statePath, text, records, mode: extractField(text, 'Workflow mode') || 'standard' };
}

function replaceSection(text, heading, body) {
  const pattern = new RegExp(`^## ${heading}\\n[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, 'm');
  const section = `## ${heading}\n\n${body}\n\n`;
  return pattern.test(text) ? text.replace(pattern, () => section) : `${text.trimEnd()}\n\n${section}`;
}

function saveContext(ctx) {
  const cell = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const row = (values) => `| ${values.map(cell).join(' | ')} |`;
  let text = replaceSection(ctx.text, 'Artifact records', '```json\n' + JSON.stringify(ctx.records, null, 2) + '\n```');
  text = replaceSection(text, 'Produced files', [
    '| Artifact | Path | Version | Status | SHA-256 |',
    '| --- | --- | --- | --- | --- |',
    ...Object.entries(ctx.records.artifacts).map(([id, r]) => row([id, r.path, r.version, r.status, r.sha256]))
  ].join('\n'));
  text = replaceSection(text, 'Approval log', [
    '| Artifact | Path | Version | SHA-256 | Approved scope | Approved at | Approved by | Approval state |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ctx.records.approvals.map(r => row([r.artifact, r.path, r.version, r.sha256, r.scope, r.at, r.by, r.state]))
  ].join('\n'));
  text = setField(text, 'Last updated', new Date().toISOString());
  fs.writeFileSync(ctx.statePath, text, 'utf8');
  ctx.text = text;
}

function invalidate(ctx, ids) {
  const affected = new Set(ids);
  let changed;
  do {
    changed = false;
    for (const [id, record] of Object.entries(ctx.records.artifacts)) {
      if (!affected.has(id) && record.inputs.some(input => affected.has(input.artifact))) {
        affected.add(id);
        changed = true;
      }
    }
  } while (changed);
  for (const id of affected) {
    const record = ctx.records.artifacts[id];
    record.status = 'ready-for-review';
    record.review_required = true;
    for (const approval of ctx.records.approvals) {
      if (approval.artifact === id && approval.state === 'valid') approval.state = 'stale';
    }
  }
  if (affected.size) {
    ctx.text = setField(ctx.text, 'Status', 'ready-for-review');
    if (extractField(ctx.text, 'Current stage') === 'completed') {
      const kind = ARTIFACT_KINDS.find(kind => [...affected].some(id => ctx.records.artifacts[id].kind === kind));
      ctx.text = setField(ctx.text, 'Current stage', ['boundary', 'decision'].includes(kind) ? 'clarifying' : kind);
      ctx.text = replaceSection(ctx.text, 'Next step', '- Reconcile affected product artifacts and request fresh specification approval.');
    }
  }
  return [...affected];
}

function checkArtifacts(ctx) {
  const problems = [];
  for (const [id, record] of Object.entries(ctx.records.artifacts)) {
    if (!Array.isArray(record.inputs)) throw new Error(`Invalid input records for ${id}`);
    try {
      if (fingerprint(insideProject(ctx.projectDir, record.path)) !== record.sha256) problems.push(id);
    } catch (error) { problems.push(id); }
    if (record.status === 'approved' && !ctx.records.approvals.some(approval => approval.state === 'valid' &&
        approval.artifact === id && approval.version === record.version && approval.sha256 === record.sha256)) problems.push(id);
    if (record.review_required || record.inputs.some(input => {
      const upstream = ctx.records.artifacts[input.artifact];
      return !upstream || upstream.version !== input.version || upstream.sha256 !== input.sha256;
    })) problems.push(id);
  }
  return invalidate(ctx, new Set(problems));
}

function gate(ctx, stage, { draft = false, prototypeRequired = false } = {}) {
  if (!ARTIFACT_KINDS.includes(stage)) throw new Error('Unknown stage');
  const records = Object.values(ctx.records.artifacts);
  const current = kind => records.find(r => r.kind === kind && !r.review_required);
  const approved = kind => {
    const record = current(kind);
    return record?.status === 'approved' && ctx.records.approvals.some(a => a.state === 'valid' &&
      a.path === record.path && a.version === record.version && a.sha256 === record.sha256);
  };
  if (stage === 'spec' && ctx.mode !== 'fast' && !draft &&
      (!approved('prd') || (prototypeRequired && !approved('prototype')))) {
    return { allowed: false, reason: 'Standard mode requires an approved PRD and relevant prototype; request an assumption-based draft or explicitly enable fast mode' };
  }
  return { allowed: true, mode: ctx.mode, stage };
}

function metadataUpdate(ctx, record, status, version) {
  const target = insideProject(ctx.projectDir, record.path);
  const markdownFiles = [];
  function walk(file) {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('Artifact metadata cannot follow symbolic links');
    if (stat.isDirectory()) fs.readdirSync(file).forEach(name => walk(path.join(file, name)));
    else if (file.endsWith('.md')) markdownFiles.push(file);
  }
  walk(target);
  for (const file of markdownFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const updated = text.replace(/^(- )?Status:[ \t]*.*$/gm, (_, prefix = '') => `${prefix}Status: ${status}`)
      .replace(/^(- )?Artifact version:[ \t]*.*$/gm, (_, prefix = '') => `${prefix}Artifact version: ${version}`);
    if (updated !== text) fs.writeFileSync(file, updated, 'utf8');
  }
}

function registerArtifact(ctx, args) {
  if (!args.artifact || !args.kind || !args.path) throw new Error('--artifact, --kind and --path are required');
  validateSlug(args.artifact);
  if (!ARTIFACT_KINDS.includes(args.kind)) throw new Error('Unsupported artifact kind');
  checkArtifacts(ctx);
  saveContext(ctx);
  const previous = ctx.records.artifacts[args.artifact];
  const inputIds = args.inputs === undefined ? (previous?.inputs.map(input => input.artifact) || []) :
    [...new Set(args.inputs.split(',').filter(Boolean))];
  for (const id of inputIds) {
    const input = ctx.records.artifacts[id];
    if (!input || input.review_required || id === args.artifact) throw new Error(`Refresh upstream artifact ${id} before registering this output`);
  }
  const dependsOn = (id, seen = new Set()) => {
    if (id === args.artifact) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return ctx.records.artifacts[id].inputs.some(input => dependsOn(input.artifact, seen));
  };
  if (inputIds.some(id => dependsOn(id))) throw new Error('Artifact dependencies must not contain a cycle');
  const requiredKind = args.kind === 'spec' ? 'prd' : null;
  if (requiredKind && !inputIds.some(id => ctx.records.artifacts[id].kind === requiredKind)) {
    throw new Error(`${args.kind} must record its ${requiredKind} input`);
  }
  const result = gate(ctx, args.kind, { draft: args.draft === 'true', prototypeRequired: inputIds.some(id => ctx.records.artifacts[id].kind === 'prototype') });
  if (!result.allowed) throw new Error(result.reason);
  const absolute = insideProject(ctx.projectDir, args.path);
  const old = ctx.records.artifacts[args.artifact];
  const initialHash = fingerprint(absolute);
  const inputs = inputIds.map(artifact => {
    const input = ctx.records.artifacts[artifact];
    return { artifact, version: input.version, sha256: input.sha256 };
  });
  const changed = old && (old.path !== path.relative(ctx.projectDir, absolute).split(path.sep).join('/') ||
    old.sha256 !== initialHash || JSON.stringify(old.inputs) !== JSON.stringify(inputs) || old.review_required);
  const version = args.version || (changed ? `v${Number(old.version.slice(1)) + 1}` : old?.version || 'v1');
  if (!/^v[1-9]\d*$/.test(version) || (changed && Number(version.slice(1)) <= Number(old.version.slice(1)))) {
    throw new Error('A revision must increment the artifact version (v1, v2, ...)');
  }
  if (old && (old.kind !== args.kind || (version !== old.version && !changed))) throw new Error('Keep artifact identity and unchanged versions stable');
  if (Object.entries(ctx.records.artifacts).some(([id, r]) => id !== args.artifact && (r.kind === args.kind && GATED_STAGES.includes(r.kind) || r.path === path.relative(ctx.projectDir, absolute).split(path.sep).join('/')))) {
    throw new Error('Update the existing artifact ID instead of duplicating its kind or path');
  }
  if (changed) invalidate(ctx, [args.artifact]);
  const record = { kind: args.kind, path: path.relative(ctx.projectDir, absolute).split(path.sep).join('/'), version,
    status: !changed && old ? old.status : 'ready-for-review', sha256: initialHash, inputs, review_required: false };
  metadataUpdate(ctx, record, record.status, version);
  record.sha256 = fingerprint(absolute);
  ctx.records.artifacts[args.artifact] = record;
  const stage = record.kind === 'spec' && record.status === 'approved' ? 'completed' :
    ['boundary', 'decision'].includes(record.kind) ? 'clarifying' : record.kind;
  ctx.text = setField(ctx.text, 'Current stage', stage);
  ctx.text = setField(ctx.text, 'Status', record.status);
  if (stage !== 'completed') ctx.text = replaceSection(ctx.text, 'Next step', `- Review ${record.kind} ${record.version}; continue product definition through specification approval.`);
  saveContext(ctx);
  return { artifact: args.artifact, ...record };
}

function approveArtifact(ctx, args) {
  const affected = checkArtifacts(ctx);
  saveContext(ctx);
  const record = ctx.records.artifacts[args.artifact];
  if (!record || affected.includes(args.artifact)) throw new Error('Register the current artifact and all changed inputs before requesting approval');
  if (!args.version || args.version !== record.version || args.sha256 !== record.sha256 || !args.scope || !args.confirmation) {
    throw new Error('Approval must bind --artifact, --version, --sha256, --scope and the user response in --confirmation');
  }
  const unapprovedInputs = record.inputs.filter(input => ctx.records.artifacts[input.artifact].status !== 'approved');
  const includeInputs = args['include-inputs'] === 'true';
  if (includeInputs && !(ctx.mode === 'fast' && record.kind === 'spec')) {
    throw new Error('Input-scope approval is available only for fast-mode specifications');
  }
  if (unapprovedInputs.length && !(ctx.mode === 'fast' && record.kind === 'spec' && includeInputs)) {
    throw new Error('Approve upstream inputs first, or explicitly confirm the fast-mode specification with its input scope');
  }
  const approvedAt = normalizeTimestamp(args.now);
  const before = record.sha256;
  metadataUpdate(ctx, record, 'approved', record.version);
  record.status = 'approved';
  record.sha256 = fingerprint(insideProject(ctx.projectDir, record.path));
  // Only this known status-only transition may refresh downstream fingerprints.
  for (const downstream of Object.values(ctx.records.artifacts)) {
    for (const input of downstream.inputs) {
      if (input.artifact === args.artifact && input.version === record.version && input.sha256 === before) input.sha256 = record.sha256;
    }
  }
  for (const approval of ctx.records.approvals) {
    if (approval.artifact === args.artifact && approval.state === 'valid') approval.state = 'superseded';
  }
  ctx.records.approvals.push({ artifact: args.artifact, path: record.path, version: record.version, sha256: record.sha256,
    scope: args.scope, at: approvedAt, by: args.by || 'workspace user', state: 'valid',
    confirmation: args.confirmation, includes_input_scope: includeInputs, inputs: record.inputs.map(input => ({ ...input })) });
  if (record.kind === 'spec') {
    ctx.text = setField(setField(ctx.text, 'Current stage', 'completed'), 'Status', record.status);
    ctx.text = replaceSection(ctx.text, 'Next step', '- Product definition complete. Hand off the approved specification and its linked artifacts to the development workflow.');
  } else if (extractField(ctx.text, 'Current stage') === record.kind) ctx.text = setField(ctx.text, 'Status', record.status);
  saveContext(ctx);
  return { artifact: args.artifact, status: record.status, sha256: record.sha256 };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === 'init') initialize(args);
  else if (command === 'hash') {
    if (!args.path) throw new Error('--path is required');
    process.stdout.write(JSON.stringify({ path: path.resolve(args.path), sha256: fingerprint(args.path) }) + '\n');
  } else if (['mode', 'register', 'approve', 'check', 'gate'].includes(command)) {
    if (command === 'gate' && !GATED_STAGES.includes(args.stage)) throw new Error('Unknown stage');
    const ctx = loadContext(args);
    let result;
    if (command === 'mode') {
      setMode(ctx.statePath, args.mode);
      result = { mode: args.mode };
    } else if (command === 'register') result = registerArtifact(ctx, args);
    else if (command === 'approve') result = approveArtifact(ctx, args);
    else {
      const affected = checkArtifacts(ctx);
      saveContext(ctx);
      result = command === 'check' ? { valid: affected.length === 0, needs_review: affected } :
        gate(ctx, args.stage, { draft: args.draft === 'true', prototypeRequired: args['prototype-required'] === 'true' });
      if (result.valid === false || result.allowed === false) process.exitCode = 1;
    }
    process.stdout.write(JSON.stringify(result) + '\n');
  } else {
    throw new Error('Usage: workflow-state.cjs <init|hash|mode|register|approve|check|gate> [options]');
  }
}

if (require.main === module) {
  try { main(); } catch (error) { fail(error.message); }
}

module.exports = { availableSlug, fingerprint, stateTemplate, validateSlug, loadContext, checkArtifacts,
  registerArtifact, approveArtifact, gate, setMode };
