import { mkdtemp, rm, stat } from 'node:fs/promises';
import { fastForwardIfSafe, type FastForwardOutcome } from '../core/git/fast-forward.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decisionBody, landingBody, recordPartOf, type LandingRecordState } from '../core/approval/decision.js';
import { writeLandingRecord } from '../core/approval/landing-record.js';
import { resolverPrompt, runResolver } from '../core/approval/resolver.js';
import { carriesOver, forgeRead, reviewStateOf, sessionPulls, sessionWorktrees, type SessionWorktree } from '../core/approval/sessions.js';
import { groupSessions, landingOrder, listOpen, readAsSessionPart, sessionState, storeReach, type OpenPart, type SessionStore, type StoreReach } from '../core/approval/session-group.js';
import { identityOfWorktree, sessionKey, sessionsEqual, type SessionIdentity } from '../core/approval/session-marker.js';
import { storeForges } from '../core/approval/store-forges.js';
import { readConfig } from '../config/load.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { Finding } from '../core/envelope.js';
import type { RunEnv } from '../core/env.js';
import { ChangeApprovalNotDeclaredError, ContextureError, ForgeUnreachableError, LandBusyError, LandFlagsError, LandRefusedError } from '../core/errors.js';
import { acquireLandLock } from '../core/git/land-lock.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor, ghCredentials, runRemoteGit, type CredentialKind, type ForgeCredentials } from '../core/forge/credentials.js';
import { createGhForgeClient, ForgeRequestError, type ForgeClient, type MergeMethod, type PullRequest } from '../core/forge/github.js';
import { storePrefix } from '../core/graph/tree.js';
import { addDetachedWorktree, mainWorktreePath, pruneWorktrees, removeWorktree } from '../core/git/worktree.js';
import { openStore, type Store } from '../core/store.js';
import * as catalogBuildCommand from './catalog-build.js';
import * as doctorCommand from './doctor.js';
import * as graphBuildCommand from './graph-build.js';

export const requires: CommandRequires = { store: 'required' };

export interface LandFlags {
  pr: number | undefined;
  pending: boolean;
  confirm: boolean;
  /** approve-sessions-across-stores D7: a session homed here, by its worktree name or branch, landed whole on `--confirm`. */
  session?: string | undefined;
}

export type LandOutcome = 'merged' | 'no-consent' | 'needs-reapproval' | 'blocked' | 'merge-refused' | 'lease-refused';
export type CatchUp = 'not-needed' | 'clean' | 'carried-over' | 'patches-changed' | 'conflict' | 'conflict-resolved';

export interface LandResult {
  pull_request: number;
  worktree: string | null;
  outcome: LandOutcome;
  /** Where the consent came from: a decision recorded from the approval page, or `--confirm`. */
  consent: 'recorded' | 'confirm' | null;
  /** The decision state, when consent was looked for and not found. */
  state: string | null;
  reason: string | null;
  catch_up: CatchUp | null;
  merged_commit: string | null;
  canonical_sync: CanonicalSync | null;
  reclaim: { removed: boolean; reason: string | null } | null;
  /** Records posted on the pull request, and records this credential could not post (not the recording login). */
  records_posted: string[];
  records_reported_only: string[];
  /** approve-sessions-across-stores: the forge slug of the store a session's part is on; null outside a session. */
  store?: string | null;
}

/**
 * write-lifecycle spec ("A session is landed by its home store, mounted parts
 * first"): one session's landing. `landed` when every part merged; `blocked`
 * waits for a person (a named part closed without merging, a conflict);
 * `retrying` is tried again on the next run; `needs-reapproval` and
 * `not-approved` wait for a decision.
 */
export interface SessionLandResult {
  session: string;
  home: string;
  state: 'landed' | 'blocked' | 'retrying' | 'needs-reapproval' | 'not-approved';
  reason: string | null;
  /** The part (`<store>#<number>`) that stopped the session; null when nothing did. */
  stopped_at: string | null;
  landed: string[];
  not_attempted: string[];
  /** For `retrying`: a one-word cause (`push-rejected`, `forge-unreachable`, `mount-not-synced`, …); null otherwise. */
  reason_code: string | null;
}

/** write-lifecycle spec ("Every landing run brings the canonical clone up to date when it is safe to"). */
/** The canonical clone's sync: the shared fast-forward rule's outcome (`core/git/fast-forward.ts`). */
export type CanonicalSync = FastForwardOutcome;

export interface LandData {
  /** Which kind of forge credential the command used; never the credential. */
  credential: CredentialKind;
  results: LandResult[];
  /** `--pending` only: the sync every run ends with, whether or not it landed anything. */
  canonical_sync?: CanonicalSync;
  /** Each session landed (or held) by this run, when any pull request carried a session marker homed here. */
  sessions?: SessionLandResult[];
}

interface Context {
  env: RunEnv;
  store: Store;
  forge: ForgeClient;
  credentials: ForgeCredentials;
  /** The repository's main worktree, and the store root inside it. */
  canonical: string;
  canonicalStoreRoot: string;
  prefix: string;
  defaultBranch: string;
  base: string;
  recordingLogin: string | null;
  /** True when this process's forge credential is the recording login, so its records count. */
  canRecord: boolean;
  mergeMethod: MergeMethod;
  resolver: string[] | null;
}

function emptyResult(number: number, worktree: string | null): LandResult {
  return {
    pull_request: number,
    worktree,
    outcome: 'merged',
    consent: null,
    state: null,
    reason: null,
    catch_up: null,
    merged_commit: null,
    canonical_sync: null,
    reclaim: null,
    records_posted: [],
    records_reported_only: [],
  };
}

