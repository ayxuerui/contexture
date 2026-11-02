import { readConfig } from '../config/load.js';
import { MIGRATION_STEPS } from '../config/migrations.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ContextureError, SyncFlagsError, SyncForgeUnreachableError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor, runRemoteGit, type CredentialKind } from '../core/forge/credentials.js';
import { syncCanonicalClone, type FastForwardOutcome } from '../core/git/fast-forward.js';
import { hardenGit } from '../core/git/hardened.js';
import { acquireLandLock } from '../core/git/land-lock.js';
import { mainWorktreePath } from '../core/git/worktree.js';
import type { Store } from '../core/store.js';
import * as sharedStoresSyncCommand from './shared-stores-sync.js';

export const requires: CommandRequires = { store: 'required' };

export interface SyncFlags {
  /** `--every <minutes>`: keep running, a round every this many minutes, mounts included. */
  every?: number;
}

export interface SyncData {
  /** Which kind of forge credential the fetch used; never the credential. */
  credential: CredentialKind | null;
  /** The canonical sync, reported as `ctxr land` reports it; null when another landing held the lock. */
  canonical_sync: FastForwardOutcome | null;
  /** `--every` only: the minutes between rounds. */
  every_minutes?: number;
  /** `--every` only: the first round's mount refresh, as `ctxr shared-stores sync` reports it. */
  mounts?: sharedStoresSyncCommand.MountSyncResult[];
}

/** One canonical sync: stepped aside for a landing, fetch failed, or the fast-forward rule's outcome. */
type CanonicalRound =
  | { kind: 'busy'; holder: { pid: number; host: string } }
  | { kind: 'fetch-failed'; branch: string; error: string; outcome: FastForwardOutcome; credential: CredentialKind }
  | { kind: 'ran'; outcome: FastForwardOutcome; credential: CredentialKind };

/**
 * write-lifecycle spec ("A command brings the canonical clone up to date"):
 * under landing's repository lock, so a person's `ctxr land` and a server's
 * `ctxr sync` never race (design.md D2); fetched through landing's
 * authenticated fetch, so in App mode it fetches as the App; then the
 * fast-forward rule every landing run applies. Pushes nothing and touches no
 * mount.
 */
async function canonicalRound(env: RunEnv, store: Store): Promise<CanonicalRound> {
  const lock = await acquireLandLock(env.git, store.root);
  if (!lock.acquired) return { kind: 'busy', holder: lock.holder };
  try {
    const credentials = await credentialsFor(env, store.root);
    const canonical = await mainWorktreePath(env.git, store.root);
    const branch = store.config.git.default_branch;
    const result = await syncCanonicalClone(
      () => runRemoteGit(env.git, credentials, env.env, ['fetch', '--quiet', 'origin', branch], { cwd: canonical, allowFailure: true }),
      (args) => env.git.run(args, { cwd: canonical, allowFailure: true }),
      branch,
      'the canonical clone',
    );
    if (!result.fetched) return { kind: 'fetch-failed', branch, error: result.error, outcome: result.outcome, credential: credentials.kind };
    return { kind: 'ran', outcome: result.outcome, credential: credentials.kind };
  } finally {
    await lock.release();
  }
}

function syncLine(sync: FastForwardOutcome): string {
  if (!sync.synced) return `canonical clone not synced: ${sync.reason}`;
  return sync.from === sync.to ? 'canonical clone already current' : `canonical clone synced ${sync.from?.slice(0, 7)}..${sync.to?.slice(0, 7)}`;
}

function busyLine(holder: { pid: number; host: string }): string {
  return `Another landing is running against this repository (process ${holder.pid} on ${holder.host}); it syncs the canonical clone itself, so this sync stepped aside.`;
}

function leftAloneFinding(sync: FastForwardOutcome): Finding | null {
  if (sync.synced) return null;
  return { code: 'sync.canonical_not_synced', severity: 'warning', message: `The canonical clone was left as it was: ${sync.reason}.` };
}

