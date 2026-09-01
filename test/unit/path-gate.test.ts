import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { sanctionedPath } from '../../src/core/write-lifecycle/path-gate.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(writablePaths: string[] = []): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: 'Active work.' }] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: ['.contexture/cache/'] },
    retrieval: { exclude_paths: ['.contexture/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: writablePaths },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [],
  };
}

describe('sanctionedPath (session-capture-command D5)', () => {
  it('accepts an ordinary in-store path when the store root does not exist yet', async () => {
    const result = await sanctionedPath(makeConfig(), '/does/not/exist', 'projects/note.md');
    expect(result.ok).toBe(true);
  });

  it('refuses a lexically-outside path immediately', async () => {
    const result = await sanctionedPath(makeConfig(), '/repo', '../outside.md');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('outside the store');
  });

  describe('symlink escape — refused whether or not writable_paths is declared', () => {
    for (const writablePaths of [[], ['notes/']]) {
      it(`writable_paths: ${JSON.stringify(writablePaths)}`, async () => {
        const tmp = await makeTmpDir();
        const outside = await makeTmpDir();
        try {
          await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
          await symlink(outside.root, path.join(tmp.root, 'areas', 'linked'));

          const result = await sanctionedPath(makeConfig(writablePaths), tmp.root, 'areas/linked/note.md');
          expect(result.ok).toBe(false);
          expect(result.reason).toContain('symbolic link');
        } finally {
          await tmp.cleanup();
          await outside.cleanup();
        }
      });
    }

    it('an existing target file behind the symlink is refused the same way', async () => {
      const tmp = await makeTmpDir();
      const outside = await makeTmpDir();
      try {
        const { writeFile } = await import('node:fs/promises');
        await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
        await symlink(outside.root, path.join(tmp.root, 'areas', 'linked'));
        await writeFile(path.join(outside.root, 'note.md'), '# leaked\n');

        const result = await sanctionedPath(makeConfig(), tmp.root, 'areas/linked/note.md');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('symbolic link');
      } finally {
        await tmp.cleanup();
        await outside.cleanup();
      }
    });
  });

  it('undeclared writable_paths accepts any in-store note', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await sanctionedPath(makeConfig([]), tmp.root, 'somewhere/unusual.md');
      expect(result).toEqual({ ok: true });
    } finally {
      await tmp.cleanup();
    }
  });

  describe('declared writable_paths gates the location', () => {
    it('refuses a path under none of the sanctioned locations', async () => {
      const tmp = await makeTmpDir();
      try {
        const result = await sanctionedPath(makeConfig(['notes/']), tmp.root, 'somewhere/unusual.md');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('taxonomy layer');
      } finally {
        await tmp.cleanup();
      }
    });

    it('accepts a configured taxonomy layer', async () => {
      const tmp = await makeTmpDir();
      try {
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'projects/x.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('accepts the inbox', async () => {
      const tmp = await makeTmpDir();
      try {
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'inbox/x.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('accepts a declared writable path', async () => {
      const tmp = await makeTmpDir();
      try {
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'notes/x.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('accepts the catalog and the skills/conventions directories', async () => {
      const tmp = await makeTmpDir();
      try {
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'catalog/areas.md')).toEqual({ ok: true });
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'skills/ctxr-placement/SKILL.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('refuses a legacy .contexture/identity/ path now that identity is not contexture-owned (remove-agent-identity): ownership reverts fully to the operator, so a leftover file there needs an explicit writable_paths entry like any other operator location', async () => {
      const tmp = await makeTmpDir();
      try {
        const result = await sanctionedPath(makeConfig(['notes/']), tmp.root, '.contexture/identity/posture.md');
        expect(result.ok).toBe(false);
      } finally {
        await tmp.cleanup();
      }
    });
  });
});
