import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor } from '../core/forge/credentials.js';
import { resolveSession } from '../core/session/resolve.js';
import { sessionStatus, type SessionStatus } from '../core/session/status.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionStatusOptions {
  session?: string;
  diff?: boolean;
}

/**
 * write-lifecycle spec (*`ctxr session status` re-scans a session*): the
 * re-scan before any plan and before submit, in one command
 * (bring-the-session-lifecycle-into-the-cli D3). With no session named it
 * reads the session containing the working directory, and is refused outside one.
 */
export async function execute(env: RunEnv, store: Store, opts: SessionStatusOptions = {}): Promise<CommandOutcome<SessionStatus>> {
  const session = await resolveSession(env.git, store.root, store.config, opts.session, env.cwd);
  const credentials = await credentialsFor(env, session.path);
  const status = await sessionStatus({ git: env.git, config: store.config, env: env.env, credentials }, session, { diff: opts.diff });

  const lines = [`${status.session} on ${status.branch}: ${status.uncommitted.length} uncommitted, ${status.ahead} commit(s) ahead of ${status.base}${status.fetched ? '' : ' (not fetched)'}`];
  if (status.rebase_in_progress) lines.push(`A rebase is in progress: \`ctxr session rebase ${status.session} --continue\` or \`--abort\`.`);
  for (const change of status.uncommitted) lines.push(`${change.status} ${change.path}`);
  for (const commit of status.commits) lines.push(`${commit.sha.slice(0, 7)} ${commit.subject}`);
  if (status.diff_stat.committed !== '') lines.push('', 'Committed:', status.diff_stat.committed);
  if (status.diff_stat.uncommitted !== '') lines.push('', 'Uncommitted:', status.diff_stat.uncommitted);
  if (status.diff !== null && status.diff !== '') lines.push('', status.diff.replace(/\n$/, ''));

  return {
    exitCode: ExitCode.Ok,
    data: status,
    findings: [],
    humanSummary: lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
