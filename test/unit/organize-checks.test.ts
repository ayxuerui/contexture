import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import type { CheckContext } from '../../src/core/checks/types.js';
import {
  brokenLinksCheck,
  catalogGapsLintCheck,
  orphanNotesCheck,
  uningestedInboxCheck,
} from '../../src/core/checks/organize-checks.js';
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
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [] },
    ingest: { inbox_path: 'inbox/' },
    organize: { archive_path: 'archive/' },
    identity: { path: 'identity/', files: {}, entry_delimiter: '' },
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
