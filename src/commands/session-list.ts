import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor, type CredentialKind } from '../core/forge/credentials.js';
import { createGhForgeClient, type ForgeClient } from '../core/forge/github.js';
import { listSessions, type SessionListEntry } from '../core/session/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export type SessionInfo = SessionListEntry;

export interface SessionListData {
  sessions: SessionInfo[];
  /** `--review` only: which kind of forge credential was used; never the credential. */
  credential?: CredentialKind;
}

export interface SessionListOptions {
  review?: boolean;
}

/**
 * write-lifecycle spec (*`ctxr session list` reports each session's state*):
 * local and offline by default; `--review` adds each session's open pull
 * request and, with change approval declared, its decision state, reading
 * `unknown` and still exiting `0` when the forge cannot be reached
 * (bring-the-session-lifecycle-into-the-cli D3, revision 1).
 */
export async function execute(env: RunEnv, store: Store, opts: SessionListOptions = {}, forge?: ForgeClient): Promise<CommandOutcome<SessionListData>> {
  let review: { forge: ForgeClient; recordingLogin: string | null } | undefined;
  if (opts.review === true) {
    const client = forge ?? createGhForgeClient(store.root, await credentialsFor(env, store.root));
    review = { forge: client, recordingLogin: store.config.change_approval?.recording_login ?? null };
  }
  const list = await listSessions(env.git, store.root, store.config, { review });
  const findings: Finding[] =
    list.forge_reachable === false
      ? [{ code: 'forge.unreachable', severity: 'warning', message: 'The forge could not be reached, so pull requests and decisions read unknown.' }]
      : [];

  const lines = list.sessions.map((s) => {
    const parts = [`${s.name} ${s.branch}`, s.uncommitted ? 'uncommitted changes' : 'clean', `${s.ahead} ahead`];
    if (s.pull_request !== undefined) parts.push(s.pull_request === null ? 'no pull request' : s.pull_request.number === null ? 'pull request unknown' : `#${s.pull_request.number}`);
    if (s.review !== undefined && s.review !== null) parts.push(s.review.comment === null ? s.review.state : `${s.review.state}: ${s.review.comment.replace(/\s+/g, ' ')}`);
    return parts.join(' | ');
  });

  return {
    exitCode: ExitCode.Ok,
    data: { sessions: list.sessions, ...(review === undefined ? {} : { credential: review.forge.credential }) },
    findings,
    humanSummary: [`${list.sessions.length} session(s).`, ...lines].join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
