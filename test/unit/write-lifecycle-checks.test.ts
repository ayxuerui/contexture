import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { renderSkills } from '../../src/core/skills.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

import { SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: [], demote_paths: [], gather_max_notes: 50, graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 100, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: '.contexture/templates/', installed: [] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
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
    expect(result.findings[0]?.details).toEqual({ total: 110, ceiling: 100, left_out: 0 });
  });
});

/**
 * exempt-shipped-skill-files-from-the-diff-ceiling: one test per scenario of the
 * `Commits are validated before they are accepted` requirement. The shipped
 * content is the real rendering, so these cannot drift from what `init` writes.
 */
describe('stagedDiffSizeCeilingCheck leaves out files identical to what this version ships', () => {
  const config = makeConfig();
  const lineCount = (text: string): number => text.split('\n').length - 1;
  // The longest owned skill, so a single file clears the 100-line ceiling on its own.
  const owned = [...renderSkills(config)].sort((a, b) => lineCount(b.content) - lineCount(a.content))[0]!;
  const ownedPath = `skills/${owned.file}/SKILL.md`;
  const shippedFile = (overrides: Partial<StagedFile> = {}): StagedFile =>
    file({ path: ownedPath, content: owned.content, addedLines: lineCount(owned.content), ...overrides });
  const vendoredSkill = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/vendor/eli5/SKILL.md'), 'utf8');
  const run = (staged: StagedFile[], overrides: Partial<StoreConfig> = {}) =>
    stagedDiffSizeCeilingCheck.run(makeStagedCtx(staged, { write_lifecycle: { diff_size_ceiling_lines: 100, writable_paths: [] }, ...overrides }));

  it('the fixture is big enough that counting it would fail, so the passes below are not vacuous', () => {
    expect(lineCount(owned.content)).toBeGreaterThan(100);
  });

  it('passes a commit made only of shipped owned-skill files, however large', async () => {
    const staged = renderSkills(config).map((skill) =>
      file({ path: `skills/${skill.file}/SKILL.md`, content: skill.content, addedLines: lineCount(skill.content) }),
    );
    expect(staged.reduce((n, f) => n + (f.addedLines ?? 0), 0)).toBeGreaterThan(500);
    expect((await run(staged)).status).toBe('pass');
  });

  it('passes a declared vendored skill\'s packaged file, and counts its provenance record', async () => {
    const vendored = { skills: { vendored: ['eli5'] } };
    const packaged = file({ path: 'skills/eli5/SKILL.md', content: vendoredSkill, addedLines: lineCount(vendoredSkill) });
    expect(lineCount(vendoredSkill)).toBeGreaterThan(100);
    expect((await run([packaged], vendored)).status).toBe('pass');
    const record = file({ path: 'skills/eli5/.ctxr-vendored.json', content: '{}\n', addedLines: 150 });
    expect((await run([packaged, record], vendored)).status).toBe('fail');
  });

  it('counts a shipped skill file edited by one byte, in full', async () => {
    const result = await run([shippedFile({ content: `${owned.content}x` })]);
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.details).toMatchObject({ total: lineCount(owned.content), left_out: 0 });
  });

  it('counts a file the installed version does not ship, inside an owned skill directory', async () => {
    const result = await run([file({ path: `skills/${owned.file}/extra.md`, content: 'x\n', addedLines: 500 })]);
    expect(result.findings[0]?.details).toMatchObject({ total: 500, left_out: 0 });
  });

  it('counts shipped bytes staged at a path the installed version does not ship', async () => {
    const result = await run([shippedFile({ path: 'skills/my-own-skill/SKILL.md' })]);
    expect(result.status).toBe('fail');
  });

  it('counts an operator-authored skill under the skills path', async () => {
    const result = await run([file({ path: 'skills/mine/SKILL.md', content: 'x\n', addedLines: 500 })]);
    expect(result.status).toBe('fail');
  });

  it('counts a deletion of a shipped file', async () => {
    const result = await run([shippedFile({ status: 'D', addedLines: 0, removedLines: 300, content: undefined })]);
    expect(result.findings[0]?.details).toMatchObject({ total: 300, left_out: 0 });
  });

  it('counts a shipped file whose staged content was not read', async () => {
    const result = await run([shippedFile({ content: undefined })]);
    expect(result.status).toBe('fail');
  });

  it('still refuses other lines, and the message names how many it left out', async () => {
    const agentWork = file({ path: 'notes/big.md', content: 'x\n', addedLines: 150 });
    const result = await run([shippedFile(), agentWork]);
    expect(result.status).toBe('fail');
    expect(result.findings[0]?.details).toEqual({ total: 150, ceiling: 100, left_out: lineCount(owned.content) });
    expect(result.findings[0]?.message).toContain(`${lineCount(owned.content)} more changed lines are skill files identical to what this version ships, and are not counted`);
  });

  it('says nothing about leaving lines out when nothing was left out', async () => {
    const result = await run([file({ addedLines: 150 })]);
    expect(result.findings[0]?.message).not.toContain('not counted');
  });

  it('follows the configured skills path', async () => {
    const moved = { harness: { skills_path: '.agents/skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 } };
    const atMoved = shippedFile({ path: `.agents/skills/${owned.file}/SKILL.md` });
    expect((await run([atMoved], moved)).status).toBe('pass');
    expect((await run([atMoved])).status).toBe('fail'); // the default path is not where it ships to
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
