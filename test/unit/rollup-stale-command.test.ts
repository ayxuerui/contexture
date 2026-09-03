import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/rollup-stale.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { NoteNotFoundError } from '../../src/core/errors.js';
import { ROLLUP_FENCE } from '../../src/core/rollup.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function makeConfig(rollupStaleDays = 0, missionPath?: string): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [{ name: 'Projects', path: 'projects', description: '' }] },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: rollupStaleDays, mission_path: missionPath },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
  };
}

async function initGitRepo(root: string, env: Record<string, string | undefined>): Promise<void> {
  await execFileAsync('git', ['init', '-q'], { cwd: root, env });
}

async function commit(root: string, env: Record<string, string | undefined>, relPath: string, content: string, date: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
  await execFileAsync('git', ['add', relPath], { cwd: root, env });
  await execFileAsync('git', ['commit', '-q', '-m', `update ${relPath}`], {
    cwd: root,
    env: { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
}

describe('ctxr rollup stale (real git)', () => {
  it('lists an entity whose backlink was committed after the recorded rollup timestamp', async () => {
    const tmp = await makeTmpDir();
    try {
      const gitEnv = hermeticGitEnv();
      await initGitRepo(tmp.root, gitEnv);
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root, git: createExecFileGitRunner() });

      await commit(
        tmp.root,
        gitEnv,
        'projects/topic.md',
        `---\nrolled_up: "2026-01-01T00:00:00.000Z"\n---\n# Topic\n\n${ROLLUP_FENCE.start}\nold synthesis\n${ROLLUP_FENCE.end}\n`,
        '2026-01-01T00:00:00',
      );
      await commit(tmp.root, gitEnv, 'projects/backlink.md', 'See [[topic]].\n', '2026-02-01T00:00:00');

      const outcome = await execute(env, store, {});
      expect(outcome.data?.stale).toEqual([
        { entity: 'projects/topic.md', rolledUp: '2026-01-01T00:00:00.000Z', newestBacklink: { path: 'projects/backlink.md', modified: expect.stringContaining('2026-02-01') } },
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is silent when every backlink predates the rollup timestamp', async () => {
    const tmp = await makeTmpDir();
    try {
      const gitEnv = hermeticGitEnv();
      await initGitRepo(tmp.root, gitEnv);
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root, git: createExecFileGitRunner() });

      await commit(tmp.root, gitEnv, 'projects/backlink.md', 'See [[topic]].\n', '2026-01-01T00:00:00');
      await commit(
        tmp.root,
        gitEnv,
        'projects/topic.md',
        `---\nrolled_up: "2026-06-01T00:00:00.000Z"\n---\n# Topic\n\n${ROLLUP_FENCE.start}\nfresh\n${ROLLUP_FENCE.end}\n`,
        '2026-06-01T00:00:00',
      );

      const outcome = await execute(env, store, {});
      expect(outcome.data?.stale).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('--for narrows to a single entity (no timestamp, one backlink: reported stale) and throws NoteNotFoundError for a missing one', async () => {
    const tmp = await makeTmpDir();
    try {
      const gitEnv = hermeticGitEnv();
      await initGitRepo(tmp.root, gitEnv);
      const store: Store = { root: tmp.root, config: makeConfig() };
      const env = makeFakeEnv({ cwd: tmp.root, git: createExecFileGitRunner() });
      await commit(
        tmp.root,
        gitEnv,
        'projects/topic.md',
        `# Topic\n\n${ROLLUP_FENCE.start}\nx\n${ROLLUP_FENCE.end}\n`,
        '2026-01-01T00:00:00',
      );
      await commit(tmp.root, gitEnv, 'projects/backlink.md', 'See [[topic]].\n', '2026-01-02T00:00:00');
      // also prove --for actually narrows: an unrelated second rollup entity must not appear.
      await commit(
        tmp.root,
        gitEnv,
        'projects/other.md',
        `---\nrolled_up: "2026-01-01T00:00:00.000Z"\n---\n# Other\n\n${ROLLUP_FENCE.start}\ny\n${ROLLUP_FENCE.end}\n`,
        '2026-01-01T00:00:00',
      );
      await commit(tmp.root, gitEnv, 'projects/other-backlink.md', 'See [[other]].\n', '2026-03-01T00:00:00');

      const outcome = await execute(env, store, { for: 'projects/topic.md' });
      expect(outcome.data?.stale).toEqual([
        { entity: 'projects/topic.md', rolledUp: null, newestBacklink: { path: 'projects/backlink.md', modified: expect.stringContaining('2026-01-02') } },
      ]);

      await expect(execute(env, store, { for: 'projects/nope.md' })).rejects.toBeInstanceOf(NoteNotFoundError);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports a configured mission_path stale on elapsed time, wired end-to-end through the real command (context-organize spec: generalize-identity-migration-residue)', async () => {
    const tmp = await makeTmpDir();
    try {
      const gitEnv = hermeticGitEnv();
      await initGitRepo(tmp.root, gitEnv);
      const store: Store = { root: tmp.root, config: makeConfig(7, 'MISSION.md') };
      const env = makeFakeEnv({ cwd: tmp.root, git: createExecFileGitRunner(), now: () => new Date('2026-02-01T00:00:00.000Z') });

      // Never rollup-written: no ROLLUP_FENCE, no rolled_up timestamp — still surfaces as stale.
      await commit(tmp.root, gitEnv, 'MISSION.md', '# Mission\n', '2026-01-01T00:00:00');

      const outcome = await execute(env, store, {});
      expect(outcome.data?.stale).toEqual([{ entity: 'MISSION.md', rolledUp: null, newestBacklink: null }]);
    } finally {
      await tmp.cleanup();
    }
  });
});
