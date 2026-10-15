// Automatic semver evaluation.
//
// Channel is derived from the ref being built:
//   - dev branch  -> next patch prerelease of the latest stable tag,
//                    e.g. latest stable v1.2.3 => v1.2.4-dev.1, v1.2.4-dev.2, ...
//   - main branch -> next stable patch tag, e.g. latest stable v1.2.3 => v1.2.4
//
// Prints the computed version (without leading 'v') to stdout.
// Exits with code 3 and prints the existing version if the computed tag
// already exists, so workflows can treat re-runs as idempotent.
const { execSync } = require('child_process');

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function listTags() {
  try {
    return sh('git tag --list "v*"')
      .split('\n')
      .map(t => t.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseStable(tag) {
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
  return b[0] - a[0] || b[1] - a[1] || b[2] - a[2];
}

const ref = process.env.GITHUB_REF || '';
const isDev = ref.endsWith('/dev');
const tags = listTags();
const stables = tags.map(parseStable).filter(Boolean).sort(compare);
const base = stables[0] || [0, 0, 0];

let version;
if (isDev) {
  const pre = `${base[0]}.${base[1]}.${base[2] + 1}`;
  const count = tags.filter(t => t === `v${pre}-dev` || t.startsWith(`v${pre}-dev.`)).length;
  version = `${pre}-dev.${count + 1}`;
} else {
  version = `${base[0]}.${base[1]}.${base[2] + 1}`;
}

const tag = `v${version}`;
if (tags.includes(tag)) {
  process.stdout.write(tag.replace(/^v/, ''));
  process.exit(3);
}

process.stdout.write(version);
