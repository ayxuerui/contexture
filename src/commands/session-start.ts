import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { fetchOrigin, hasRemote } from '../core/git/worktree.js';
import { startSession } from '../core/session/start.js';
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
  // serve-the-session-lifecycle-to-chat-apps D3: the core `session_start` shares.
  const started = await startSession(
    {
      git: env.git,
      config: store.config,
      fetch: async (cwd) => (await hasRemote(env.git, cwd)) && (await fetchOrigin(env.git, cwd, store.config.git.default_branch)),
      now: () => new Date(),
    },
    store.root,
    opts.label,
  );
  const { worktree: worktreeDir, branch, startPoint, fetched, label: labelSlug } = started;

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