async function git(ctx: Context, args: readonly string[], cwd: string, allowFailure = false) {
  return ctx.env.git.run(args, { cwd, allowFailure });
}

/** A fetch or push against `origin`, authenticated as the App when there is one (`runRemoteGit`). */
async function remoteGit(ctx: Context, args: readonly string[], cwd: string, allowFailure = false) {
  return runRemoteGit(ctx.env.git, ctx.credentials, ctx.env.env, args, { cwd, allowFailure });
}

/** write-lifecycle spec: a record goes on the pull request only under the recording login; otherwise only into the envelope. */
async function record(ctx: Context, result: LandResult, label: string, post: () => Promise<void>): Promise<void> {
  if (!ctx.canRecord) {
    result.records_reported_only.push(label);
    return;
  }
  await forgeRead(post);
  result.records_posted.push(label);
}

async function recordLanding(ctx: Context, result: LandResult, number: number, state: LandingRecordState, reason: string, head: string, sentence: string): Promise<void> {
  const at = ctx.env.now().toISOString();
  await record(ctx, result, `${state}:${reason}`, () => ctx.forge.createComment(number, landingBody({ state, reason, head, at }, sentence)));
}

async function isClean(ctx: Context, cwd: string): Promise<boolean> {
  return (await git(ctx, ['status', '--porcelain'], cwd)).stdout.trim() === '';
}

async function rebaseInProgress(ctx: Context, cwd: string): Promise<boolean> {
  for (const name of ['rebase-merge', 'rebase-apply']) {
    const gitPath = (await git(ctx, ['rev-parse', '--git-path', name], cwd)).stdout.trim();
    try {
      await stat(path.resolve(cwd, gitPath));
      return true;
    } catch {
      // absent
    }
  }
  return false;
}

/**
 * Where the catch-up rebase runs. The session's worktree when it is there, clean
 * and at the head being landed — so its branch moves with the rebase. Otherwise
 * a temporary detached worktree at that head, so a session with uncommitted work,
 * or one that is absent, is never touched.
 */
async function checkoutFor(ctx: Context, session: SessionWorktree | undefined, head: string): Promise<{ cwd: string; dispose: () => Promise<void> }> {
  if (session !== undefined && (await isClean(ctx, session.path))) {
    const at = (await git(ctx, ['rev-parse', 'HEAD'], session.path)).stdout.trim();
    if (at === head) return { cwd: session.path, dispose: async () => undefined };
  }
  const dir = await mkdtemp(path.join(tmpdir(), 'ctxr-land-'));
  await rm(dir, { recursive: true, force: true });
  await addDetachedWorktree(ctx.env.git, ctx.canonical, dir, head);
  return {
    cwd: dir,
    dispose: async () => {
      await removeWorktree(ctx.env.git, ctx.canonical, dir);
      await rm(dir, { recursive: true, force: true });
      await pruneWorktrees(ctx.env.git, ctx.canonical);
    },
  };
}

/**
 * write-lifecycle spec ("Landing commits on a host with no git identity"),
 * design.md D6: when nothing configures who commits, the rebase (and a resolver)
 * commit as the recording login, through the process environment only. "Configured"
 * means config or the environment — never git's own guess from the host name, which
 * would sign commits as an account that does not exist.
 */
async function fallbackIdentity(ctx: Context, cwd: string): Promise<Record<string, string>> {
  const email = await git(ctx, ['config', '--get', 'user.email'], cwd, true);
  if (email.stdout.trim() !== '' || ctx.env.env.GIT_COMMITTER_EMAIL || ctx.env.env.EMAIL) return {};
  const login = ctx.recordingLogin ?? 'ctxr-land';
  const address = `${login.replace(/\[bot\]$/, '')}@users.noreply.github.com`;
  return { GIT_COMMITTER_NAME: login, GIT_COMMITTER_EMAIL: address, GIT_AUTHOR_NAME: login, GIT_AUTHOR_EMAIL: address };
}

/** Runs the configured resolver in `cwd` with the playbook as its last argument; resolves to its exit code. */
async function runResolverFor(ctx: Context, cwd: string, pull: PullRequest): Promise<number> {
  return runResolver({
    argv: ctx.resolver!,
    prompt: resolverPrompt(pull.number, ctx.base, ctx.defaultBranch),
    cwd,
    env: { ...ctx.env.env, ...(await fallbackIdentity(ctx, cwd)), CTXR_LAND_PR: String(pull.number), CTXR_LAND_BASE: ctx.base },
    output: ctx.env.io.stderr,
  });
}

/** write-lifecycle spec: the resolver's result is accepted only clean, rebased, containing the base, and passing doctor. */
async function acceptResolution(ctx: Context, cwd: string): Promise<string | null> {
  if (await rebaseInProgress(ctx, cwd)) return 'rebase-in-progress';
  if (!(await isClean(ctx, cwd))) return 'uncommitted-work';
  const contains = await git(ctx, ['merge-base', '--is-ancestor', ctx.base, 'HEAD'], cwd, true);
  if (contains.exitCode !== 0) return 'base-not-contained';
  try {
    const doctorStore = await openStore(ctx.env, { root: path.join(cwd, ctx.prefix) });
    // Derived artifacts are per checkout and never committed; a fresh checkout has none for doctor's store checks to read.
    await catalogBuildCommand.execute(doctorStore);
    await graphBuildCommand.execute(doctorStore);
    const doctor = await doctorCommand.execute(ctx.env, doctorStore);
    if (doctor.exitCode === ExitCode.Ok) return null;
    for (const finding of doctor.findings.filter((f) => f.severity === 'error')) ctx.env.io.stderr.write(`land: doctor: ${finding.code}: ${finding.message}\n`);
    return 'doctor-failed';
  } catch (err) {
    // A store doctor cannot even open is a result that fails doctor.
    ctx.env.io.stderr.write(`land: doctor: ${err instanceof Error ? err.message : String(err)}\n`);
    return 'doctor-failed';
  }
}

