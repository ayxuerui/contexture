import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { SessionRefusedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor } from '../core/forge/credentials.js';
import { rebaseSession, type RebaseResult } from '../core/session/rebase.js';
import { resolveSession } from '../core/session/resolve.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionRebaseOptions {
  session: string;
  continue?: boolean;
  abort?: boolean;
}

/**
 * write-lifecycle spec (*`ctxr session rebase` brings a session onto the
 * default branch*): `3` with each conflicting path and both sides, leaving the
 * rebase in progress for the agent to resolve; `0` when clean
 * (bring-the-session-lifecycle-into-the-cli D3).
 */
export async function execute(env: RunEnv, store: Store, opts: SessionRebaseOptions): Promise<CommandOutcome<RebaseResult>> {
  if (opts.continue === true && opts.abort === true) {
    throw new SessionRefusedError(ExitCode.Usage, 'rebase_flags', 'Pass --continue or --abort, not both.');
  }
  const session = await resolveSession(env.git, store.root, store.config, opts.session, env.cwd);
  const credentials = await credentialsFor(env, session.path);
  const mode = opts.continue === true ? 'continue' : opts.abort === true ? 'abort' : 'start';
  const result = await rebaseSession({ git: env.git, config: store.config, env: env.env, credentials }, session, mode);

  const findings: Finding[] = result.conflicts.map((c) => ({
    code: 'session.rebase_conflict',
    severity: 'error',
    message: `"${c.path}" conflicts: resolve it keeping both sides' meaning, then run \`ctxr session rebase ${result.session} --continue\`.`,
    subject: c.path,
  }));
  const summary =
    result.outcome === 'conflict'
      ? [`Rebasing "${result.session}" onto ${result.onto} stopped on ${result.conflicts.length} conflict(s):`, ...result.conflicts.map((c) => `  ${c.path}`)].join('\n')
      : result.outcome === 'aborted'
        ? `The rebase of "${result.session}" was aborted; it is back at ${result.head.slice(0, 7)}.`
        : result.outcome === 'up-to-date'
          ? `"${result.session}" is already on ${result.onto}.`
          : `"${result.session}" is rebased onto ${result.onto}, at ${result.head.slice(0, 7)}.`;

  return {
    exitCode: result.outcome === 'conflict' ? ExitCode.CheckFailed : ExitCode.Ok,
    data: result,
    findings,
    humanSummary: summary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
