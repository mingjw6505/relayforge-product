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
  validateSlug
} = require('../skills/using-relayforge-product/scripts/workflow-state.cjs');

const helperScript = path.resolve(__dirname, '../skills/using-relayforge-product/scripts/workflow-state.cjs');

test('validates portable requirement slugs', () => {
  assert.doesNotThrow(() => validateSlug('appointment-reminders-2'));
  assert.throws(() => validateSlug('Appointment reminders'));
  assert.throws(() => validateSlug('预约提醒'));
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
