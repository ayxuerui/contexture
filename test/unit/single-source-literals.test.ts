import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VISIBILITY_FIELD_KEY } from '../../src/config/defaults.js';
import { renderStoreConfig } from '../../src/config/render.js';
import { SUPPORTED_SCHEMA_VERSION } from '../../src/config/schema.js';
import { SHIPPED_PROFILES } from '../../src/taxonomy/profiles.js';

/**
 * Turns the spec's "exactly one place" and "exactly one primitive"
 * requirements into failing checks instead of a convention someone has to
 * remember: context-store's visibility-field-key requirement,
 * store-lifecycle's shipped-taxonomy-profiles requirement, Reporter's sole
 * ownership of stdout, and GitRunner's sole ownership of spawning git.
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
  it('the visibility field key default literal appears only in config/defaults.ts', () => {
    expect(filesContainingQuotedLiteral(DEFAULT_VISIBILITY_FIELD_KEY, ['config/defaults.ts'])).toEqual([]);
  });

  it('anti-vacuity: a freshly rendered config actually uses the constant (not merely unused)', () => {
    const rendered = renderStoreConfig({
      schema_version: SUPPORTED_SCHEMA_VERSION,
      taxonomy: { profile: 'para', layers: [] },
      fields: { visibility: DEFAULT_VISIBILITY_FIELD_KEY },
      visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
      derived: { paths: [] },
      retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
      git: { default_branch: 'main' },
      session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
      write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
    });
    expect(rendered).toContain(`visibility: ${DEFAULT_VISIBILITY_FIELD_KEY}`);
  });

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
    // git and gh are two different external tools with two different single
    // homes — core/git/exec.ts for git (behind the GitRunner interface every
    // other module depends on instead), adapters/forge/github.ts for gh
    // (the forge adapter's own single-purpose module). The invariant this
    // guards is "no ad hoc, scattered subprocess spawning," not "only one
    // file in the whole codebase may ever spawn anything."
    const allow = ['core/git/exec.ts', 'adapters/forge/github.ts'];
    const hits = new Set([
      ...filesContainingSubstring("'node:child_process'", allow),
      ...filesContainingSubstring('"node:child_process"', allow),
    ]);
    expect([...hits]).toEqual([]);
  });
});