/** A leased push of `cwd`'s HEAD to the pull request's branch; false when the lease was refused because the branch moved. */
async function leasedPush(ctx: Context, cwd: string, branch: string, expected: string): Promise<boolean> {
  const pushed = await remoteGit(ctx, ['push', `--force-with-lease=refs/heads/${branch}:${expected}`, 'origin', `HEAD:refs/heads/${branch}`], cwd, true);
  return pushed.exitCode === 0;
}

/**
 * write-lifecycle spec ("An approval carries across a catch-up rebase only when
 * the patches are unchanged"; "A conflict is resolved by the configured resolver
 * and returns for re-approval"). Returns the head to merge, or null when this
 * landing stops here (with `result` saying why).
 */
async function catchUp(ctx: Context, result: LandResult, pull: PullRequest, session: SessionWorktree | undefined, approvedHead: string | null): Promise<string | null> {
  const behind = await git(ctx, ['merge-base', '--is-ancestor', ctx.base, pull.headSha], ctx.canonical, true);
  if (behind.exitCode === 0) {
    result.catch_up = 'not-needed';
    return pull.headSha;
  }

  const checkout = await checkoutFor(ctx, session, pull.headSha);
  try {
    // A rebase keeps each commit's author; only the committer can be missing, and the fallback names it.
    const identity = await fallbackIdentity(ctx, checkout.cwd);
    const rebase = await ctx.env.git.run(['-c', 'core.editor=true', 'rebase', '--quiet', ctx.base], {
      cwd: checkout.cwd,
      allowFailure: true,
      ...(Object.keys(identity).length === 0 ? {} : { env: { ...ctx.env.env, GIT_COMMITTER_NAME: identity.GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL: identity.GIT_COMMITTER_EMAIL } }),
    });
    if (rebase.exitCode === 0) {
      const rebased = (await git(ctx, ['rev-parse', 'HEAD'], checkout.cwd)).stdout.trim();
      const same = approvedHead === null || (await carriesOver(ctx.env.git, checkout.cwd, ctx.base, approvedHead, rebased));
      if (!(await leasedPush(ctx, checkout.cwd, pull.headRef, pull.headSha))) {
        result.outcome = 'lease-refused';
        result.reason = `the branch moved after ${pull.headSha.slice(0, 7)} was read, so the leased push was refused`;
        return null;
      }
      if (!same) {
        result.catch_up = 'patches-changed';
        result.outcome = 'needs-reapproval';
        result.reason = 'the rebase changed a patch, so the approval does not carry over';
        await recordLanding(ctx, result, pull.number, 'needs-reapproval', 'patches-changed', rebased,
          `Rebased onto ${ctx.base}, and the rebase changed a patch, so the approval of ${approvedHead!.slice(0, 7)} does not carry over. This change needs a new decision.`);
        return null;
      }
      result.catch_up = approvedHead === null ? 'clean' : 'carried-over';
      if (approvedHead !== null && ctx.recordingLogin !== null) {
        const decision = (await forgeRead(() => reviewStateOf(ctx.env.git, checkout.cwd, ctx.base, ctx.forge, ctx.recordingLogin!, pull))).decision!;
        await record(ctx, result, 'carry-over', () =>
          ctx.forge.createReview(pull.number, {
            event: 'APPROVE',
            commitId: rebased,
            body: decisionBody({ ...decision, decision: 'approve', head: rebased, carriedFrom: decision.carriedFrom ?? approvedHead, comment: null }),
          }),
        );
      }
      return rebased;
    }

    await git(ctx, ['rebase', '--abort'], checkout.cwd, true);
    if (ctx.resolver === null) {
      result.catch_up = 'conflict';
      result.outcome = 'blocked';
      result.reason = 'conflict';
      await recordLanding(ctx, result, pull.number, 'blocked', 'conflict', pull.headSha,
        `Rebasing onto ${ctx.base} conflicts, and this store names no conflict resolver. A person or an agent session resolves it.`);
      return null;
    }

    const exit = await runResolverFor(ctx, checkout.cwd, pull);
    const refusal = exit === 0 ? await acceptResolution(ctx, checkout.cwd) : `resolver-exit-${exit}`;
    if (refusal !== null) {
      // Leave the branch as the forge has it: put the checkout back where it was.
      if (await rebaseInProgress(ctx, checkout.cwd)) await git(ctx, ['rebase', '--abort'], checkout.cwd, true);
      await git(ctx, ['reset', '--hard', '--quiet', pull.headSha], checkout.cwd, true);
      result.catch_up = 'conflict';
      result.outcome = 'blocked';
      result.reason = refusal;
      await recordLanding(ctx, result, pull.number, 'blocked', refusal, pull.headSha,
        `Rebasing onto ${ctx.base} conflicts, and the resolver's result was not accepted (${refusal}). Nothing was pushed.`);
      return null;
    }
    const resolved = (await git(ctx, ['rev-parse', 'HEAD'], checkout.cwd)).stdout.trim();
    if (!(await leasedPush(ctx, checkout.cwd, pull.headRef, pull.headSha))) {
      result.outcome = 'lease-refused';
      result.reason = `the branch moved after ${pull.headSha.slice(0, 7)} was read, so the leased push was refused`;
      return null;
    }
    result.catch_up = 'conflict-resolved';
    result.outcome = 'needs-reapproval';
    result.reason = 'conflict-resolved';
    await recordLanding(ctx, result, pull.number, 'needs-reapproval', 'conflict-resolved', resolved,
      `Rebasing onto ${ctx.base} conflicted. The configured resolver resolved it as ${resolved.slice(0, 7)}, which nobody has approved yet. This change needs a new decision.`);
    return null;
  } finally {
    await checkout.dispose();
  }
}

