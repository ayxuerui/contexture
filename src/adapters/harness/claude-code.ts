import path from 'node:path';
import type { HarnessGenerationAdapter, PermissionConfigInput } from '../types.js';

/**
 * The reference harness-generation adapter. Claude Code loads `@path`
 * references in its memory files, so the generated entry file's whole job
 * is one `@AGENTS.md` line — no convention text is duplicated here, only
 * imported (harness-portability spec's "entry file only imports" rule).
 */

/** Store-relative — where the generated write-gate hook script lands. */
const HOOK_TARGET_PATH = '.claude/hooks/claude-code-write-gate.sh';

export const claudeCodeHarnessAdapter: HarnessGenerationAdapter = {
  id: 'claude-code',
  kind: 'harness-generation',
  interfaceVersion: 2,
  entryFileName: 'CLAUDE.md',
  skillsDir: '.claude/skills/',

  render(agentsMdPath: string): string[] {
    return [`@${path.basename(agentsMdPath)}`];
  },

  permissionConfig: {
    path: '.claude/settings.json',

    hookFile: {
      templateFileName: 'claude-code-write-gate.sh',
      targetPath: HOOK_TARGET_PATH,
    },

    /**
     * task 8.4 (revised): deny raw `git push`/`git commit`, and deny an
     * edit anywhere under the store root except the active session
     * worktree via a PreToolUse hook rather than a permission rule.
     *
     * A permission rule cannot express that carve-out: Claude Code
     * evaluates deny before allow with no exception mechanism ("a deny rule
     * can't carry allowlist exceptions"), and the default session worktree
     * path is nested INSIDE the store root, so a tree-wide deny would also
     * cover the worktree an allow rule was meant to carve back out — which
     * is exactly the bug this replaces (see proposal.md). A hook resolves
     * the real target path at call time instead, so it has no such gap.
     *
     * `ctxr adapters write-gate` (the hook's target) does the actual
     * decision, reusing `sanctionedPath`'s path resolution via
     * `isWriteInScope` (write-lifecycle/path-gate.ts) so this and the
     * pre-commit path allowlist can never disagree about what counts as an
     * escape.
     */
    render({ mainRoot }: PermissionConfigInput): Record<string, unknown> {
      return {
        permissions: {
          deny: ['Bash(git push:*)', 'Bash(git commit:*)'],
        },
        hooks: {
          PreToolUse: [
            {
              matcher: 'Edit|Write|NotebookEdit',
              // Anchored at the main worktree, never the checkout currently
              // running the generator (stabilize-write-gate-hook-path) — a
              // session worktree is deleted once its own session lands, and
              // a hook command that no longer resolves fails open silently.
              hooks: [{ type: 'command', command: path.join(mainRoot, HOOK_TARGET_PATH) }],
            },
          ],
        },
      };
    },

    /**
     * The deny/allow pair a previous release emitted for the same
     * `{root, worktreesPath}` — reconstructed here (not read back off disk)
     * so `mergeJsonArrayLists` can remove it by exact match, repairing a
     * store whose config was generated before this fix.
     */
    retiredRules({ root, worktreesPath }: PermissionConfigInput): Record<string, unknown> {
      const absRoot = root.replace(/^\/+/, '').replace(/\/+$/, '');
      const worktreesSegment = worktreesPath.replace(/^\/+|\/+$/g, '');
      const rootGlob = `//${absRoot}/**`;
      const worktreeGlob = `//${absRoot}/${worktreesSegment}/**`;
      return {
        permissions: {
          deny: [`Write(${rootGlob})`, `Edit(${rootGlob})`],
          allow: [`Write(${worktreeGlob})`, `Edit(${worktreeGlob})`],
        },
      };
    },
  },
};
