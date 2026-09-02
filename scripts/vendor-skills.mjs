#!/usr/bin/env node
// Maintainer-run tool. Fetches pinned third-party skills into templates/vendor/
// and records their provenance. Network access lives only here — never in src/.
//
// Usage:
//   node scripts/vendor-skills.mjs            # fetch every manifest entry
//   node scripts/vendor-skills.mjs --check     # verify the committed payload
//                                                 matches its recorded hash; no network

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(ROOT, 'templates', 'vendor');

/** Every vendored skill. Add an entry here, then run this script with no flags. */
const MANIFEST = [
  {
    name: 'frontend-design',
    repo: 'anthropics/skills',
    subpath: 'skills/frontend-design',
    ref: '53048666b05b4799081517d00e09e0a2dd688678',
    license: 'Apache-2.0',
  },
];

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function ghApi(apiPath) {
  const out = execFileSync('gh', ['api', apiPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(out);
}

/** Recursively lists every file under `subpath` at `ref`, as { relativePath, content }. */
function fetchTree(repo, subpath, ref, prefix = '') {
  const entries = ghApi(`repos/${repo}/contents/${subpath}?ref=${ref}`);
  const files = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'dir') {
      files.push(...fetchTree(repo, `${subpath}/${entry.name}`, ref, relativePath));
    } else if (entry.type === 'file') {
      const blob = ghApi(`repos/${repo}/contents/${subpath}/${entry.name}?ref=${ref}`);
      const content = Buffer.from(blob.content, 'base64').toString('utf8');
      files.push({ relativePath, content });
    }
  }
  return files;
}

function fetchOne(entry) {
  const dir = path.join(VENDOR_DIR, entry.name);
  mkdirSync(dir, { recursive: true });

  const files = fetchTree(entry.repo, entry.subpath, entry.ref);
  const skillFile = files.find((f) => f.relativePath === 'SKILL.md');
  if (!skillFile) {
    throw new Error(`${entry.repo}/${entry.subpath}@${entry.ref} has no SKILL.md at its root`);
  }

  for (const file of files) {
    const target = path.join(dir, file.relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, file.content, 'utf8');
  }

  const provenance = {
    source: entry.repo,
    subpath: entry.subpath,
    ref: entry.ref,
    license: entry.license,
    sha256: sha256(skillFile.content),
  };
  writeFileSync(path.join(dir, 'provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  console.log(`vendored ${entry.name} <- ${entry.repo}/${entry.subpath}@${entry.ref.slice(0, 12)} (${files.length} file(s))`);
}

function checkOne(entry) {
  const dir = path.join(VENDOR_DIR, entry.name);
  const provenancePath = path.join(dir, 'provenance.json');
  const skillPath = path.join(dir, 'SKILL.md');
  if (!existsSync(provenancePath) || !existsSync(skillPath)) {
    console.error(`MISSING: ${entry.name} has not been vendored yet (run without --check)`);
    return false;
  }
  const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'));
  const actual = sha256(readFileSync(skillPath, 'utf8'));
  if (actual !== provenance.sha256) {
    console.error(`DRIFT: templates/vendor/${entry.name}/SKILL.md does not match its recorded hash — hand-edited or corrupted`);
    return false;
  }
  console.log(`OK: ${entry.name} matches its recorded hash`);
  return true;
}

const checkOnly = process.argv.includes('--check');
let ok = true;
for (const entry of MANIFEST) {
  if (checkOnly) {
    ok = checkOne(entry) && ok;
  } else {
    fetchOne(entry);
  }
}
if (checkOnly && !ok) process.exit(1);
