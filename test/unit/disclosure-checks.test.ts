import { describe, expect, it } from 'vitest';
import { leakCheck } from '../../src/core/checks/disclosure-checks.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import type { StoreConfig } from '../../src/config/schema.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'ctx-a', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
    ...overrides,
  };
}

function makeCtx(notes: Note[], config: StoreConfig): CheckContext {
  return {
    storeRoot: '/fake/root',
    config,
    scope: 'store',
    git: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    notes: async () => notes,
    graph: async () => null,
    catalog: async () => undefined,
  };
}

describe('leakCheck (disclosure-policy D3)', () => {
  it('is severity: observation — lint-only, never a doctor invariant', () => {
    expect(leakCheck.severity).toBe('observation');
  });

  it('fails, naming the note and the leaked context, when a marker leaks across the wall', async () => {
    const config = makeConfig({ disclosure: { internal_audiences: [], hard_walls: [], leak_markers: { 'ctx-b': ['SECRET-B'] } } });
    const notes: Note[] = [{ path: 'projects/a.md', frontmatter: { scope: 'ctx-a' }, body: 'SECRET-B appears here.' }];
    const result = await leakCheck.run(makeCtx(notes, config));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('projects/a.md');
    expect(result.findings[0]?.details).toMatchObject({ context: 'ctx-b' });
  });

  it('passes when no markers are configured', async () => {
    const config = makeConfig();
    const notes: Note[] = [{ path: 'projects/a.md', frontmatter: { scope: 'ctx-a' }, body: 'anything at all' }];
    const result = await leakCheck.run(makeCtx(notes, config));
    expect(result.status).toBe('pass');
  });
});
