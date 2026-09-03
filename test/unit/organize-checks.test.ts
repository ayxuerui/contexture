import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
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
import { makeTmpDir } from '../helpers/tmp-store.js';
import type { Note } from '../../src/core/notes/list.js';

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
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

  it('does not report an ambiguous-reason dangling link — that is doctor\'s alone', async () => {
    const graph: GraphBuildResult = {
      nodes: [{ id: 'a.md', path: 'a.md', cluster: '(root)' }],
      edges: [],
      dangling: [{ from: 'a.md', target: 'ghost', reason: 'ambiguous' }],
    };
    const result = await brokenLinksCheck.run(makeCtx([], graph));
    expect(result.status).toBe('pass');
    expect(result.findings).toEqual([]);
  });
});

describe('uningestedInboxCheck', () => {
  async function ctxAt(root: string): Promise<CheckContext> {
    return { ...makeCtx([]), storeRoot: root };
  }

  async function writeInboxFile(root: string, relPath: string, content = '# Captured\n'): Promise<void> {
    const full = path.join(root, relPath);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, content);
  }

  it('is severity: observation', () => {
    expect(uningestedInboxCheck.severity).toBe('observation');
  });

  it('flags a capture sitting in the inbox', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeInboxFile(tmp.root, 'raw/inbox/a.md');
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.subject).toBe('raw/inbox/a.md');
    } finally {
      await tmp.cleanup();
    }
  });

  /**
   * The condition is location, not frontmatter: a capture pipeline commonly
   * writes a source type and id at capture time, and a capture is not a note,
   * so nothing about its frontmatter says whether ingest has run.
   */
  it('flags a capture that already carries a source type and id', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeInboxFile(tmp.root, 'raw/inbox/a.md', '---\nsource_type: article\nsource_id: src-1\n---\n# Captured\n');
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.status).toBe('fail');
    } finally {
      await tmp.cleanup();
    }
  });

  it('flags a non-markdown capture, which note enumeration would never see', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeInboxFile(tmp.root, 'raw/inbox/deck.pdf', '%PDF-1.7\n');
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.findings[0]?.subject).toBe('raw/inbox/deck.pdf');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports nested captures with their full path, sorted', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeInboxFile(tmp.root, 'raw/inbox/202609/b.md');
      await writeInboxFile(tmp.root, 'raw/inbox/a.md');
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.findings.map((f) => f.subject)).toEqual(['raw/inbox/202609/b.md', 'raw/inbox/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes once the inbox holds nothing but its .gitkeep', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeInboxFile(tmp.root, 'raw/inbox/.gitkeep', '');
      await writeInboxFile(tmp.root, 'raw/202609/retained.md');
      await writeInboxFile(tmp.root, 'projects/a.md');
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.status).toBe('pass');
      expect(result.findings).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes when the inbox does not exist at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await uningestedInboxCheck.run(await ctxAt(tmp.root));
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
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
