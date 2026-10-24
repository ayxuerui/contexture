import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { SessionLabelUnusableError, SessionNameExistsError, SessionRefusedError, SessionWorktreeRefusedError } from '../core/errors.js';
import { addWorktree, fetchOrigin, hasRemote } from '../core/git/worktree.js';
import { sessionWorktrees } from '../core/approval/sessions.js';
import { identityOfWorktree, joinedBranchName, joinedWorktreeName, type SessionIdentity } from '../core/approval/session-marker.js';
import { findSessionWorktreeByLabel, generateSessionBranchName, sessionLabelSlug, worktreePathFor } from '../core/session.js';
import { mountingStoreOf } from '../core/shared-stores.js';
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
  /**
   * approve-sessions-across-stores: the session this worktree belongs to — its home store's forge slug and the home
   * session's branch. Null when the store has no `origin` to name it by.
   */
  session: SessionIdentity | null;
}

export interface SessionStartOptions {
  /** A short name for what the session is for; becomes part of the branch and worktree name. */
  label?: string;
  /** A live session of the store that mounts this one, by worktree name or branch: start a session joined to it. */
  joins?: string;
}

function refuse(reason: string, message: string, details: Record<string, unknown> = {}): SessionRefusedError {
  return new SessionRefusedError(ExitCode.Usage, reason, message, details);
}

/**
 * write-lifecycle spec ("A session can join a session in the store that mounts
 * this one"): the joined branch and worktree name, or a refusal naming why —
 * decided before anything is fetched or created.
 */
async function joinTarget(env: RunEnv, store: Store, joins: string): Promise<{ branch: string; worktreeName: string; home: SessionIdentity }> {
  const mounting = await mountingStoreOf(store.root);
  if (mounting === null) {
    throw refuse('join_not_a_mount', `"${store.root}" is not a store that another store mounts under shared/, so it cannot join a session there.`, { joins });
  }
  const sessions = await sessionWorktrees(env.git, mounting.root, mounting.config);
  const target = sessions.find((s) => s.name === joins || s.branch === joins);
  if (target === undefined) {
    throw refuse('join_unknown_session', `The store at "${mounting.root}" has no live session named "${joins}"; \`ctxr session list\` there names them.`, { joins, store: mounting.root });
  }
  const home = await identityOfWorktree(env.git, mounting.config, target.path, target.name, target.branch);
  if (home === null) {
    throw refuse('join_no_home_slug', `The store at "${mounting.root}" has no "origin" remote to name it by, so a session cannot join it.`, { joins });
  }
  const homePrefix = mounting.config.session.branch_prefix;
  const prefix = store.config.session.branch_prefix;
  return { branch: joinedBranchName(prefix, home, homePrefix), worktreeName: joinedWorktreeName(prefix, home, homePrefix), home };
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

  if (opts.joins !== undefined && opts.label !== undefined) {
    throw refuse('join_with_label', 'A joined session takes its name from the session it joins, so it takes no label.', { joins: opts.joins });
  }
  const joined = opts.joins === undefined ? null : await joinTarget(env, store, opts.joins);

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

  const branch = joined?.branch ?? generateSessionBranchName(store.config, new Date(), labelSlug ?? undefined);
  const worktreeDir = joined === null ? worktreePathFor(store, branch) : path.join(store.root, store.config.session.worktrees_path, joined.worktreeName);

  // git decides whether the worktree can actually be created: the label scan
  // above knows nothing about an unusable branch prefix, an occupied path, or a
  // repository problem, and any of those is still the caller's problem to see (D7).
  const added = await addWorktree(git, store.root, worktreeDir, branch, startPoint, { allowFailure: true });
  if (added.exitCode !== 0) throw new SessionWorktreeRefusedError(branch, worktreeDir, added.stderr);

  const session = joined?.home ?? (await identityOfWorktree(git, store.config, worktreeDir, path.basename(worktreeDir), branch));

  // cli-contract: the skill-path trigger for the release advisory — once per
  // session, at the command the lifecycle skill names first, on a command that
  // already reaches the network to fetch the default branch. Deliberately
  // AFTER the worktree exists: the advisory cannot fail this command, so
  // nothing it does may precede the work it is advising about.
  const advisory = await updateAdvisory(env, store);

  const lines = [`Session worktree at "${worktreeDir}" on branch "${branch}" (from ${startPoint}).`];
  if (joined !== null) lines.push(`It joins the session ${joined.home.branch} of ${joined.home.home}.`);
  else if (session !== null) lines.push(`Session ${session.branch} of ${session.home}.`);
  return {
    exitCode: ExitCode.Ok,
    data: { worktree: worktreeDir, branch, startPoint, fetched, label: labelSlug, session },
    findings: advisory.findings,
    notices: advisory.notice ? [advisory.notice] : undefined,
    humanSummary: lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
