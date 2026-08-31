import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import {
  brokenLinksCheck,
  catalogGapsLintCheck,
  orphanNotesCheck,
  rollupStaleCheck,
  uningestedInboxCheck,
} from '../../src/core/checks/organize-checks.js';
import { ROLLUP_FENCE } from '../../src/core/rollup.js';
import type { GraphBuildResult } from '../../src/core/graph/model.js';
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
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

function makeCtx(notes: Note[], graph: GraphBuildResult | null = null): CheckContext {
  return {
    storeRoot: '/fake/root',
    config: makeConfig(),
    scope: 'store',
    git: { run: async () => ({ stdout: '', stderr: '', exitCode: 0 }) },
    notes: async () => notes,
    graph: async () => graph,
    catalog: async () => undefined,
  };
}

describe('orphanNotesCheck', () => {
  it('is severity: observation', () => {
    expect(orphanNotesCheck.severity).toBe('observation');
  });

  it('skips when the graph has not been built', async () => {
    const result = await orphanNotesCheck.run(makeCtx([], null));
    expect(result.status).toBe('skip');
  });

  it('fails, naming each orphan node, when the graph has orphans', async () => {
    const graph: GraphBuildResult = { nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }], edges: [], dangling: [] };
    const result = await orphanNotesCheck.run(makeCtx([], graph));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('a.md');
  });

  it('passes when every node has at least one link', async () => {
    const graph: GraphBuildResult = {
      nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }, { id: 'b.md', path: 'b.md', cluster: '(root)' }],
      edges: [{ src: 'a.md', dst: 'b.md', type: 'link' }],
      dangling: [],
    };
    const result = await orphanNotesCheck.run(makeCtx([], graph));
    expect(result.status).toBe('pass');
  });
});

describe('brokenLinksCheck', () => {
  it('is severity: observation', () => {
    expect(brokenLinksCheck.severity).toBe('observation');
  });

  it('skips when the graph has not been built', async () => {
    const result = await brokenLinksCheck.run(makeCtx([], null));
    expect(result.status).toBe('skip');
  });

  it('fails, naming the dangling link, when the graph reports one', async () => {
    const graph: GraphBuildResult = {
      nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }],
      edges: [],
      dangling: [{ from: 'a.md', target: 'ghost', reason: 'not_found' }],
    };
    const result = await brokenLinksCheck.run(makeCtx([], graph));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('a.md');
  });
});

describe('uningestedInboxCheck', () => {
  it('is severity: observation', () => {
    expect(uningestedInboxCheck.severity).toBe('observation');
  });

  it('flags an inbox note with no source-identity fields', async () => {
    const notes: Note[] = [{ path: 'inbox/a.md', frontmatter: undefined, body: '' }];
    const result = await uningestedInboxCheck.run(makeCtx(notes));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('inbox/a.md');
  });

  it('does not flag an inbox note that has already been ingested', async () => {
    const notes: Note[] = [{ path: 'inbox/a.md', frontmatter: { source_id: 'x' }, body: '' }];
    const result = await uningestedInboxCheck.run(makeCtx(notes));
    expect(result.status).toBe('pass');
  });

  it('does not flag a note outside the inbox', async () => {
    const notes: Note[] = [{ path: 'projects/a.md', frontmatter: undefined, body: '' }];
    const result = await uningestedInboxCheck.run(makeCtx(notes));
    expect(result.status).toBe('pass');
  });
});

describe('catalogGapsLintCheck', () => {
  it('is severity: observation, a different check id than the doctor invariant', () => {
    expect(catalogGapsLintCheck.severity).toBe('observation');
    expect(catalogGapsLintCheck.id).not.toBe('catalog.coverage');
  });
});

describe('rollupStaleCheck (store-primitives-from-migration-audit D4)', () => {
  function ctxWithGit(notes: Note[], gitStdout: Record<string, string>): CheckContext {
    return {
      storeRoot: '/repo',
      config: makeConfig(),
      scope: 'store',
      git: {
        run: async (args) => {
          const key = args.join(' ');
          const targetPath = args[args.length - 1]!;
          return { stdout: gitStdout[targetPath] ? `${gitStdout[targetPath]}\n` : '', stderr: '', exitCode: 0 };
        },
      },
      notes: async () => notes,
      graph: async () => null,
      catalog: async () => undefined,
    };
  }

  const rollupNote = (path: string, rolledUp: string | null): Note => ({
    path,
    frontmatter: rolledUp ? { rolled_up: rolledUp } : undefined,
    body: `# Entity\n\n${ROLLUP_FENCE.start}\nsynthesis\n${ROLLUP_FENCE.end}\n`,
  });
  const backlinkNote = (path: string, stem: string): Note => ({ path, frontmatter: undefined, body: `[[${stem}]]` });

  it('is severity: observation', () => {
    expect(rollupStaleCheck.severity).toBe('observation');
  });

  it('fails, naming the entity, when a backlink is newer than the rollup timestamp', async () => {
    const notes = [rollupNote('topic.md', '2026-01-01T00:00:00.000Z'), backlinkNote('a.md', 'topic')];
    const ctx = ctxWithGit(notes, { 'a.md': '2026-02-01T00:00:00.000Z' });
    const result = await rollupStaleCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('topic.md');
  });

  it('passes when every backlink predates the rollup timestamp', async () => {
    const notes = [rollupNote('topic.md', '2026-06-01T00:00:00.000Z'), backlinkNote('a.md', 'topic')];
    const ctx = ctxWithGit(notes, { 'a.md': '2026-01-01T00:00:00.000Z' });
    const result = await rollupStaleCheck.run(ctx);
    expect(result.status).toBe('pass');
  });

  it('a note with no rollup section is never considered, regardless of rolled_up', async () => {
    const notes = [{ path: 'plain.md', frontmatter: { rolled_up: '2026-01-01T00:00:00.000Z' }, body: 'no fence here' }];
    const result = await rollupStaleCheck.run(ctxWithGit(notes, {}));
    expect(result.status).toBe('pass');
  });
});
