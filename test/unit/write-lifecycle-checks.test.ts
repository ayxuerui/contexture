import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  hooksHealthCheck,
  stagedDiffSizeCeilingCheck,
  stagedFenceIntegrityCheck,
  stagedPathAllowlistCheck,
  stagedSchemaConformanceCheck,
  stagedSecretScanCheck,
} from '../../src/core/checks/write-lifecycle-checks.js';
import type { CheckContext, StagedFile } from '../../src/core/checks/types.js';
import { commentFence } from '../../src/core/markers.js';
import { installHooks } from '../../src/core/hooks.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 100, writable_paths: [] },
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

function makeStagedCtx(staged: StagedFile[], configOverrides: Partial<StoreConfig> = {}): CheckContext {
  const { git } = fakeGitRunner();
  return {
    storeRoot: '/fake/root',
    config: makeConfig(configOverrides),
    scope: 'staged',
    git,
    staged,
    notes: async () => [],
    graph: async () => null,
    catalog: async () => undefined,
  };
}

function file(overrides: Partial<StagedFile>): StagedFile {
  return { path: 'a.md', status: 'A', addedLines: 1, removedLines: 0, ...overrides };
}

describe('stagedSchemaConformanceCheck', () => {
  it('passes when there is no staged contexture.yaml or notes', async () => {
    const result = await stagedSchemaConformanceCheck.run(makeStagedCtx([file({ path: 'a.md', content: '# Hi\n' })]));
    expect(result.status).toBe('pass');
  });

  it('fails on a staged contexture.yaml that does not validate', async () => {
    const ctx = makeStagedCtx([file({ path: 'contexture.yaml', content: 'schema_version: "not a number"\n' })]);
    const result = await stagedSchemaConformanceCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.code).toBe('staged.schema_conformance.invalid_config');
  });

  it('fails on a staged note with malformed frontmatter', async () => {
    const ctx = makeStagedCtx([file({ path: 'a.md', content: '---\ntitle: "unterminated\n---\n# Hi\n' })]);
    const result = await stagedSchemaConformanceCheck.run(ctx);
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('a.md');
  });

  it('skips deleted files', async () => {
    const ctx = makeStagedCtx([file({ path: 'a.md', status: 'D', content: undefined })]);
    const result = await stagedSchemaConformanceCheck.run(ctx);
    expect(result.status).toBe('pass');
  });
});

describe('stagedFenceIntegrityCheck', () => {
  it('passes on a well-formed fence', async () => {
    const fence = commentFence('notes');
    const content = `${fence.start}\nbody\n${fence.end}\n`;
    const result = await stagedFenceIntegrityCheck.run(makeStagedCtx([file({ content })]));
    expect(result.status).toBe('pass');
  });

  it('fails on an unpaired marker, naming the file', async () => {
    const fence = commentFence('notes');
    const content = `${fence.start}\nbody\n`;
    const result = await stagedFenceIntegrityCheck.run(makeStagedCtx([file({ path: 'x.md', content })]));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('x.md');
  });
});

describe('stagedSecretScanCheck', () => {
  it('fails when staged content matches a secret pattern', async () => {
    const result = await stagedSecretScanCheck.run(makeStagedCtx([file({ path: 's.md', content: 'AKIAABCDEFGHIJKLMNOP' })]));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.subject).toBe('s.md');
  });

  it('passes on ordinary content', async () => {
    const result = await stagedSecretScanCheck.run(makeStagedCtx([file({ content: 'hello world' })]));
    expect(result.status).toBe('pass');
  });
});

