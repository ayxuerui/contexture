import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor } from '../core/forge/credentials.js';
import { createGhForgeClient } from '../core/forge/github.js';
import { discardSession, type DiscardResult } from '../core/session/discard.js';
import { resolveSession } from '../core/session/resolve.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionDiscardOptions {
  session: string;
  force?: boolean;
  closePullRequest?: boolean;
}

/**
 * write-lifecycle spec (*`ctxr session discard` removes only a session, and
 * only clean unless forced*): `2` for anything that is not a session, `3` for
 * work removal would destroy, `0` once the worktree and local branch are gone
 * (bring-the-session-lifecycle-into-the-cli D1, point 4).
 */
export async function execute(env: RunEnv, store: Store, opts: SessionDiscardOptions): Promise<CommandOutcome<DiscardResult>> {
  const session = await resolveSession(env.git, store.root, store.config, opts.session, env.cwd);
  const credentials = await credentialsFor(env, session.canonical);
  const forge = createGhForgeClient(session.canonical, credentials);
  const result = await discardSession({ git: env.git, config: store.config, credentials, forge, env: env.env }, session, {
    force: opts.force,
    closePullRequest: opts.closePullRequest,
  });

  const closed = result.closed_pull_request === null ? '' : ` Pull request #${result.closed_pull_request} is closed.`;
  return {
    exitCode: ExitCode.Ok,
    data: result,
    findings: [],
    humanSummary: `Removed "${result.worktree}" and its branch "${result.branch}".${closed}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
