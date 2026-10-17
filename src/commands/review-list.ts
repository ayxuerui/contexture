import { sessionPulls } from '../core/approval/sessions.js';
import type { ReviewStateName } from '../core/approval/decision.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ChangeApprovalNotDeclaredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor, type CredentialKind } from '../core/forge/credentials.js';
import { createGhForgeClient, type ForgeClient } from '../core/forge/github.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ReviewEntry {
  worktree: string;
  branch: string;
  pull_request: number;
  url: string;
  head: string;
  state: ReviewStateName;
  /** The person behind the latest decision, and when they made it; null while awaiting. */
  decided_by: string | null;
  decided_at: string | null;
  /** The comment of a request for changes. */
  comment: string | null;
  /** Why landing stopped, for `blocked` and for a resolved conflict awaiting re-approval. */
  landing_reason: string | null;
}

export interface ReviewListData {
  /** Which kind of forge credential the command used; never the credential. */
  credential: CredentialKind;
  sessions: ReviewEntry[];
}

/**
 * change-approval spec: each session pull request's decision state, read from
 * the forge — the channel by which a decider's requested changes and a blocked
 * landing reach an agent at session start (design.md D3).
 */
export async function execute(env: RunEnv, store: Store, forge?: ForgeClient): Promise<CommandOutcome<ReviewListData>> {
  const approval = store.config.change_approval;
  if (approval === undefined) throw new ChangeApprovalNotDeclaredError('ctxr review list');
  const client = forge ?? createGhForgeClient(store.root, await credentialsFor(env, store.root));
  const pulls = await sessionPulls(env.git, store.root, store.config, client, approval.recording_login);

  const sessions: ReviewEntry[] = pulls.map((p) => ({
    worktree: p.name,
    branch: p.branch,
    pull_request: p.pull.number,
    url: p.pull.url,
    head: p.pull.headSha,
    state: p.review.state,
    decided_by: p.review.decision?.by ?? null,
    decided_at: p.review.decision?.at ?? null,
    comment: p.review.state === 'changes-requested' ? (p.review.decision?.comment ?? null) : null,
    landing_reason: p.review.landing?.reason ?? null,
  }));

  const lines = sessions.map((s) => {
    const parts = [`#${s.pull_request} ${s.worktree} ${s.state}`];
    if (s.decided_by !== null) parts.push(`by ${s.decided_by} at ${s.decided_at}`);
    if (s.landing_reason !== null) parts.push(`reason: ${s.landing_reason}`);
    if (s.comment !== null) parts.push(`comment: ${s.comment.replace(/\s+/g, ' ')}`);
    return parts.join(' | ');
  });

  return {
    exitCode: ExitCode.Ok,
    data: { credential: client.credential, sessions },
    findings: [],
    humanSummary: sessions.length === 0 ? 'No session has an open pull request.' : lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
