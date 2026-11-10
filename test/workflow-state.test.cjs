const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');

const {
  availableSlug,
  fingerprint,
  stateTemplate,
  validateSlug,
  loadContext,
  checkArtifacts,
  registerArtifact,
  approveArtifact,
  gate
} = require('../skills/using-relayforge-product/scripts/workflow-state.cjs');

const helperScript = path.resolve(__dirname, '../skills/using-relayforge-product/scripts/workflow-state.cjs');

test('validates portable requirement slugs', () => {
  assert.doesNotThrow(() => validateSlug('appointment-reminders-2'));
  assert.throws(() => validateSlug('Appointment reminders'));
  assert.throws(() => validateSlug('预约提醒'));
  assert.throws(() => validateSlug('con'));
});

test('snapshot projects valid approvals and transitive invalidation without writing files', t => {
  const w = workflow(t);
  w.write('prd'); w.register('prd'); w.approve('prd');
  w.write('spec'); w.register('spec', 'prd'); w.approve('spec');
  const read = () => {
    const result = spawnSync(process.execPath, [helperScript, 'snapshot', '--project-dir', w.root, '--state', 'state.md'], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const before = fs.readFileSync(path.join(w.root, 'state.md'));
  const valid = read();
  assert.strictEqual(valid.product.integrity.status, 'valid');
  assert.strictEqual(valid.product.current_stage, 'completed');
  assert.strictEqual(valid.product.artifacts.find(a => a.id === 'spec').effective_status, 'approved');
  assert.ok(!JSON.stringify(valid).includes('confirmation'));
  fs.appendFileSync(path.join(w.root, 'prd.md'), '\nNew scope\n');
  const invalid = read();
  assert.strictEqual(invalid.product.integrity.status, 'invalid');
  assert.deepStrictEqual(invalid.product.integrity.affected.sort(), ['prd', 'spec']);
  assert.strictEqual(invalid.product.observed_stage, 'prd');
  assert.strictEqual(invalid.product.artifacts.find(a => a.id === 'spec').effective_status, 'needs-review');
  assert.deepStrictEqual(fs.readFileSync(path.join(w.root, 'state.md')), before);
});

test('snapshot preserves persisted stale approvals after restoring bytes and rejects symlink escapes', t => {
  const w = workflow(t);
  w.write('prd'); w.register('prd'); w.approve('prd');
  const file = path.join(w.root, 'prd.md');
  const original = fs.readFileSync(file);
  fs.appendFileSync(file, '\nChange\n');
  checkArtifacts(w.ctx);
  // Persist exactly the already-invalidated context through the normal public CLI.
  const checked = spawnSync(process.execPath, [helperScript,'check','--project-dir',w.root,'--state','state.md'],{encoding:'utf8'});
  assert.strictEqual(checked.status,1);
  fs.writeFileSync(file,original);
  const read = () => spawnSync(process.execPath,[helperScript,'snapshot','--project-dir',w.root,'--state','state.md'],{encoding:'utf8'});
  const stale=read();assert.strictEqual(stale.status,0,stale.stderr);
  assert.strictEqual(JSON.parse(stale.stdout).product.artifacts[0].effective_status,'needs-review');
  assert.strictEqual(JSON.parse(stale.stdout).product.approvals[0].state,'stale');
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(w.root,'state.md'),file);
  const unsafe=read();assert.notStrictEqual(unsafe.status,0);assert.match(unsafe.stderr,/unsafe_source/);
});

test('snapshot handles empty state and legacy tables without initialization or migration', t => {
  const w=workflow(t);
  const read=()=>spawnSync(process.execPath,[helperScript,'snapshot','--project-dir',w.root,'--state','state.md'],{encoding:'utf8'});
  const before=fs.readFileSync(path.join(w.root,'state.md'));
  const empty=read();assert.strictEqual(empty.status,0,empty.stderr);
  assert.deepStrictEqual(JSON.parse(empty.stdout).product.artifacts,[]);
  assert.deepStrictEqual(fs.readFileSync(path.join(w.root,'state.md')),before);
  fs.appendFileSync(path.join(w.root,'state.md'),'\n| PRD | old.md | v1 | approved |\n');
  const legacy=read();assert.notStrictEqual(legacy.status,0);assert.match(legacy.stderr,/migration_required/);
});

test('snapshot rejects mixed-version reads and oversized artifact collections', t => {
  const w=workflow(t);w.write('prd');w.register('prd');
  const rules=require('../skills/using-relayforge-product/scripts/workflow-state.cjs');
  const {snapshot}=require('../skills/using-relayforge-product/scripts/workflow-snapshot.cjs');
  let calls=0;
  assert.throws(()=>snapshot({'project-dir':w.root,state:'state.md'},{...rules,fingerprint(file){
    const result=rules.fingerprint(file);
    if(++calls===1)fs.appendFileSync(file,'\nConcurrent edit\n');
    return result;
  }}),/source_changed/);
  const records={schema_version:1,artifacts:Object.fromEntries(Array.from({length:65},(_,i)=>['a'+i,{kind:'prd'}])),approvals:[]};
  fs.writeFileSync(path.join(w.root,'state.md'),stateTemplate({name:'Large',slug:'large',request:'Example',now:'2026-11-10T10:00:00+08:00'})+'\n## Artifact records\n\n```json\n'+JSON.stringify(records)+'\n```\n');
  const result=spawnSync(process.execPath,[helperScript,'snapshot','--project-dir',w.root,'--state','state.md'],{encoding:'utf8'});
  assert.notStrictEqual(result.status,0);assert.match(result.stderr,/source_too_large/);
});

test('resumes a UTF-8 BOM/CRLF state without duplicating the requirement', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-crlf-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, 'sample');
  fs.mkdirSync(dir);
  const text = stateTemplate({ name: 'Sample', slug: 'sample', request: 'Create reminders', now: '2026-11-10T10:00:00+08:00' });
  fs.writeFileSync(path.join(dir, 'state.md'), '\uFEFF' + text.replace(/\n/g, '\r\n'));
  assert.deepStrictEqual(availableSlug(root, 'sample', 'Sample', 'Create reminders'), { slug: 'sample', existing: true });
});