function envelope(store: Store, exitCode: ExitCode, data: SyncData, findings: Finding[], lines: string[], notices?: string[]): CommandOutcome<SyncData> {
  return {
    exitCode,
    data,
    findings,
    humanSummary: lines.join('\n'),
    ...(notices === undefined ? {} : { notices }),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

/** One `ctxr sync`, with no loop: the canonical clone only. */
async function once(env: RunEnv, store: Store): Promise<CommandOutcome<SyncData>> {
  const round = await canonicalRound(env, store);
  if (round.kind === 'busy') {
    return envelope(store, ExitCode.Ok, { credential: null, canonical_sync: null }, [], [busyLine(round.holder)], [`sync: another landing is running (process ${round.holder.pid} on ${round.holder.host}); stepped aside.`]);
  }
  if (round.kind === 'fetch-failed') throw new SyncForgeUnreachableError(round.branch, round.error);
  const finding = leftAloneFinding(round.outcome);
  // A clone left alone is a warning that keeps the success code, as in every landing run.
  return envelope(store, ExitCode.Ok, { credential: round.credential, canonical_sync: round.outcome }, finding === null ? [] : [finding], [syncLine(round.outcome)]);
}

export interface RoundReport {
  /** True when the round failed: the fetch, a mount, or the configuration could not be read. */
  failed: boolean;
  lines: string[];
  canonical: FastForwardOutcome | null;
  credential: CredentialKind | null;
  mounts: sharedStoresSyncCommand.MountSyncResult[];
}

/**
 * One round of `ctxr sync --every`: the canonical sync, then the mounts as
 * `ctxr shared-stores sync` refreshes them. The configuration is read again
 * each round, so a mount declared after the loop started is cloned on the
 * next round.
 */
export async function syncRound(env: RunEnv, root: string): Promise<RoundReport> {
  let store: Store;
  try {
    store = { root, config: await readConfig(root, env.migrationSteps ?? MIGRATION_STEPS) };
  } catch (err) {
    return { failed: true, lines: [`the configuration could not be read: ${err instanceof Error ? err.message : String(err)}`], canonical: null, credential: null, mounts: [] };
  }
  const lines: string[] = [];
  let failed = false;
  let canonical: FastForwardOutcome | null = null;
  let credential: CredentialKind | null = null;
  try {
    const round = await canonicalRound(env, store);
    if (round.kind === 'busy') {
      lines.push(busyLine(round.holder));
    } else {
      canonical = round.outcome;
      credential = round.credential;
      if (round.kind === 'fetch-failed') failed = true;
      lines.push(syncLine(round.outcome));
    }
  } catch (err) {
    failed = true;
    lines.push(`canonical clone not synced: ${err instanceof ContextureError || err instanceof Error ? err.message : String(err)}`);
  }
  let mounts: sharedStoresSyncCommand.MountSyncResult[] = [];
  try {
    const shared = await sharedStoresSyncCommand.execute(env, store);
    mounts = shared.data?.mounts ?? [];
    if (shared.exitCode !== ExitCode.Ok) failed = true;
    if (mounts.length > 0) lines.push(shared.humanSummary);
  } catch (err) {
    failed = true;
    lines.push(`the mounts could not be refreshed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { failed, lines, canonical, credential, mounts };
}

export interface SyncLoop {
  /** Resolves once the round in progress, if any, has ended; no round starts after. */
  stop(): Promise<void>;
}

/**
 * write-lifecycle spec ("The canonical-clone sync can keep running, mounts
 * included"): a round every `intervalMs` after the previous round ended, so
 * two rounds never overlap. Each round's report goes to `write`; a failed
 * round is reported and the next one still runs. The pending timer keeps the
 * process alive, so the loop runs until the process is stopped.
 */
export function startSyncLoop(env: RunEnv, root: string, intervalMs: number, write: (line: string) => void, firstDelayMs = intervalMs): SyncLoop {
  let stopped = false;
  let running: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;

  const schedule = (delay: number): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      timer = null;
      running = syncRound(env, root)
        .then(
          (report) => {
            const prefix = report.failed ? 'sync: round failed: ' : 'sync: ';
            for (const line of report.lines) write(`${prefix}${line}`);
          },
          (err: unknown) => write(`sync: round failed: ${err instanceof Error ? err.message : String(err)}`),
        )
        .finally(() => {
          running = null;
          schedule(intervalMs);
        });
    }, delay);
  };
  schedule(firstDelayMs);

  return {
    async stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      await running;
    },
  };
}

/** `--every` runs its first round now, reports it, and leaves the loop running for later rounds. */
async function every(env: RunEnv, store: Store, minutes: number): Promise<CommandOutcome<SyncData>> {
  const first = await syncRound(env, store.root);
  startSyncLoop(env, store.root, minutes * 60_000, (line) => env.io.stderr.write(`${line}\n`));
  const findings: Finding[] = [];
  if (first.failed) findings.push({ code: 'sync.round_failed', severity: 'warning', message: `The first round failed; the loop keeps running: ${first.lines.join('; ')}` });
  else if (first.canonical !== null) {
    const finding = leftAloneFinding(first.canonical);
    if (finding !== null) findings.push(finding);
  }
  const lines = [...first.lines.map((line) => (first.failed ? `round failed: ${line}` : line)), `Syncing again every ${minutes} minute(s) until stopped.`];
  // The loop is running: a failed first round is a warning, never an exit code that reads as "stopped".
  return envelope(store, ExitCode.Ok, { credential: first.credential, canonical_sync: first.canonical, every_minutes: minutes, mounts: first.mounts }, findings, lines);
}

export async function execute(callerEnv: RunEnv, store: Store, flags: SyncFlags = {}): Promise<CommandOutcome<SyncData>> {
  // serve-keeps-its-clone-current D12: every git command a sync runs ignores the repository's hooks and drivers.
  const env: RunEnv = { ...callerEnv, git: hardenGit(callerEnv.git) };
  if (flags.every === undefined) return once(env, store);
  if (!Number.isInteger(flags.every) || flags.every <= 0) throw new SyncFlagsError('--every takes a positive whole number of minutes.');
  return every(env, store, flags.every);
}
