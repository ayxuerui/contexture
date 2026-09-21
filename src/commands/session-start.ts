import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { SessionLabelUnusableError, SessionNameExistsError, SessionWorktreeRefusedError } from '../core/errors.js';
import { addWorktree, fetchOrigin, hasRemote } from '../core/git/worktree.js';
import { findSessionWorktreeByLabel, generateSessionBranchName, sessionLabelSlug, worktreePathFor } from '../core/session.js';
import type { Store } from '../core/store.js';
import { updateAdvisory } from '../core/version-check.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionStartData {
  worktree: string;
  branch: string;
  startPoint: string;
  fetched: boolean;
  /** The normalized label this session was named with, or null when none was given. */
  label: string | null;
}

export interface SessionStartOptions {
  /** A short name for what the session is for; becomes part of the branch and worktree name. */
  label?: string;
}

/**
 * write-lifecycle spec: "session start (an isolated git worktree off a
 * freshly fetched default branch)." When no remote is configured (a purely
 * local store), this degrades honestly to the local default branch's
 * current tip — fetching is simply not possible without a remote.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  opts: SessionStartOptions = {},
): Promise<CommandOutcome<SessionStartData>> {
  const git = env.git;
  const defaultBranch = store.config.git.default_branch;

  // Ahead of the fetch, so a label that can never work costs no network round
  // trip and leaves nothing behind.
  let labelSlug: string | null = null;
  if (opts.label !== undefined) {
    labelSlug = sessionLabelSlug(opts.label);
    if (labelSlug === '') throw new SessionLabelUnusableError(opts.label);

    // A label identifies at most one session at a time. Checked against the
    // sessions on disk rather than against the composed branch name, which
    // carries a timestamp and so would almost never collide (D4).
    const existing = await findSessionWorktreeByLabel(store.root, store.config, labelSlug);
    if (existing !== null) throw new SessionNameExistsError(labelSlug, existing);
  }

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

  const branch = generateSessionBranchName(store.config, new Date(), labelSlug ?? undefined);
  const worktreeDir = worktreePathFor(store, branch);

  // git decides whether the worktree can actually be created: the label scan
  // above knows nothing about an unusable branch prefix, an occupied path, or a
  // repository problem, and any of those is still the caller's problem to see (D7).
  const added = await addWorktree(git, store.root, worktreeDir, branch, startPoint, { allowFailure: true });
  if (added.exitCode !== 0) throw new SessionWorktreeRefusedError(branch, worktreeDir, added.stderr);

  // cli-contract: the skill-path trigger for the release advisory — once per
  // session, at the command the lifecycle skill names first, on a command that
  // already reaches the network to fetch the default branch. Deliberately
  // AFTER the worktree exists: the advisory cannot fail this command, so
  // nothing it does may precede the work it is advising about.
  const advisory = await updateAdvisory(env, store);

  return {
    exitCode: ExitCode.Ok,
    data: { worktree: worktreeDir, branch, startPoint, fetched, label: labelSlug },
    findings: advisory.findings,
    notices: advisory.notice ? [advisory.notice] : undefined,
    humanSummary: `Session worktree at "${worktreeDir}" on branch "${branch}" (from ${startPoint}).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