test('init honors project documentation conventions and persists explicit modes across resume', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-mode-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const args = [helperScript, 'init', '--project-dir', root, '--docs-dir', 'product/requirements',
    '--slug', 'sample', '--name', 'Sample', '--request', 'Create reminders'];
  const first = spawnSync(process.execPath, [...args, '--mode', 'fast'], { encoding: 'utf8' });
  assert.strictEqual(first.status, 0, first.stderr);
  const state = JSON.parse(first.stdout).state_file;
  assert.match(fs.readFileSync(state, 'utf8'), /Workflow mode: fast/);
  assert.strictEqual(fs.existsSync(path.join(root, 'docs/relayforge')), false);
  const again = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(again.stdout).type, 'requirement-resumed');
  assert.match(fs.readFileSync(state, 'utf8'), /Workflow mode: fast/);
  const pointer = fs.readFileSync(path.join(root, 'product/requirements/workflow-state.md'), 'utf8');
  assert.match(pointer, /State file: product\/requirements\/workflows\/sample\/state.md/);
  const escape = spawnSync(process.execPath, [...args, '--docs-dir', '../outside'], { encoding: 'utf8' });
  assert.strictEqual(escape.status, 1);
});

function workflow(t, mode = 'standard') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const statePath = path.join(root, 'state.md');
  fs.writeFileSync(statePath, stateTemplate({ name: 'Sample', slug: 'sample', request: 'Product', now: '2026-11-10T10:00:00+08:00', mode }));
  const ctx = loadContext({ 'project-dir': root, state: 'state.md' });
  const write = (id, text = 'Initial product behavior') => fs.writeFileSync(path.join(root, `${id}.md`), `# ${id}\n\nArtifact version: v1\nStatus: ready-for-review\n\n${text}\n`);
  const register = (id, inputs = '', extra = {}) => registerArtifact(ctx, { artifact: id, kind: id, path: `${id}.md`, inputs, ...extra });
  const approve = (id, extra = {}) => {
    const record = ctx.records.artifacts[id];
    return approveArtifact(ctx, { artifact: id, version: record.version, sha256: record.sha256,
      scope: 'Goals, scope, behavior and acceptance criteria', confirmation: `确认 ${id} ${record.version}`, ...extra });
  };
  return { root, ctx, write, register, approve };
}

test('standard mode blocks specs until PRD approval and completes at spec approval', t => {
  const w = workflow(t);
  w.write('prd'); w.register('prd');
  w.write('spec');
  assert.throws(() => w.register('spec', 'prd'), /Standard mode/);
  w.approve('prd');
  w.register('spec', 'prd');
  assert.match(w.ctx.text, /^- Current stage: spec$/m);
  assert.match(w.ctx.text, /^- Status: ready-for-review$/m);
  w.approve('spec');
  assert.match(w.ctx.text, /^- Current stage: completed$/m);
  assert.match(w.ctx.text, /^- Status: approved$/m);
  assert.match(w.ctx.text, /Hand off the approved specification/);
  w.register('spec', 'prd');
  assert.match(w.ctx.text, /^- Current stage: completed$/m);
  assert.deepStrictEqual(checkArtifacts(w.ctx), []);
});

