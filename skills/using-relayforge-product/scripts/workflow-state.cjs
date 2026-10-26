#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('slug must contain lowercase ASCII letters, numbers, and single hyphens only');
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function fingerprint(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return sha256(fs.readFileSync(target));
  if (!stat.isDirectory()) throw new Error('hash target must be a regular file or directory');

  const root = path.resolve(target);
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  walk(root);
  files.sort((a, b) => path.relative(root, a).localeCompare(path.relative(root, b), 'en'));
  const manifest = files.map((file) => {
    const relative = path.relative(root, file).split(path.sep).join('/');
    return `${relative}\t${sha256(fs.readFileSync(file))}`;
  }).join('\n') + (files.length ? '\n' : '');
  return sha256(Buffer.from(manifest, 'utf8'));
}

function extractField(markdown, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^- ${escaped}:\\s*(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

function sameRequirement(statePath, name, request) {
  try {
    const text = fs.readFileSync(statePath, 'utf8');
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
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('--now must be a valid ISO 8601 timestamp');
  return value || date.toISOString();
}

function stateTemplate({ name, slug, request, now }) {
  return `# ${name}\n\n` +
    `- Requirement slug: ${slug}\n` +
    `- Current stage: discovery\n` +
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
  const relayforgeDir = path.join(projectDir, 'docs', 'relayforge');
  const workflowsDir = path.join(relayforgeDir, 'workflows');
  const now = normalizeTimestamp(args.now);
  const request = oneLine(args.request);
  const name = oneLine(args.name);
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
      now
    }), { encoding: 'utf8', flag: 'wx' });
  }

  const relativeState = `docs/relayforge/workflows/${resolved.slug}/state.md`;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === 'init') initialize(args);
  else if (command === 'hash') {
    if (!args.path) throw new Error('--path is required');
    process.stdout.write(JSON.stringify({ path: path.resolve(args.path), sha256: fingerprint(args.path) }) + '\n');
  } else {
    throw new Error('Usage: workflow-state.cjs <init|hash> [options]');
  }
}

if (require.main === module) {
  try { main(); } catch (error) { fail(error.message); }
}

module.exports = { availableSlug, fingerprint, stateTemplate, validateSlug };
