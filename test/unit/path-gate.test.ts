import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import { isWriteInScope, sanctionedPath } from '../../src/core/write-lifecycle/path-gate.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(writablePaths: string[] = []): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: 'Active work.' }] },
    derived: { paths: ['.contexture/cache/'] },
    retrieval: { exclude_paths: ['.contexture/'], demote_paths: [], gather_max_notes: 50, relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: writablePaths },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
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
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'raw/inbox/x.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    // retain-captures-as-provenance: ingest's own write lands here, outside
    // the inbox but inside the capture tier, so gating on the inbox alone
    // would refuse the move that retains a capture.
    it('accepts a retained capture in the tier, outside the inbox', async () => {
      const tmp = await makeTmpDir();
      try {
        expect(await sanctionedPath(makeConfig(['notes/']), tmp.root, 'raw/202609/x.md')).toEqual({ ok: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('still refuses a path outside every sanctioned location', async () => {
      const tmp = await makeTmpDir();
      try {
        const result = await sanctionedPath(makeConfig(['notes/']), tmp.root, 'elsewhere/x.md');
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('the capture tier');
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

describe('isWriteInScope (Claude Code write-gate)', () => {
  it('is in scope inside the store root but outside the store entirely — not this gate\'s concern', async () => {
    const result = await isWriteInScope(makeConfig(), '/repo', '../outside.md');
    expect(result.inScope).toBe(true);
  });

  it('is in scope for a path inside the configured worktrees tree', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await isWriteInScope(makeConfig(), tmp.root, '.worktrees/sess1/notes/foo.md');
      expect(result).toEqual({ inScope: true });
    } finally {
      await tmp.cleanup();
    }
  });

  it('is out of scope for a path in the store root outside the worktrees tree', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await isWriteInScope(makeConfig(), tmp.root, 'AGENTS.md');
      expect(result.inScope).toBe(false);
      expect(result.reason).toContain('outside the active session worktree');
    } finally {
      await tmp.cleanup();
    }
  });

  it('is out of scope for a directory named identically to the worktrees prefix as a substring', async () => {
    const tmp = await makeTmpDir();
    try {
      const result = await isWriteInScope(makeConfig(), tmp.root, '.worktrees-backup/note.md');
      expect(result.inScope).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('denies a symlink escape whether it points out of the store or merely out of the worktrees tree', async () => {
    const tmp = await makeTmpDir();
    const outside = await makeTmpDir();
    try {
      await mkdir(path.join(tmp.root, '.worktrees', 'sess1'), { recursive: true });
      await symlink(outside.root, path.join(tmp.root, '.worktrees', 'sess1', 'linked'));

      const result = await isWriteInScope(makeConfig(), tmp.root, '.worktrees/sess1/linked/note.md');
      expect(result.inScope).toBe(false);
      expect(result.reason).toContain('symbolic link');
    } finally {
      await tmp.cleanup();
      await outside.cleanup();
    }
  });

  describe('a root that is itself a linked worktree checkout', () => {
    it('is in scope for ordinary store content — a session whose cwd is already the worktree must not be locked out', async () => {
      const tmp = await makeTmpDir();
      try {
        await writeFile(path.join(tmp.root, '.git'), 'gitdir: /repo/.git/worktrees/sess1\n');

        const result = await isWriteInScope(makeConfig(), tmp.root, 'AGENTS.md');
        expect(result).toEqual({ inScope: true });
      } finally {
        await tmp.cleanup();
      }
    });

    it('still denies a symlink escape from inside a linked worktree root', async () => {
      const tmp = await makeTmpDir();
      const outside = await makeTmpDir();
      try {
        await writeFile(path.join(tmp.root, '.git'), 'gitdir: /repo/.git/worktrees/sess1\n');
        await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
        await symlink(outside.root, path.join(tmp.root, 'areas', 'linked'));

        const result = await isWriteInScope(makeConfig(), tmp.root, 'areas/linked/note.md');
        expect(result.inScope).toBe(false);
        expect(result.reason).toContain('symbolic link');
      } finally {
        await tmp.cleanup();
        await outside.cleanup();
      }
    });

    it('a root whose .git is a directory (the main working tree) is not treated as a linked worktree', async () => {
      const tmp = await makeTmpDir();
      try {
        await mkdir(path.join(tmp.root, '.git'), { recursive: true });

        const result = await isWriteInScope(makeConfig(), tmp.root, 'AGENTS.md');
        expect(result.inScope).toBe(false);
      } finally {
        await tmp.cleanup();
      }
    });
  });
});
