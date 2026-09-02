#!/usr/bin/env node
// Maintainer-run tool. Fetches pinned third-party skills into templates/vendor/
// and records their provenance. Network access lives only here — never in src/.
//
// Usage:
//   node scripts/vendor-skills.mjs             # fetch every manifest entry
//   node scripts/vendor-skills.mjs --check     # verify the committed payload
//                                                 matches its recorded hash; no network
//   node scripts/vendor-skills.mjs --outdated  # compare the committed payload's CONTENT
//                                                 against each tracked upstream branch
//
// --outdated exits 0 when every entry is current, 1 when one has drifted, and
// 2 when it could not determine the answer. The split matters: collapsing 1
// and 2 would report an API outage or a deleted upstream subpath as ordinary
// drift, and `.github/workflows/vendor-check.yml` files an issue on 1.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, renderNotices } from './vendored-manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(ROOT, 'templates', 'vendor');
const NOTICES_PATH = path.join(ROOT, 'THIRD_PARTY_NOTICES.md');

/** contexture authors this one; it is not part of what upstream ships. */
const PROVENANCE_FILE_NAME = 'provenance.json';

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
  writeFileSync(path.join(dir, PROVENANCE_FILE_NAME), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

  console.log(`vendored ${entry.name} <- ${entry.repo}/${entry.subpath}@${entry.ref.slice(0, 12)} (${files.length} file(s))`);
}

function checkOne(entry) {
  const dir = path.join(VENDOR_DIR, entry.name);
  const provenancePath = path.join(dir, PROVENANCE_FILE_NAME);
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

/** Every committed file for `name`, as relativePath -> content, minus the record contexture writes. */
function readCommittedPayload(name) {
  const dir = path.join(VENDOR_DIR, name);
  const files = new Map();

  function walk(sub) {
    for (const dirent of readdirSync(path.join(dir, sub), { withFileTypes: true })) {
      const rel = sub ? `${sub}/${dirent.name}` : dirent.name;
      if (rel === PROVENANCE_FILE_NAME) continue;
      if (dirent.isDirectory()) walk(rel);
      else files.set(rel, readFileSync(path.join(dir, rel), 'utf8'));
    }
  }
  walk('');

  return files;
}

/**
 * Compares the committed payload's CONTENT against `entry.track`'s HEAD.
 *
 * Content, not the recorded `ref`: that ref is upstream's repository-wide HEAD
 * at vendoring time, and upstream carries many skills behind it, so comparing
 * revisions would report drift on commits that never touch the bytes
 * contexture redistributes — a weekly false alarm, which is a muted alarm.
 *
 * Returns 'current' | 'outdated' | 'frozen'; throws for anything that leaves
 * the answer unknown, which the caller turns into exit 2.
 */
function outdatedOne(entry) {
  if (entry.track === null) {
    console.log(`FROZEN: ${entry.name} is pinned at ${entry.ref.slice(0, 12)} and is not tracked`);
    return 'frozen';
  }

  const head = ghApi(`repos/${entry.repo}/commits/${entry.track}`).sha;
  const upstream = new Map(fetchTree(entry.repo, entry.subpath, head).map((f) => [f.relativePath, f.content]));
  const committed = readCommittedPayload(entry.name);

  const differing = [];
  for (const rel of new Set([...upstream.keys(), ...committed.keys()])) {
    if (upstream.get(rel) !== committed.get(rel)) differing.push(rel);
  }

  if (differing.length === 0) {
    console.log(`CURRENT: ${entry.name} matches ${entry.repo}/${entry.subpath}@${entry.track}`);
    return 'current';
  }

  const [lastCommit] = ghApi(`repos/${entry.repo}/commits?path=${entry.subpath}&per_page=1`);
  console.log(`OUTDATED: ${entry.name}`);
  console.log(`  pinned:   ${entry.ref}`);
  console.log(`  upstream: ${head} (${entry.track})`);
  console.log(`  differing files: ${differing.sort().join(', ')}`);
  if (differing.includes('LICENSE.txt')) {
    console.log('  LICENSE CHANGED — this is a redistribution decision, not a routine refresh');
  }
  if (lastCommit) {
    console.log(`  last upstream commit touching ${entry.subpath}:`);
    console.log(`    ${lastCommit.commit.message.split('\n')[0]}`);
    console.log(`    ${lastCommit.html_url}`);
  }
  console.log(`  fix: node scripts/vendor-skills.mjs && npm test`);
  return 'outdated';
}

const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--outdated') ? 'outdated' : 'fetch';

if (mode === 'check') {
  let ok = true;
  for (const entry of MANIFEST) ok = checkOne(entry) && ok;
  if (!ok) process.exit(1);
} else if (mode === 'outdated') {
  let anyOutdated = false;
  for (const entry of MANIFEST) {
    try {
      if (outdatedOne(entry) === 'outdated') anyOutdated = true;
    } catch (error) {
      console.error(`ERROR: could not determine whether ${entry.name} is current — ${error.message}`);
      process.exit(2);
    }
  }
  if (anyOutdated) process.exit(1);
} else {
  for (const entry of MANIFEST) fetchOne(entry);
  writeFileSync(NOTICES_PATH, renderNotices(MANIFEST), 'utf8');
  console.log('rewrote THIRD_PARTY_NOTICES.md from the manifest');
}
