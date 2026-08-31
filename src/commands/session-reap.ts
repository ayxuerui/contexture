import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { SessionReapWorkspacesExternalError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { isWorkingTreeClean } from '../core/git/repo.js';
import { deleteBranch, listWorktrees, removeWorktree } from '../core/git/worktree.js';
import { isSessionBranch, isSessionWorktreePath } from '../core/session.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ReapOutcome {
  branch: string;
  worktree: string;
  reason: string;
}

export interface SessionReapData {
  reaped: ReapOutcome[];
  skipped: ReapOutcome[];
}

/**
 * write-lifecycle spec: reclaims session worktrees whose branch has been
 * merged into the default branch and whose tree is clean — never a branch
 * with unmerged commits, never a dirty worktree. This removes the
 * concurrency race entirely rather than hardening against it: a
 * conservative reap that only ever touches provably-safe sessions.
 */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<SessionReapData>> {
  if (store.config.session.workspaces_external) {
    throw new SessionReapWorkspacesExternalError();
  }

  const worktrees = await listWorktrees(env.git, store.root);
  const sessions = worktrees.filter(
    (w): w is typeof w & { branch: string } =>
      w.branch !== null &&
      (isSessionBranch(store.config, w.branch) || isSessionWorktreePath(store.config, w.path)),
  );

  const reaped: ReapOutcome[] = [];
  const skipped: ReapOutcome[] = [];

  for (const session of sessions) {
    const clean = await isWorkingTreeClean(env.git, session.path);
    if (!clean) {
      skipped.push({ branch: session.branch, worktree: session.path, reason: 'worktree has uncommitted changes' });
      continue;
    }

    const aheadResult = await env.git.run(
      ['log', `${store.config.git.default_branch}..${session.branch}`, '--oneline'],
      { cwd: store.root, allowFailure: true },
    );
    const isMerged = aheadResult.exitCode === 0 && aheadResult.stdout.trim().length === 0;
    if (!isMerged) {
      skipped.push({
        branch: session.branch,
        worktree: session.path,
        reason: 'branch has commits not yet merged into the default branch',
      });
      continue;
    }

    await removeWorktree(env.git, store.root, session.path);
    await deleteBranch(env.git, store.root, session.branch);
    reaped.push({ branch: session.branch, worktree: session.path, reason: 'merged and clean' });
  }

  return {
    exitCode: ExitCode.Ok,
    data: { reaped, skipped },
    findings: [],
    humanSummary: `Reaped ${reaped.length} session(s), skipped ${skipped.length}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