describe('stagedPathAllowlistCheck', () => {
  it('fails when a staged file is under a declared derived path', async () => {
    const result = await stagedPathAllowlistCheck.run(makeStagedCtx([file({ path: '.contexture/graph.json' })]));
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.code).toBe('staged.path_allowlist.derived_path');
  });

  it('passes for a file outside every declared derived path', async () => {
    const result = await stagedPathAllowlistCheck.run(makeStagedCtx([file({ path: 'projects/x.md' })]));
    expect(result.status).toBe('pass');
  });

  it('does not flag a deleted file under a derived path (nothing is being committed there)', async () => {
    const result = await stagedPathAllowlistCheck.run(
      makeStagedCtx([file({ path: '.contexture/old.json', status: 'D' })]),
    );
    expect(result.status).toBe('pass');
  });

  describe('session-capture-command D5: the path gate on a real store root', () => {
    it('fails, naming the path, when a staged note escapes through a symlink', async () => {
      const tmp = await makeTmpDir();
      const outside = await makeTmpDir();
      try {
        const { mkdir, symlink } = await import('node:fs/promises');
        await mkdir(path.join(tmp.root, 'areas'), { recursive: true });
        await symlink(outside.root, path.join(tmp.root, 'areas', 'linked'));

        const ctx: CheckContext = { ...makeStagedCtx([file({ path: 'areas/linked/note.md' })]), storeRoot: tmp.root };
        const result = await stagedPathAllowlistCheck.run(ctx);
        expect(result.status).toBe('fail');
        expect(result.findings[0]?.code).toBe('staged.path_allowlist.path_gate');
        expect(result.findings[0]?.subject).toBe('areas/linked/note.md');
      } finally {
        await tmp.cleanup();
        await outside.cleanup();
      }
    });

    it('fails a note outside every sanctioned location once writable_paths is declared', async () => {
      const tmp = await makeTmpDir();
      try {
        const ctx: CheckContext = {
          ...makeStagedCtx([file({ path: 'somewhere/unusual.md' })], {
            write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: ['notes/'] },
          }),
          storeRoot: tmp.root,
        };
        const result = await stagedPathAllowlistCheck.run(ctx);
        expect(result.status).toBe('fail');
        expect(result.findings[0]?.code).toBe('staged.path_allowlist.path_gate');
      } finally {
        await tmp.cleanup();
      }
    });

    it('a non-markdown staged file is not subject to the path gate', async () => {
      const tmp = await makeTmpDir();
      try {
        const ctx: CheckContext = {
          ...makeStagedCtx([file({ path: 'somewhere/unusual.json' })], {
            write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: ['notes/'] },
          }),
          storeRoot: tmp.root,
        };
        expect((await stagedPathAllowlistCheck.run(ctx)).status).toBe('pass');
      } finally {
        await tmp.cleanup();
      }
    });
  });
});

describe('stagedDiffSizeCeilingCheck', () => {
  it('passes when total changed lines is under the ceiling', async () => {
    const result = await stagedDiffSizeCeilingCheck.run(
      makeStagedCtx([file({ addedLines: 10, removedLines: 5 })], { write_lifecycle: { diff_size_ceiling_lines: 100, writable_paths: [] } }),
    );
    expect(result.status).toBe('pass');
  });

  it('fails when total changed lines exceeds the ceiling, naming both numbers', async () => {
    const result = await stagedDiffSizeCeilingCheck.run(
      makeStagedCtx([file({ addedLines: 80, removedLines: 30 })], { write_lifecycle: { diff_size_ceiling_lines: 100, writable_paths: [] } }),
    );
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.details).toEqual({ total: 110, ceiling: 100 });
  });
});

describe('hooksHealthCheck', () => {
  it('passes when hooks are current and core.hooksPath is correctly configured', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      const { git } = fakeGitRunner(new Map([['config core.hooksPath', { exitCode: 0, stdout: '.githooks\n', stderr: '' }]]));
      const ctx: CheckContext = {
        storeRoot: tmp.root,
        config: makeConfig({ git: { default_branch: 'main' } }),
        scope: 'store',
        git,
        notes: async () => [],
        graph: async () => null,
        catalog: async () => undefined,
      };
      const result = await hooksHealthCheck.run(ctx);
      expect(result.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('self-heals and reports when hooks are missing', async () => {
    const tmp = await makeTmpDir();
    try {
      const { git } = fakeGitRunner(new Map([['config core.hooksPath', { exitCode: 0, stdout: '.githooks\n', stderr: '' }]]));
      const ctx: CheckContext = {
        storeRoot: tmp.root,
        config: makeConfig({ git: { default_branch: 'main' } }),
        scope: 'store',
        git,
        notes: async () => [],
        graph: async () => null,
        catalog: async () => undefined,
      };
      const result = await hooksHealthCheck.run(ctx);
      expect(result.status).toBe('fail'); // real problem WAS found this run
      expect(result.findings[0]?.code).toBe('git.hooks_health.reinstalled');

      // And it actually fixed it:
      const secondRun = await hooksHealthCheck.run(ctx);
      expect(secondRun.status).toBe('pass');
    } finally {
      await tmp.cleanup();
    }
  });

  it('self-heals core.hooksPath when misconfigured', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      const { git, calls } = fakeGitRunner(new Map([['config core.hooksPath', { exitCode: 0, stdout: 'wrong-path\n', stderr: '' }]]));
      const ctx: CheckContext = {
        storeRoot: tmp.root,
        config: makeConfig({ git: { default_branch: 'main' } }),
        scope: 'store',
        git,
        notes: async () => [],
        graph: async () => null,
        catalog: async () => undefined,
      };
      const result = await hooksHealthCheck.run(ctx);
      expect(result.status).toBe('fail');
      expect(result.findings[0]?.code).toBe('git.hooks_health.path_reconfigured');
      expect(calls).toContainEqual(['config', 'core.hooksPath', '.githooks']);
    } finally {
      await tmp.cleanup();
    }
  });
});
