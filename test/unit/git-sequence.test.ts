import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/init.js';
import type { GitResult } from '../../src/core/git/exec.js';
import { fakeGitRunner, makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * Fast, deterministic, catches an accidental `git add -A` or reordering —
 * a fake GitRunner means this never spawns a real git process.
 */
describe('init git call sequence', () => {
  it('issues exactly this sequence for a fresh, non-interactive init', async () => {
    const tmp = await makeTmpDir();
    try {
      const responses = new Map<string, GitResult>([
        ['rev-parse --show-toplevel', { exitCode: 1, stdout: '', stderr: 'fatal: not a git repository' }],
        ['diff --cached --quiet', { exitCode: 1, stdout: '', stderr: '' }], // there ARE staged changes
        ['rev-parse HEAD', { exitCode: 0, stdout: 'abc123\n', stderr: '' }],
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
      ]);
      const { git, calls } = fakeGitRunner(responses);
      const env = makeFakeEnv({
        git,
        env: {
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
      });

      const outcome = await execute(env, { root: tmp.root });

      expect(outcome.exitCode).toBe(0);
      expect(calls).toEqual([
        ['rev-parse', '--show-toplevel'],
        ['init'],
        ['symbolic-ref', '--short', 'HEAD'], // learn the branch name right after creating the repo
        ['config', 'core.hooksPath', '.githooks'],
        [
          'add',
          '--',
          'contexture.yaml',
          '.gitignore',
          'AGENTS.md',
          'projects/.gitkeep',
          'areas/.gitkeep',
          'resources/.gitkeep',
          'archives/.gitkeep',
          '.agents/skills/ctxr-ingest-orchestration/SKILL.md',
          '.agents/skills/ctxr-placement/SKILL.md',
          '.agents/skills/ctxr-connection-finding/SKILL.md',
          '.agents/skills/ctxr-connection-proposal/SKILL.md',
          '.agents/skills/ctxr-rollup/SKILL.md',
          '.agents/skills/ctxr-mission/SKILL.md',
          '.agents/skills/ctxr-session-lifecycle/SKILL.md',
          '.agents/skills/ctxr-submit/SKILL.md',
          '.agents/skills/ctxr-land/SKILL.md',
          '.agents/skills/ctxr-session-capture/SKILL.md',
          '.agents/skills/ctxr-derived-artifacts/SKILL.md',
          '.agents/skills/ctxr-organize-audit/SKILL.md',
          '.agents/skills/ctxr-publish/SKILL.md',
          '.agents/skills/frontend-design/LICENSE.txt',
          '.agents/skills/frontend-design/SKILL.md',
          '.agents/skills/frontend-design/.ctxr-vendored.json',
          '.claude/skills',
          '.contexture/guidance/baseline-convention.md',
          '.contexture/guidance/custom-convention.md',
          '.contexture/guidance/mission.md',
          '.githooks/pre-commit',
          '.githooks/pre-push',
        ],
        ['diff', '--cached', '--quiet'],
        ['commit', '-m', 'chore: initialize contexture store'],
        ['rev-parse', 'HEAD'],
      ]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never calls `git add -A` or `git add .`', async () => {
    const tmp = await makeTmpDir();
    try {
      const { git, calls } = fakeGitRunner(
        new Map<string, GitResult>([
          ['rev-parse --show-toplevel', { exitCode: 1, stdout: '', stderr: '' }],
        ]),
      );
      const env = makeFakeEnv({
        git,
        env: {
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
      });
      await execute(env, { root: tmp.root });
      const addCall = calls.find((c) => c[0] === 'add');
      expect(addCall).not.toContain('-A');
      expect(addCall).not.toContain('.');
    } finally {
      await tmp.cleanup();
    }
  });
});