test('standard mode requires only relevant prototype approval and permits an explicitly requested spec draft', t => {
  const w = workflow(t);
  w.write('prd'); w.register('prd'); w.approve('prd');
  w.write('prototype'); w.register('prototype', 'prd');
  assert.strictEqual(gate(w.ctx, 'spec', { prototypeRequired: true }).allowed, false);
  assert.strictEqual(gate(w.ctx, 'spec').allowed, true);
  w.write('spec'); w.register('spec', 'prd,prototype', { draft: 'true' });
  assert.throws(() => w.approve('spec'), /Approve upstream/);
  w.approve('prototype'); w.approve('spec');
  assert.deepStrictEqual(checkArtifacts(w.ctx), []);
});

test('fast mode completes only after bound specification and input-scope approval', t => {
  const w = workflow(t, 'fast');
  w.write('prd'); w.register('prd');
  w.write('prototype'); w.register('prototype', 'prd');
  w.write('spec'); w.register('spec', 'prd,prototype');
  assert.match(w.ctx.text, /^- Current stage: spec$/m);
  assert.throws(() => w.approve('spec'), /Approve upstream/);
  assert.doesNotMatch(w.ctx.text, /^- Current stage: completed$/m);
  w.approve('spec', { 'include-inputs': 'true' });
  assert.strictEqual(w.ctx.records.artifacts.prd.status, 'ready-for-review');
  assert.strictEqual(w.ctx.records.artifacts.prototype.status, 'ready-for-review');
  assert.match(w.ctx.text, /^- Current stage: completed$/m);
  const approval = w.ctx.records.approvals.find(a => a.artifact === 'spec');
  assert.strictEqual(approval.includes_input_scope, true);
  assert.strictEqual(approval.inputs.length, 2);
});

test('upstream edits invalidate approvals transitively and re-registering increments versions', t => {
  const w = workflow(t, 'fast');
  w.write('prd'); w.register('prd');
  w.write('prototype'); w.register('prototype', 'prd');
  w.write('spec'); w.register('spec', 'prd,prototype'); w.approve('spec', { 'include-inputs': 'true' });
  fs.appendFileSync(path.join(w.root, 'prd.md'), '\nScope changed\n');
  assert.deepStrictEqual(new Set(checkArtifacts(w.ctx)), new Set(['prd', 'prototype', 'spec']));
  assert.match(w.ctx.text, /^- Current stage: prd$/m);
  assert.match(w.ctx.text, /^- Status: ready-for-review$/m);
  assert.ok(w.ctx.records.approvals.every(a => a.state === 'stale'));
  assert.throws(() => w.register('spec', 'prd,prototype'), /Refresh upstream/);
  assert.strictEqual(w.register('prd').version, 'v2');
  assert.strictEqual(w.ctx.records.artifacts.spec.review_required, true);
  assert.strictEqual(w.register('prototype', 'prd').version, 'v2');
  assert.strictEqual(w.register('spec', 'prd,prototype').version, 'v2');
  assert.strictEqual(w.ctx.records.artifacts.spec.inputs[0].version, 'v2');
  w.approve('spec', { 'include-inputs': 'true' });
  assert.match(w.ctx.text, /^- Current stage: completed$/m);
});

test('approval rejects a stale version or fingerprint and a forged approved status', t => {
  const w = workflow(t);
  w.write('prd'); w.register('prd');
  assert.throws(() => w.approve('prd', { version: 'v9' }), /Approval must bind/);
  assert.throws(() => w.approve('prd', { sha256: '0'.repeat(64) }), /Approval must bind/);
  const before = fingerprint(path.join(w.root, 'prd.md'));
  assert.throws(() => w.approve('prd', { now: '2026-11-10' }), /timestamp with timezone/);
  assert.strictEqual(fingerprint(path.join(w.root, 'prd.md')), before);
  w.ctx.records.artifacts.prd.status = 'approved';
  assert.strictEqual(gate(w.ctx, 'spec').allowed, false);
  assert.deepStrictEqual(checkArtifacts(w.ctx), ['prd']);
});

test('artifact dependencies cannot introduce a cycle', t => {
  const w = workflow(t, 'fast');
  w.write('prd'); w.register('prd');
  w.write('prototype'); w.register('prototype', 'prd');
  assert.throws(() => w.register('prd', 'prototype'), /cycle/);
});

