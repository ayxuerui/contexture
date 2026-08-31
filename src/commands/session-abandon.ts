import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { SessionNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { deleteBranch, listWorktrees, removeWorktree } from '../core/git/worktree.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionAbandonFlags {
  branch: string;
}

export interface SessionAbandonData {
  branch: string;
  worktree: string;
}

export async function execute(
  env: RunEnv,
  store: Store,
  flags: SessionAbandonFlags,
): Promise<CommandOutcome<SessionAbandonData>> {
  const worktrees = await listWorktrees(env.git, store.root);
  const match = worktrees.find((w) => w.branch === flags.branch);
  if (!match) {
    throw new SessionNotFoundError(flags.branch);
  }

  await removeWorktree(env.git, store.root, match.path, { force: true });
  await deleteBranch(env.git, store.root, flags.branch, { force: true });

  return {
    exitCode: ExitCode.Ok,
    data: { branch: flags.branch, worktree: match.path },
    findings: [],
    humanSummary: `Abandoned session "${flags.branch}" and removed its worktree.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
