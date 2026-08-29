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
     * This targets Claude Code's settings.json permission-rule syntax as
     * documented at the time this was written; if that syntax changes, this
     * is the one function to update.
     */
    render({ worktreesPath }: { worktreesPath: string }): Record<string, unknown> {
      const worktreeGlob = `./${worktreesPath.replace(/\/+$/, '')}/**`;
      return {
        permissions: {
          deny: ['Write(./**)', 'Edit(./**)', 'Bash(git push:*)', 'Bash(git commit:*)'],
          allow: [`Write(${worktreeGlob})`, `Edit(${worktreeGlob})`],
        },
      };
    },
  },
};