/** write-lifecycle spec: after the forge reports merged — sync the canonical clone, reclaim the worktree, record the landing. */
/**
 * write-lifecycle spec ("Every landing run brings the canonical clone up to
 * date when it is safe to"), land-sweep-syncs-canonical-clone D2: fast-forward
 * only, only on the default branch, only with no uncommitted changes to tracked
 * files — the rule the lifecycle skill gives agents. Anything else is left
 * exactly as it was, and the reason is returned. Untracked files do not block
 * it; if the fast-forward would overwrite one, git refuses and that is reported.
 */
async function syncCanonical(ctx: Context): Promise<CanonicalSync> {
  await remoteGit(ctx, ['fetch', '--quiet', 'origin', ctx.defaultBranch], ctx.canonical, true);
  return fastForwardIfSafe((args) => git(ctx, args, ctx.canonical, true), ctx.defaultBranch, 'the canonical clone');
}

function syncFinding(sync: CanonicalSync): Finding | null {
  if (sync.synced) return null;
  return { code: 'land.canonical_not_synced', severity: 'warning', message: `The canonical clone was left as it was: ${sync.reason}.` };
}

function syncLine(sync: CanonicalSync): string {
  if (!sync.synced) return `canonical clone not synced: ${sync.reason}`;
  return sync.from === sync.to ? 'canonical clone already current' : `canonical clone synced ${sync.from?.slice(0, 7)}..${sync.to?.slice(0, 7)}`;
}

async function afterMerge(ctx: Context, result: LandResult, pull: PullRequest, session: SessionWorktree | undefined): Promise<void> {
  result.canonical_sync = await syncCanonical(ctx);

  if (session === undefined) {
    result.reclaim = { removed: false, reason: 'no session worktree for this branch' };
  } else if (path.resolve(ctx.store.root).startsWith(path.resolve(session.path) + path.sep) || path.resolve(ctx.store.root) === path.resolve(session.path)) {
    result.reclaim = { removed: false, reason: 'this command is running inside that worktree' };
  } else if (!(await isClean(ctx, session.path))) {
    result.reclaim = { removed: false, reason: 'the worktree has uncommitted work' };
  } else {
    const removed = await git(ctx, ['worktree', 'remove', session.path], ctx.canonical, true);
    if (removed.exitCode !== 0) {
      result.reclaim = { removed: false, reason: removed.stderr.trim() };
    } else {
      // The forge said merged; a squashed branch never looks merged to git's ancestry test.
      await git(ctx, ['branch', '-D', session.branch], ctx.canonical, true);
      result.reclaim = { removed: true, reason: null };
    }
  }

  if (session !== undefined) {
    await writeLandingRecord(ctx.canonicalStoreRoot, {
      worktree: session.name,
      branch: session.branch,
      pull_request: pull.number,
      merged_commit: result.merged_commit,
      landed_at: ctx.env.now().toISOString(),
    });
  }
}

async function landOne(ctx: Context, number: number, confirm: boolean): Promise<LandResult> {
  let pull = await forgeRead(() => ctx.forge.pull(number));
  if (pull.headRef === ctx.defaultBranch) {
    throw new LandRefusedError('default_branch', `Pull request #${number}'s head is the default branch "${ctx.defaultBranch}", which is never landed.`, { pull_request: number });
  }
  const sessions = await sessionWorktrees(ctx.env.git, ctx.canonical, ctx.store.config);
  const session = sessions.find((s) => s.branch === pull.headRef);
  const result = emptyResult(number, session?.name ?? null);

  // A retry after the merge went through performs only what remains.
  if (pull.merged) {
    result.merged_commit = pull.mergeCommitSha;
    await afterMerge(ctx, result, pull, session);
    return result;
  }
  if (pull.state !== 'open') {
    throw new LandRefusedError('not_open', `Pull request #${number} is closed without being merged.`, { pull_request: number });
  }

  await remoteGit(ctx, ['fetch', '--quiet', 'origin', ctx.defaultBranch, pull.headRef], ctx.canonical, true);

  let approvedHead: string | null = null;
  if (confirm) {
    result.consent = 'confirm';
  } else {
    const state = await forgeRead(() => reviewStateOf(ctx.env.git, ctx.canonical, ctx.base, ctx.forge, ctx.recordingLogin!, pull));
    if (state.state !== 'approved' || state.decision === null) {
      result.outcome = 'no-consent';
      result.state = state.state;
      result.reason = `pull request #${number} is ${state.state}; landing needs an approval of its current head, or --confirm`;
      return result;
    }
    result.consent = 'recorded';
    approvedHead = state.decision.head;
  }

  const head = await catchUp(ctx, result, pull, session, approvedHead);
  if (head === null) return result;

  try {
    await ctx.forge.merge(number, { method: ctx.mergeMethod, sha: head });
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
  }
  // Never claim a merge from the merge call alone.
  pull = await forgeRead(() => ctx.forge.pull(number));
  if (!pull.merged) {
    result.outcome = 'merge-refused';
    result.reason = 'the forge did not merge the pull request; it may be waiting on checks or branch protection, and a later run retries';
    return result;
  }
  result.outcome = 'merged';
  result.merged_commit = pull.mergeCommitSha;
  await afterMerge(ctx, result, pull, session);
  return result;
}