test('CLI completion persists across turns and reopens after a missing upstream', t => {
  const w = workflow(t);
  const run = (command, args = [], expectedStatus = 0) => {
    const result = spawnSync(process.execPath, [helperScript, command, '--project-dir', w.root, '--state', 'state.md', ...args], { encoding: 'utf8' });
    assert.strictEqual(result.status, expectedStatus, result.stderr);
    return JSON.parse(result.stdout);
  };
  run('mode', ['--mode', 'fast']);
  w.write('prd');
  const prd = run('register', ['--artifact', 'prd', '--kind', 'prd', '--path', 'prd.md']);
  assert.strictEqual(prd.version, 'v1');
  w.write('spec');
  const spec = run('register', ['--artifact', 'spec', '--kind', 'spec', '--path', 'spec.md', '--inputs', 'prd']);
  run('approve', ['--artifact', 'spec', '--version', spec.version, '--sha256', spec.sha256,
    '--scope', 'Spec behavior, acceptance criteria and PRD v1 goal/scope',
    '--confirmation', '确认规格 v1，包含引用的 PRD v1 目标和范围', '--include-inputs', 'true']);
  assert.strictEqual(run('check').valid, true);
  const approvedState = loadContext({ 'project-dir': w.root, state: 'state.md' });
  assert.match(approvedState.text, /Current stage: completed/);
  assert.match(approvedState.text, /^- Status: approved$/m);
  fs.unlinkSync(path.join(w.root, 'prd.md'));
  assert.deepStrictEqual(new Set(run('check', [], 1).needs_review), new Set(['prd', 'spec']));
  const resumed = loadContext({ 'project-dir': w.root, state: 'state.md' });
  assert.strictEqual(resumed.mode, 'fast');
  assert.match(resumed.text, /^- Current stage: prd$/m);
  assert.match(resumed.text, /^- Status: ready-for-review$/m);
  assert.strictEqual(resumed.records.approvals[0].state, 'stale');
  assert.strictEqual((resumed.text.match(/^## Artifact records$/gm) || []).length, 1);
});

test('out-of-scope stages and artifact kinds are rejected without creating output records', t => {
  const w = workflow(t);
  assert.throws(() => gate(w.ctx, 'implementation'), /Unknown stage/);
  w.write('implementation');
  assert.throws(() => w.register('implementation'), /Unsupported artifact kind/);
  assert.deepStrictEqual(w.ctx.records.artifacts, {});
  const result = spawnSync(process.execPath, [helperScript, 'gate', '--project-dir', w.root, '--state', 'state.md', '--stage', 'implementation'], { encoding: 'utf8' });
  assert.strictEqual(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /Unknown stage/);
});

test('selects the next available suffix without mixing requirements', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'appointment-reminders'));
  fs.writeFileSync(
    path.join(root, 'appointment-reminders', 'state.md'),
    stateTemplate({ name: 'Another requirement', slug: 'appointment-reminders', request: 'other', now: '2026-10-26T10:00:00+08:00' })
  );
  assert.deepStrictEqual(
    availableSlug(root, 'appointment-reminders', 'Appointment reminders', 'Create reminders'),
    { slug: 'appointment-reminders-2', existing: false }
  );
});

test('recognizes an idempotent resume of the same requirement', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-state-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'appointment-reminders'));
  fs.writeFileSync(
    path.join(root, 'appointment-reminders', 'state.md'),
    stateTemplate({ name: 'Appointment reminders', slug: 'appointment-reminders', request: 'Create reminders', now: '2026-10-26T10:00:00+08:00' })
  );
  assert.deepStrictEqual(
    availableSlug(root, 'appointment-reminders', 'Appointment reminders', 'Create reminders'),
    { slug: 'appointment-reminders', existing: true }
  );
});

test('directory fingerprints are stable and change with contents', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-hash-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'b.txt'), 'b');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a');
  const first = fingerprint(root);
  assert.strictEqual(first, fingerprint(root));
  fs.writeFileSync(path.join(root, 'a.txt'), 'changed');
  assert.notStrictEqual(first, fingerprint(root));
});

test('init command creates state and pointer, then resumes idempotently', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relayforge-init-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const args = [
    helperScript, 'init', '--project-dir', root, '--slug', 'appointment-reminders',
    '--name', 'Appointment reminders', '--request', 'Create\nreminders',
    '--now', '2026-10-26T10:00:00+08:00'
  ];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.strictEqual(first.status, 0, first.stderr);
  const initialized = JSON.parse(first.stdout);
  assert.strictEqual(initialized.type, 'requirement-initialized');
  assert.match(fs.readFileSync(initialized.state_file, 'utf8'), /## Readiness\n\n```yaml/);
  assert.match(fs.readFileSync(initialized.pointer_file, 'utf8'), /Active requirement: appointment-reminders/);

  const second = spawnSync(process.execPath, args, { encoding: 'utf8' });
  assert.strictEqual(second.status, 0, second.stderr);
  assert.strictEqual(JSON.parse(second.stdout).type, 'requirement-resumed');
});
