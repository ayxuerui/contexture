import { forgeRead, sessionPulls, sessionWorktrees } from '../core/approval/sessions.js';
import { groupSessions, listOpen, sessionState, storeReach, type SessionStateName } from '../core/approval/session-group.js';
import { parseSessionMarker, sessionKey } from '../core/approval/session-marker.js';
import { storeForges } from '../core/approval/store-forges.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ChangeApprovalNotDeclaredError, ForgeUnreachableError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor, type CredentialKind } from '../core/forge/credentials.js';
import { createGhForgeClient, type ForgeClient } from '../core/forge/github.js';
import { mainWorktreePath } from '../core/git/worktree.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ReviewEntry {
  /** The session worktree's directory name; null for a part of a session with no worktree in this repository. */
  worktree: string | null;
  branch: string;
  pull_request: number;
  url: string;
  head: string;
  /** The state, from the session's decision when the pull request carries a session marker. */
  state: SessionStateName;
  /** The person behind the latest decision, and when they made it; null while awaiting. */
  decided_by: string | null;
  decided_at: string | null;
  /** The comment of a request for changes. */
  comment: string | null;
  /** Why landing stopped, for `blocked` and for a resolved conflict awaiting re-approval; for a session, the part and why. */
  landing_reason: string | null;
  /**
   * approve-sessions-across-stores: the session the pull request belongs to (`<home>:<branch>`), its home store's
   * forge slug, and the store the pull request is on. All null for a pull request without a session marker.
   */
  session: string | null;
  home: string | null;
  store: string | null;
  /** For `blocked` and `retrying`: the part (`<store>#<number>`) that holds the session. */
  part: string | null;
}

export interface ReviewListData {
  /** Which kind of forge credential the command used; never the credential. */
  credential: CredentialKind;
  sessions: ReviewEntry[];
}

/**
 * change-approval spec: each session pull request's decision state, read from
 * the forge — the channel by which a decider's requested changes and a blocked
 * landing reach an agent at session start (design.md D3). A pull request
 * carrying a session marker (approve-sessions-across-stores) is reported with
 * its session, its home, and the session's state, across this store and the
 * stores it mounts.
 */
export async function execute(env: RunEnv, store: Store, forge?: ForgeClient): Promise<CommandOutcome<ReviewListData>> {
  const approval = store.config.change_approval;
  if (approval === undefined) throw new ChangeApprovalNotDeclaredError('ctxr review list');
  const client = forge ?? createGhForgeClient(store.root, await credentialsFor(env, store.root));
  const open = await forgeRead(() => client.openPulls());
  const pulls = (await sessionPulls(env.git, store.root, store.config, client, approval.recording_login, async () => open)).filter(
    (p) => parseSessionMarker(p.pull.body) === null,
  );

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
    session: null,
    home: null,
    store: null,
    part: null,
  }));

  const findings: Finding[] = [];
  const canonical = await mainWorktreePath(env.git, store.root);
  const reach = await storeReach(env.git, { root: store.root, canonical, config: store.config, forge: client }, storeForges(env, forge));
  if (reach !== null) {
    const listings = await listOpen(reach, async () => open);
    const unreadable = listings.filter((l) => l.error !== null && l.store !== reach.home);
    if (listings.some((l) => l.store === reach.home && l.error !== null)) throw new ForgeUnreachableError(listings.find((l) => l.store === reach.home)!.error!);
    const worktrees = await sessionWorktrees(env.git, store.root, store.config);
    for (const group of groupSessions(reach, listings)) {
      const state = await forgeRead(() => sessionState({ git: env.git, reach, identity: group.identity, homedHere: group.homedHere, open: group.parts, recordingLogin: approval.recording_login }));
      for (const part of group.parts) {
        const local = part.store === reach.home ? worktrees.find((w) => w.branch === part.pull.headRef) : undefined;
        sessions.push({
          worktree: local?.name ?? null,
          branch: part.pull.headRef,
          pull_request: part.pull.number,
          url: part.pull.url,
          head: part.pull.headSha,
          state: state.state,
          decided_by: state.decision?.by ?? null,
          decided_at: state.decision?.at ?? null,
          comment: state.state === 'changes-requested' ? (state.decision?.comment ?? null) : null,
          landing_reason: state.reason,
          session: sessionKey(group.identity),
          home: group.identity.home,
          store: part.store.slug,
          part: state.reasonPart,
        });
      }
    }
    for (const listing of unreadable) {
      findings.push({ code: 'review.store_unreachable', severity: 'warning', message: `The forge could not be read for ${listing.store.mountName ?? listing.store.slug}, so its session parts are missing: ${listing.error}`, subject: listing.store.slug });
    }
  }

  const lines = sessions.map((s) => {
    const parts = [s.session === null ? `#${s.pull_request} ${s.worktree} ${s.state}` : `${s.store}#${s.pull_request} ${s.worktree ?? s.branch} ${s.state}`];
    if (s.session !== null) parts.push(`session ${s.session}`);
    if (s.decided_by !== null) parts.push(`by ${s.decided_by} at ${s.decided_at}`);
    if (s.landing_reason !== null) parts.push(`reason: ${s.landing_reason}`);
    if (s.comment !== null) parts.push(`comment: ${s.comment.replace(/\s+/g, ' ')}`);
    return parts.join(' | ');
  });

  return {
    exitCode: ExitCode.Ok,
    data: { credential: client.credential, sessions },
    findings,
    humanSummary: sessions.length === 0 ? 'No session has an open pull request.' : lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