function findingFor(result: LandResult): Finding | null {
  if (result.outcome === 'merged') return null;
  return {
    code: `land.${result.outcome.replace(/-/g, '_')}`,
    severity: result.outcome === 'needs-reapproval' ? 'warning' : 'error',
    message: `#${result.pull_request}: ${result.reason ?? result.outcome}`,
    subject: String(result.pull_request),
  };
}

function summaryLine(r: LandResult): string {
  const parts = [`${r.store ? `${r.store}` : ''}#${r.pull_request} ${r.outcome}`];
  if (r.catch_up !== null) parts.push(`catch-up ${r.catch_up}`);
  if (r.merged_commit !== null) parts.push(`merged as ${r.merged_commit.slice(0, 7)}`);
  if (r.canonical_sync !== null) parts.push(syncLine(r.canonical_sync));
  if (r.reclaim !== null) parts.push(r.reclaim.removed ? 'worktree removed' : `worktree kept: ${r.reclaim.reason}`);
  if (r.reason !== null && r.outcome !== 'merged') parts.push(r.reason);
  if (r.records_reported_only.length > 0) parts.push(`not posted (credential is not the recording login): ${r.records_reported_only.join(', ')}`);
  return parts.join(' | ');
}

/**
 * write-lifecycle spec ("Landing merges only a head that carries consent"):
 * one pull request, or with `--pending` every session pull request whose
 * current head carries an approval. design.md D1: this is code because the
 * runner acting on a page approval has no agent in it, and the consent check is
 * the one thing that must be enforced rather than instructed.
 */
export async function execute(env: RunEnv, store: Store, flags: LandFlags, forge?: ForgeClient): Promise<CommandOutcome<LandData>> {
  if (flags.pending && flags.confirm) throw new LandFlagsError('--pending lands only recorded approvals, so it does not take --confirm.');
  if (flags.session !== undefined) {
    if (flags.pending || flags.pr !== undefined) throw new LandFlagsError('--session names the whole session; it takes no pull request number and no --pending.');
    if (!flags.confirm) throw new LandFlagsError('--session lands a whole session on an explicit go, so it needs --confirm; a recorded approval lands with --pending.');
  } else if (flags.pending === (flags.pr !== undefined)) {
    throw new LandFlagsError('Name one pull request number, or pass --pending — not both, and not neither.');
  }
  if (flags.pr !== undefined && (!Number.isInteger(flags.pr) || flags.pr <= 0)) throw new LandFlagsError('The pull request must be a positive whole number.');
  const approval = store.config.change_approval;
  if (flags.pending && approval === undefined) throw new ChangeApprovalNotDeclaredError('ctxr land --pending');

  // Before any forge call: a sweep that finds another landing running steps aside without reading anything.
  const lock = await acquireLandLock(env.git, store.root);
  if (!lock.acquired) {
    if (!flags.pending) throw new LandBusyError(lock.holder.pid, lock.holder.host);
    return {
      exitCode: ExitCode.Ok,
      data: null,
      findings: [],
      humanSummary: `Another landing is running against this repository (process ${lock.holder.pid} on ${lock.holder.host}); this sweep stepped aside.`,
      notices: [`land: another landing is running (process ${lock.holder.pid} on ${lock.holder.host}); stepped aside.`],
      storeRoot: store.root,
      schemaVersion: store.config.schema_version,
    };
  }
  try {
    return await landHoldingLock(env, store, flags, approval, forge);
  } finally {
    await lock.release();
  }
}

