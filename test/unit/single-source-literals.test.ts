import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SHIPPED_PROFILES } from '../../src/taxonomy/profiles.js';

/**
 * Turns the spec's "exactly one place" and "exactly one primitive"
 * requirements into failing checks instead of a convention someone has to
 * remember: store-lifecycle's shipped-taxonomy-profiles requirement,
 * Reporter's sole ownership of stdout, and GitRunner's sole ownership of
 * spawning git.
 */
const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

function relativeToSrc(file: string): string {
  return path.relative(SRC_DIR, file).split(path.sep).join('/');
}

const ALL_FILES = listTsFiles(SRC_DIR);

function filesContainingQuotedLiteral(literal: string, allow: readonly string[]): string[] {
  const needles = [`'${literal}'`, `"${literal}"`];
  const hits: string[] = [];
  for (const file of ALL_FILES) {
    const rel = relativeToSrc(file);
    if (allow.includes(rel)) continue;
    const content = readFileSync(file, 'utf8');
    if (needles.some((n) => content.includes(n))) hits.push(rel);
  }
  return hits;
}

function filesContainingSubstring(substring: string, allow: readonly string[]): string[] {
  const hits: string[] = [];
  for (const file of ALL_FILES) {
    const rel = relativeToSrc(file);
    if (allow.includes(rel)) continue;
    if (readFileSync(file, 'utf8').includes(substring)) hits.push(rel);
  }
  return hits;
}

describe('single-source-literals guard', () => {
  it('every shipped profile/layer name appears only in taxonomy/profiles.ts', () => {
    const names = new Set<string>();
    for (const profile of SHIPPED_PROFILES) {
      names.add(profile.name);
      for (const layer of profile.layers) names.add(layer.name);
    }
    expect(names.size).toBeGreaterThan(0); // anti-vacuity: there is something to check
    for (const name of names) {
      const hits = filesContainingQuotedLiteral(name, ['taxonomy/profiles.ts']);
      expect(hits, `literal "${name}" leaked outside taxonomy/profiles.ts: ${hits.join(', ')}`).toEqual([]);
    }
  });

  it('no file outside core/reporter.ts writes to process.stdout directly', () => {
    expect(filesContainingSubstring('process.stdout', ['core/reporter.ts', 'core/env.ts'])).toEqual([]);
  });

  it('each external CLI tool has exactly one call site that spawns it', () => {
    // git and node --check are two different external tools with two
    // different single homes — core/git/exec.ts for git (behind the
    // GitRunner interface every other module depends on instead),
    // core/publish/script-check.ts for node --check (publish check's
    // embedded-script syntax pass). gh is no longer spawned by the CLI at
    // all (session-keeps-only-what-git-cannot-do) — the forge adapter that
    // once wrapped it is gone, and gh now runs only from skill-driven agent
    // invocations, never from this codebase's own process. The invariant
    // this guards is "no ad hoc, scattered subprocess spawning," not "only
    // one file in the whole codebase may ever spawn anything."
    const allow = ['core/git/exec.ts', 'core/publish/script-check.ts'];
    const hits = new Set([
      ...filesContainingSubstring("'node:child_process'", allow),
      ...filesContainingSubstring('"node:child_process"', allow),
    ]);
    expect([...hits]).toEqual([]);
  });
});
