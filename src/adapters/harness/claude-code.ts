import path from 'node:path';
import type { HarnessGenerationAdapter } from '../types.js';

/**
 * The reference harness-generation adapter. Claude Code loads `@path`
 * references in its memory files, so the generated entry file's whole job
 * is one `@AGENTS.md` line — no convention text is duplicated here, only
 * imported (harness-portability spec's "entry file only imports" rule).
 */
export const claudeCodeHarnessAdapter: HarnessGenerationAdapter = {
  id: 'claude-code',
  kind: 'harness-generation',
  interfaceVersion: 1,
  entryFileName: 'CLAUDE.md',

  render(agentsMdPath: string): string[] {
    return [`@${path.basename(agentsMdPath)}`];
  },

  permissionConfig: {
    path: '.claude/settings.json',
    /**
     * task 8.4: deny Write/Edit outside the active session worktree, and
     * deny raw `git push`/`git commit` — the whole point of the worktree +
     * PR write-lifecycle is that neither happens directly. The worktree
     * PATH varies per session, but its PARENT prefix (worktreesPath) does
     * not, so an allow-rule scoped to that whole prefix covers "the active
     * session worktree" generically without needing to know which one is
     * currently checked out.
     *
     * Rules are anchored at the store's absolute root (Claude Code's `//`
     * absolute-path syntax), not written cwd-relative (`./`): a `./`-relative
     * rule resolves against whatever directory a session's cwd happens to be
     * at launch, which for a harness that opens a worktree itself as the
     * project root (cwd already inside the worktree, not at the store root)
     * resolves to the wrong directory — `./**` then denies the whole
     * worktree and the `./<worktreesPath>/**` carve-out never matches
     * anything, since there is no nested worktrees directory inside a
     * worktree. An absolute anchor matches the real target path regardless
     * of launch cwd, correctly covering both conventions.
     *
     * This targets Claude Code's settings.json permission-rule syntax as
     * documented at the time this was written; if that syntax changes, this
     * is the one function to update.
     */
    render({ root, worktreesPath }: { root: string; worktreesPath: string }): Record<string, unknown> {
      // Claude Code's `//` absolute-path marker stands in for the path's own
      // leading slash — strip it here so the result is `//abs/path`, not
      // `///abs/path`.
      const absRoot = root.replace(/^\/+/, '').replace(/\/+$/, '');
      const worktreesSegment = worktreesPath.replace(/^\/+|\/+$/g, '');
      const rootGlob = `//${absRoot}/**`;
      const worktreeGlob = `//${absRoot}/${worktreesSegment}/**`;
      return {
        permissions: {
          deny: [`Write(${rootGlob})`, `Edit(${rootGlob})`, 'Bash(git push:*)', 'Bash(git commit:*)'],
          allow: [`Write(${worktreeGlob})`, `Edit(${worktreeGlob})`],
        },
      };
    },
  },
};