async function landHoldingLock(
  env: RunEnv,
  store: Store,
  flags: LandFlags,
  approval: Store['config']['change_approval'],
  forge: ForgeClient | undefined,
): Promise<CommandOutcome<LandData>> {
  const credentials = forge === undefined ? await credentialsFor(env, store.root) : ghCredentials(env.env);
  const client = forge ?? createGhForgeClient(store.root, credentials);
  const canonical = await mainWorktreePath(env.git, store.root);
  const prefix = await storePrefix(env.git, store.root);
  const defaultBranch = store.config.git.default_branch;
  const recordingLogin = approval?.recording_login ?? null;
  const ctx: Context = {
    env,
    store,
    forge: client,
    credentials,
    canonical,
    canonicalStoreRoot: path.join(canonical, prefix),
    prefix,
    defaultBranch,
    base: `origin/${defaultBranch}`,
    recordingLogin,
    canRecord: recordingLogin !== null && (await forgeRead(() => client.login())) === recordingLogin,
    mergeMethod: approval?.merge_method ?? 'squash',
    resolver: approval?.resolver ?? null,
  };

  const results: LandResult[] = [];
  const sessionResults: SessionLandResult[] = [];
  if (flags.pending) {
    await remoteGit(ctx, ['fetch', '--quiet', 'origin'], canonical, true);
    // A pull request carrying a session marker is its session's: landed below when homed here, left to its home otherwise.
    const reach = await storeReach(env.git, { root: store.root, canonical, config: store.config, forge: client, credentials }, storeForges(env, forge));
    const approved = (await sessionPulls(env.git, canonical, store.config, client, recordingLogin!)).filter(
      (p) => p.review.state === 'approved' && !readAsSessionPart(p.pull, reach?.home.slug ?? null, store.config),
    );
    // Each is re-read inside landOne, immediately before its merge, so a decision changed meanwhile is honoured.
    for (const p of approved) results.push(await landOne(ctx, p.pull.number, false));
    if (reach !== null) {
      const listings = await listOpen(reach);
      const home = listings.find((l) => l.store === reach.home)!;
      if (home.error !== null) throw new ForgeUnreachableError(home.error);
      for (const group of groupSessions(reach, listings).filter((g) => g.homedHere)) {
        const landed = await landSession(ctx, reach, group.identity, group.parts, 'recorded', results);
        if (landed !== null) sessionResults.push(landed);
      }
    }
  } else if (flags.session !== undefined) {
    sessionResults.push(await landSessionByName(ctx, flags.session, forge, results));
  } else {
    if (!flags.confirm && approval === undefined) throw new ChangeApprovalNotDeclaredError('ctxr land without --confirm');
    results.push(await landOne(ctx, flags.pr!, flags.confirm));
  }

  // land-sweep-syncs-canonical-clone D4: last, under the lock, so it includes whatever this run merged.
  const sweepSync = flags.pending ? await syncCanonical(ctx) : undefined;

  const syncFindings = [
    ...results.map((r) => (r.canonical_sync === null ? null : syncFinding(r.canonical_sync))),
    sweepSync === undefined ? null : syncFinding(sweepSync),
  ];
  const findings = [...results.map(findingFor), ...syncFindings].filter((f): f is Finding => f !== null);
  // D3: a sync that could not happen is a warning; the exit code reflects landings only.
  const failed = flags.pending
    ? results.some((r) => r.outcome !== 'merged' && r.outcome !== 'needs-reapproval')
    : results.some((r) => r.outcome !== 'merged') || sessionResults.some((r) => r.state !== 'landed');
  const lines = results.length === 0 && sessionResults.length === 0 ? ['No approved session pull request to land.'] : results.map(summaryLine);
  lines.push(...sessionResults.map(sessionLine));
  findings.push(...sessionResults.filter((r) => r.state !== 'landed').map(sessionFinding));
  if (sweepSync !== undefined) lines.push(syncLine(sweepSync));
  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data: {
      credential: client.credential,
      results,
      ...(sweepSync === undefined ? {} : { canonical_sync: sweepSync }),
      ...(sessionResults.length === 0 ? {} : { sessions: sessionResults }),
    },
    findings,
    humanSummary: lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

/**
 * approve-sessions-across-stores (design.md D6): a mounted store's part lands
 * in that mount's clone under the mount's own configuration — its resolver,
 * its merge method, its landing commits — read after the clone is brought up
 * to date by the canonical-sync rule. The consent read there is the session's
 * decision, recorded by the home store's recording login. Null, with the
 * reason, when the clone cannot be brought up to date.
 */
async function mountContext(home: Context, store: SessionStore): Promise<{ ctx: Context } | { reason: string }> {
  const { env } = home;
  const credentials = store.credentials ?? home.credentials;
  const config = store.config;
  const fetched = await runRemoteGit(env.git, credentials, env.env, ['fetch', '--quiet', 'origin'], { cwd: store.root, allowFailure: true });
  if (fetched.exitCode !== 0) return { reason: `the mount's clone could not be fetched: ${fetched.stderr.trim().split('\n')[0] ?? ''}` };
  const sync = await fastForwardIfSafe((args) => env.git.run(args, { cwd: store.root, allowFailure: true }), config.git.default_branch, 'the mount');
  if (!sync.synced) return { reason: sync.reason ?? 'the mount could not be brought up to date' };
  let current: Store['config'];
  try {
    current = await readConfig(store.root);
  } catch (err) {
    return { reason: `the mount's configuration cannot be read: ${err instanceof Error ? err.message : String(err)}` };
  }
  const canonical = await mainWorktreePath(env.git, store.root);
  const prefix = await storePrefix(env.git, store.root);
  const approval = current.change_approval;
  let login: string | null = null;
  try {
    login = await store.forge.login();
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
    return { reason: `the mount's forge could not be read: ${err.message}` };
  }
  return {
    ctx: {
      env,
      store: { root: store.root, config: current },
      forge: store.forge,
      credentials,
      canonical,
      canonicalStoreRoot: path.join(canonical, prefix),
      prefix,
      defaultBranch: current.git.default_branch,
      base: `origin/${current.git.default_branch}`,
      recordingLogin: home.recordingLogin,
      canRecord: home.recordingLogin !== null && login === home.recordingLogin,
      mergeMethod: approval?.merge_method ?? 'squash',
      resolver: approval?.resolver ?? null,
    },
  };
}

const partName = (store: string, number: number): string => `${store}#${number}`;

function retrying(result: LandResult | null): boolean {
  return result === null || result.outcome === 'merge-refused' || result.outcome === 'lease-refused';
}

/**
 * write-lifecycle spec ("A session is landed by its home store, mounted parts
 * first"; "A whole session lands in order on one explicit go"): every part,
 * mounted parts first, the home part last and only once every mounted part has
 * merged. `recorded` lands only what the session's decision names, posting a
 * missing copy of it before a part lands; `confirm` lands the session's open
 * parts on the caller's explicit go. A part already merged counts as landed.
 * The first part that does not land stops the session, leaving every later
 * part open. Returns null for a session with no decision to act on.
 */
async function landSession(
  ctx: Context,
  reach: StoreReach,
  identity: SessionIdentity,
  open: readonly OpenPart[],
  mode: 'recorded' | 'confirm',
  results: LandResult[],
): Promise<SessionLandResult | null> {
  const outcome = await landSessionSteps(ctx, reach, identity, open, mode, results);
  if (outcome !== null && outcome.state === 'retrying' && mode === 'recorded' && outcome.stopped_at !== null) {
    await recordRetrying(ctx, reach, identity, open, outcome);
  }
  return outcome;
}

/**
 * change-approval spec ("The review state is reported by session"): a session
 * left unfinished for a passing reason is recorded on its record part, as a
 * block is, naming the part and why — so `ctxr review list` reports
 * `retrying` between runs. Readers let it stand until that part lands.
 */
async function recordRetrying(ctx: Context, reach: StoreReach, identity: SessionIdentity, open: readonly OpenPart[], outcome: SessionLandResult): Promise<void> {
  try {
    const state = await forgeRead(() => sessionState({ git: ctx.env.git, reach, identity, homedHere: true, open, recordingLogin: ctx.recordingLogin ?? '' }));
    if (state.session === null) return;
    const recordRef = recordPartOf(state.session);
    const store = [...reach.mounts, reach.home].find((s) => s.slug === recordRef.store);
    if (store === undefined) return;
    const code = outcome.reason_code ?? 'retrying';
    const sentence = `Landing this session stopped at ${outcome.stopped_at} (${code}). Nothing after it was landed; the next run tries again.`;
    const mark = landingBody({ state: 'retrying', reason: `${outcome.stopped_at}:${code}`, head: recordRef.head, at: ctx.env.now().toISOString() }, sentence);
    await record(ctx, emptyResult(recordRef.number, null), `retrying:${code}`, () => store.forge.createComment(recordRef.number, mark));
  } catch (err) {
    // The record is a convenience for readers between runs; the landing outcome stands without it.
    if (!(err instanceof ContextureError)) throw err;
  }
}

async function landSessionSteps(
  ctx: Context,
  reach: StoreReach,
  identity: SessionIdentity,
  open: readonly OpenPart[],
  mode: 'recorded' | 'confirm',
  results: LandResult[],
): Promise<SessionLandResult | null> {
  const key = sessionKey(identity);
  const outcome: SessionLandResult = { session: key, home: identity.home, state: 'landed', reason: null, stopped_at: null, landed: [], not_attempted: [], reason_code: null };
  const stop = (state: SessionLandResult['state'], reason: string, part: string | null, rest: readonly string[], code: string | null = null): SessionLandResult => {
    outcome.state = state;
    outcome.reason = reason;
    outcome.stopped_at = part;
    outcome.not_attempted = [...rest];
    outcome.reason_code = state === 'retrying' ? (code ?? 'retrying') : null;
    return outcome;
  };
  const recordingLogin = ctx.recordingLogin ?? '';
  const readState = () => forgeRead(() => sessionState({ git: ctx.env.git, reach, identity, homedHere: true, open, recordingLogin }));

  let order: { store: string; number: number; head: string | null }[];
  let state = mode === 'recorded' || ctx.recordingLogin !== null ? await readState() : null;
  if (mode === 'recorded') {
    if (state === null || state.state === 'awaiting' || state.state === 'changes-requested') return null;
    if (state.state === 'blocked' || state.state === 'needs-reapproval') {
      const names = state.parts.filter((p) => p.status !== 'merged').map((p) => partName(p.storeSlug, p.number));
      if (state.state === 'blocked' && state.reasonPart !== null) results.push(heldResult(state.reasonPart, 'blocked', state.reason ?? 'blocked'));
      return stop(state.state, state.reason ?? state.state, state.reasonPart, names);
    }
    order = landingOrder(state.parts.map((p) => ({ store: p.storeSlug, number: p.number, head: p.ref?.head ?? null })), reach, identity.home);
  } else {
    // An explicit go covers the parts open now, and any part the session's decision named that has merged since.
    const named = state?.parts.filter((p) => p.status === 'merged').map((p) => ({ store: p.storeSlug, number: p.number, head: null })) ?? [];
    const now = open.map((p) => ({ store: p.store.slug, number: p.pull.number, head: null }));
    order = landingOrder([...named, ...now.filter((n) => !named.some((m) => m.store === n.store && m.number === n.number))], reach, identity.home);
  }

  const stores = [...reach.mounts, reach.home];
  const locks: { release(): Promise<void> }[] = [];
  try {
    for (const [index, part] of order.entries()) {
      const name = partName(part.store, part.number);
      const rest = order.slice(index + 1).map((p) => partName(p.store, p.number));
      const store = stores.find((s) => s.slug === part.store);
      if (store === undefined) return stop('retrying', `${name} is on a store this one does not mount now`, name, rest, 'store-unavailable');

      if (mode === 'recorded' && index > 0) {
        // Each step re-reads the session, so a part pushed or added meanwhile reopens it before anything else lands.
        state = await readState();
        if (state.state !== 'approved' && state.state !== 'retrying') {
          if (state.state === 'blocked' && state.reasonPart !== null) results.push(heldResult(state.reasonPart, 'blocked', state.reason ?? 'blocked'));
          return stop(state.state === 'blocked' ? 'blocked' : state.state === 'needs-reapproval' ? 'needs-reapproval' : 'not-approved', state.reason ?? state.state, state.reasonPart ?? name, [name, ...rest]);
        }
      }

      let partCtx: Context = ctx;
      if (store !== reach.home) {
        const lock = await acquireLandLock(ctx.env.git, store.root);
        if (!lock.acquired) return stop('retrying', `another landing is running in ${store.mountName ?? store.slug}'s clone`, name, [name, ...rest], 'mount-busy');
        locks.push(lock);
        const mounted = await mountContext(ctx, store);
        if ('reason' in mounted) return stop('retrying', mounted.reason, name, [name, ...rest], 'mount-not-synced');
        partCtx = mounted.ctx;
      }

      let result: LandResult | null = null;
      let reason: string | null = null;
      try {
        if (mode === 'recorded' && state !== null && state.decision !== null && state.session !== null) {
          // The record is what consent rests on; a part without its copy gets one first, with the record's decision id.
          const partState = state.parts.find((p) => p.storeSlug === part.store && p.number === part.number);
          if (partState !== undefined && partState.status !== 'merged' && !partState.hasCopy && part.head !== null) {
            const decision = state.decision;
            const session = state.session;
            const head = part.head;
            await record(partCtx, emptyResult(part.number, null), 'copy', () =>
              store.forge.createReview(part.number, {
                event: 'APPROVE',
                commitId: head,
                body: decisionBody({ ...decision, head, carriedFrom: null, comment: null, session }),
              }),
            );
          }
        }
        result = await landOne(partCtx, part.number, mode === 'confirm');
        result.store = part.store;
        results.push(result);
      } catch (err) {
        if (err instanceof LandRefusedError && err.finding.code === 'land.not_open') {
          results.push(heldResult(name, 'blocked', 'closed without being merged'));
          return stop('blocked', `${name} was closed without being merged`, name, [name, ...rest]);
        }
        if (!(err instanceof ContextureError)) throw err;
        reason = err.finding.message;
      }
      if (result !== null && result.outcome === 'merged') {
        outcome.landed.push(name);
        continue;
      }
      if (retrying(result)) {
        const code = result === null ? 'forge-unreachable' : result.outcome === 'lease-refused' ? 'push-rejected' : result.outcome;
        return stop('retrying', `${name}: ${reason ?? result?.reason ?? result?.outcome}`, name, rest, code);
      }
      const held = result!;
      const state2 = held.outcome === 'needs-reapproval' ? 'needs-reapproval' : held.outcome === 'blocked' ? 'blocked' : held.outcome === 'no-consent' ? 'not-approved' : 'retrying';
      return stop(state2, `${name}: ${held.reason ?? held.outcome}`, name, rest, held.outcome);
    }
    return outcome;
  } finally {
    for (const lock of locks) await lock.release();
  }
}

/** A result for a part that this run did not try to land, naming why the session holds there. */
function heldResult(part: string, outcome: LandOutcome, reason: string): LandResult {
  const hash = part.lastIndexOf('#');
  const result = emptyResult(Number.parseInt(part.slice(hash + 1), 10), null);
  return { ...result, outcome, reason, store: part.slice(0, hash) };
}

/** `--session`: the session named by its worktree name or branch in this store, landed whole on `--confirm`. */
async function landSessionByName(ctx: Context, name: string, forge: ForgeClient | undefined, results: LandResult[]): Promise<SessionLandResult> {
  const reach = await storeReach(ctx.env.git, { root: ctx.store.root, canonical: ctx.canonical, config: ctx.store.config, forge: ctx.forge, credentials: ctx.credentials }, storeForges(ctx.env, forge));
  if (reach === null) throw new LandRefusedError('session_not_found', 'This store has no "origin" remote to name a session by.', { session: name });
  const worktree = (await sessionWorktrees(ctx.env.git, ctx.canonical, ctx.store.config)).find((w) => w.name === name || w.branch === name);
  const identity: SessionIdentity | null =
    worktree !== undefined
      ? await identityOfWorktree(ctx.env.git, ctx.store.config, worktree.path, worktree.name, worktree.branch)
      : { home: reach.home.slug, branch: name };
  if (identity === null || identity.home !== reach.home.slug) {
    throw new LandRefusedError('session_homed_elsewhere', `The session "${name}" is homed in ${identity?.home ?? 'another store'}; it is landed from there.`, { session: name });
  }
  const listings = await listOpen(reach);
  const home = listings.find((l) => l.store === reach.home)!;
  if (home.error !== null) throw new ForgeUnreachableError(home.error);
  const group = groupSessions(reach, listings, true).find((g) => sessionsEqual(g.identity, identity));
  if (group === undefined) {
    throw new LandRefusedError('session_not_found', `No open pull request carries the session ${sessionKey(identity)}, here or in a store this one mounts.`, { session: name });
  }
  return (await landSession(ctx, reach, identity, group.parts, 'confirm', results))!;
}

function sessionLine(r: SessionLandResult): string {
  const parts = [`session ${r.session} ${r.state}`];
  if (r.landed.length > 0) parts.push(`landed ${r.landed.join(', ')}`);
  if (r.stopped_at !== null) parts.push(`stopped at ${r.stopped_at}`);
  if (r.reason !== null) parts.push(r.reason);
  if (r.not_attempted.length > 0) parts.push(`not attempted ${r.not_attempted.join(', ')}`);
  return parts.join(' | ');
}

function sessionFinding(r: SessionLandResult): Finding {
  return {
    code: `land.session_${r.state.replace(/-/g, '_')}`,
    severity: r.state === 'needs-reapproval' || r.state === 'not-approved' ? 'warning' : 'error',
    message: `${r.session}: ${r.reason ?? r.state}`,
    subject: r.stopped_at ?? r.session,
  };
}
