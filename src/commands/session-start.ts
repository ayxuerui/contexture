import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { addWorktree, fetchOrigin, hasRemote } from '../core/git/worktree.js';
import { generateSessionBranchName, worktreePathFor } from '../core/session.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionStartData {
  worktree: string;
  branch: string;
  startPoint: string;
  fetched: boolean;
}

/**
 * write-lifecycle spec: "session start (an isolated git worktree off a
 * freshly fetched default branch)." When no remote is configured (a purely
 * local store), this degrades honestly to the local default branch's
 * current tip — fetching is simply not possible without a remote.
 */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<SessionStartData>> {
  const git = env.git;
  const defaultBranch = store.config.git.default_branch;
  const remoteExists = await hasRemote(git, store.root);

  let startPoint: string;
  let fetched = false;
  if (remoteExists) {
    fetched = await fetchOrigin(git, store.root, defaultBranch);
  }
  // Falls back to the local branch both when there's no remote at all, and
  // when the remote exists but doesn't yet have this branch (e.g. nothing
  // has been pushed yet) — both are honest, expected states, not errors.
  startPoint = fetched ? `origin/${defaultBranch}` : defaultBranch;

  const branch = generateSessionBranchName(store.config);
  const worktreeDir = worktreePathFor(store, branch);

  await addWorktree(git, store.root, worktreeDir, branch, startPoint);

  return {
    exitCode: ExitCode.Ok,
    data: { worktree: worktreeDir, branch, startPoint, fetched },
    findings: [],
    humanSummary: `Session worktree at "${worktreeDir}" on branch "${branch}" (from ${startPoint}).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
