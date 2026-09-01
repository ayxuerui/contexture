import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { failClosedVisibilityCheck, failClosedVisibilityInvariantCheck } from '../../src/core/notes/checks.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import { runChecks } from '../../src/core/checks/registry.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

function makeCtx(notes: Note[], config: StoreConfig = makeConfig()): CheckContext {
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

describe('failClosedVisibilityCheck', () => {
  it('is severity: observation, never invariant', () => {
    expect(failClosedVisibilityCheck.severity).toBe('observation');
  });

  it('passes with no findings when every note has an explicit or directory-derived visibility', async () => {
    const ctx = makeCtx([{ path: 'a.md', frontmatter: { scope: 'shared' }, body: '' }]);
    const result = await failClosedVisibilityCheck.run(ctx);
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
  });

  it('flags each note relying on the fail-closed default, naming it', async () => {
    const ctx = makeCtx([
      { path: 'a.md', frontmatter: { scope: 'shared' }, body: '' },
      { path: 'b.md', frontmatter: undefined, body: '' },
    ]);
    const result = await failClosedVisibilityCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toBe('b.md');
  });

  it('never affects doctor (severity: invariant filter excludes it)', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityCheck], ctx, {
      scope: 'store',
      severity: 'invariant',
    });
    expect(reports).toEqual([]);
  });

  it('is selectable via an observation-severity filter', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityCheck], ctx, {
      scope: 'store',
      severity: 'observation',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.result.status).toBe('fail');
  });
});

describe('failClosedVisibilityInvariantCheck', () => {
  it('is severity: invariant, never observation', () => {
    expect(failClosedVisibilityInvariantCheck.severity).toBe('invariant');
  });

  it('fails, naming the note, when a note relies on the fail-closed default', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const result = await failClosedVisibilityInvariantCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.subject).toBe('b.md');
  });

  it('passes when every note has an explicit or directory-derived visibility', async () => {
    const ctx = makeCtx([{ path: 'a.md', frontmatter: { scope: 'shared' }, body: '' }]);
    const result = await failClosedVisibilityInvariantCheck.run(ctx);
    expect(result.status).toBe('pass');
  });

  it('is selectable via an invariant-severity filter (this is what doctor runs)', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityInvariantCheck], ctx, {
      scope: 'store',
      severity: 'invariant',
    });
    expect(reports).toHaveLength(1);
    expect(reports[0]?.result.status).toBe('fail');
  });

  it('is excluded by an observation-severity filter (this is what lint runs)', async () => {
    const ctx = makeCtx([{ path: 'b.md', frontmatter: undefined, body: '' }]);
    const reports = await runChecks([failClosedVisibilityInvariantCheck], ctx, {
      scope: 'store',
      severity: 'observation',
    });
    expect(reports).toEqual([]);
  });

  it('carries a different check id than the lint-facing observation check, so a run never double-counts one condition under two ids colliding', () => {
    expect(failClosedVisibilityInvariantCheck.id).not.toBe(failClosedVisibilityCheck.id);
  });
});
