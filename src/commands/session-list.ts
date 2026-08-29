import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { listWorktrees } from '../core/git/worktree.js';
import { isSessionBranch } from '../core/session.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionInfo {
  branch: string;
  worktree: string;
  head: string;
}

export interface SessionListData {
  sessions: SessionInfo[];
}

export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<SessionListData>> {
  const worktrees = await listWorktrees(env.git, store.root);
  const sessions = worktrees
    .filter((w): w is typeof w & { branch: string } => w.branch !== null && isSessionBranch(store.config, w.branch))
    .map((w) => ({ branch: w.branch, worktree: w.path, head: w.head }));

  return {
    exitCode: ExitCode.Ok,
    data: { sessions },
    findings: [],
    humanSummary: `${sessions.length} session(s).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
