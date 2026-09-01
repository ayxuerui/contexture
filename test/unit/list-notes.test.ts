import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { listNotes } from '../../src/core/notes/list.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: ['identity/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
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
    ...overrides,
  };
}

async function writeNote(root: string, relPath: string, content = '# Note\n'): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

describe('listNotes', () => {
  it('finds .md files across nested directories, sorted', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'projects/b.md');
      await writeNote(tmp.root, 'projects/a.md');
      await writeNote(tmp.root, 'areas/People/x.md');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['areas/People/x.md', 'projects/a.md', 'projects/b.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('ignores non-.md files', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'projects/note.md');
      await writeFile(path.join(tmp.root, 'contexture.yaml'), 'schema_version: 1\n');
      await mkdir(path.join(tmp.root, 'assets'), { recursive: true });
      await writeFile(path.join(tmp.root, 'assets', 'image.png'), '');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['projects/note.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('excludes a declared retrieval exclusion path', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'identity/soul.md');
      await writeNote(tmp.root, 'projects/note.md');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['projects/note.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('excludes declared derived paths, session worktrees, and the catalog directory itself', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, '.contexture/graph.md');
      await writeNote(tmp.root, '.worktrees/session-x/projects/note.md');
      await writeNote(tmp.root, 'catalog/projects.md');
      await writeNote(tmp.root, 'projects/real.md');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['projects/real.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never walks into .git, .githooks, or .queue', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, '.git/COMMIT_EDITMSG.md'); // contrived, but proves the skip
      await writeNote(tmp.root, '.githooks/notes.md');
      await writeNote(tmp.root, '.queue/pending.md');
      await writeNote(tmp.root, 'projects/real.md');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['projects/real.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns an empty array for a store with no notes', async () => {
    const tmp = await makeTmpDir();
    try {
      expect(await listNotes(tmp.root, makeConfig())).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('underPrefix scopes the result to a subtree', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'projects/a.md');
      await writeNote(tmp.root, 'areas/b.md');
      const notes = await listNotes(tmp.root, makeConfig(), { underPrefix: 'projects' });
      expect(notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('parses each note\'s frontmatter and body', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'projects/a.md', '---\ntitle: A\n---\n# A\n');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes[0]?.frontmatter).toEqual({ title: 'A' });
      expect(notes[0]?.body).toBe('# A\n');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('listNotes and harness entry files (entry-doc-generation D4)', () => {
  it('skips a configured harness-generation adapter\'s root-level entry file — it is a pointer, not a note', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'CLAUDE.md', '@AGENTS.md\n');
      await writeNote(tmp.root, 'projects/a.md');
      const notes = await listNotes(tmp.root, makeConfig({ adapters: [{ id: 'claude-code', kind: 'harness-generation' }] }));
      expect(notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('still treats a same-named file as a note when no such adapter is configured', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'CLAUDE.md', 'Just a note here.\n');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['CLAUDE.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not fail enumeration when a declared adapter cannot be resolved', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'projects/a.md');
      const notes = await listNotes(tmp.root, makeConfig({ adapters: [{ id: 'nonexistent', kind: 'harness-generation' }] }));
      expect(notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('skips AGENTS.md at the store root — it is the CLI-generated entry document, not a note', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'AGENTS.md', '# Entry doc\n');
      await writeNote(tmp.root, 'projects/a.md');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['projects/a.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('treats a nested AGENTS.md as an ordinary note — contexture only ever generates the root one', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeNote(tmp.root, 'areas/Team/AGENTS.md', '# Team conventions\n');
      const notes = await listNotes(tmp.root, makeConfig());
      expect(notes.map((n) => n.path)).toEqual(['areas/Team/AGENTS.md']);
    } finally {
      await tmp.cleanup();
    }
  });
});
