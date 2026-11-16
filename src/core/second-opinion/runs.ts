import { randomBytes } from 'node:crypto';
import { existsSync, linkSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SecondOpinionLineup } from '../../config/schema.js';
import { SECOND_OPINION_OWNER_VARIABLE } from '../mcp/tool-map.js';
import { SecondOpinionBusyError, SecondOpinionNoSuchRunError, SecondOpinionUsageError } from '../errors.js';

/**
 * second-opinion-start-and-fetch D2, D4: a detached second opinion lives in a
 * run folder under a per-user parent in the temporary directory, outside any
 * store checkout. The folder is the job: its plan or question, its state, and
 * once it ends, its result. One detached run at a time per machine user holds
 * the parent's lock. Folders go one hour after their run ends, swept whenever
 * a second-opinion command starts.
 */

/** How long a run's folder outlives the end of its run. */
export const RUN_LIFETIME_MS = 60 * 60 * 1000;

/** The member who owns a run on the store's server (D5), named where the server sets it. */
export const RUN_OWNER_VARIABLE = SECOND_OPINION_OWNER_VARIABLE;

const LOCK = '.lock';
const RUN_FILE = 'run.json';
const RESULT_FILE = 'result.json';
const RUN_ID = /^[a-z2-7]{26}$/;

export type RunMode = 'critique' | 'poll';
export type RunState = 'running' | 'finished' | 'stopped';

export interface RunRecord {
  run: string;
  mode: RunMode;
  /** The member who started it, on the server; null in a shell. */
  owner: string | null;
  started_at: string;
  /** The detached child's pid and its start time, so a reused pid is not taken for the run. */
  pid: number | null;
  pid_start: string | null;
  /** The lineup read when the run was started; the child never re-reads the store (second-opinion-lineup-in-store-config D5). */
  lineup: SecondOpinionLineup;
  /** The arguments the child runs with, the plan or question file among them. */
  argv: string[];
  /** Set the first time the run is found to have ended without a result. */
  stopped_at?: string;
}

export interface RunResult {
  exit_code: number;
  human: string;
  data: unknown;
  finished_at: string;
}

interface LockRecord {
  run: string;
  pid: number;
  pid_start: string | null;
}

/** The per-user parent of every run folder, created 0700 and refused when anyone else could reach it. */
export function runsRoot(): string {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 0;
  const root = path.join(tmpdir(), `ctxr-second-opinion-runs-${uid}`);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const info = lstatSync(root);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new SecondOpinionUsageError(`${root} is not a directory; remove it and run again`);
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new SecondOpinionUsageError(`${root} belongs to another user; remove it and run again`);
  if ((info.mode & 0o077) !== 0) throw new SecondOpinionUsageError(`${root} can be read by other users; remove it and run again`);
  return root;
}

/** 128 random bits, base32 lowercase: unguessable, and safe as a folder name. */
export function newRunId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  const bytes = randomBytes(17);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < 26) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

/** A process's start time, from /proc on Linux; null elsewhere, where only the pid is checked. */
export function processStart(pid: number): string | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // The command name is in parentheses and may hold spaces; the fields after it are space-separated.
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return fields[19] ?? null;
  } catch {
    return null;
  }
}

export function isAlive(pid: number | null, pidStart: string | null): boolean {
  if (pid === null) return false;
  try {
    process.kill(pid, 0);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EPERM') return false;
  }
  if (pidStart === null) return true;
  const now = processStart(pid);
  return now === null || now === pidStart;
}

const readJson = <T>(file: string): T | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
};

export function runFolder(root: string, run: string): string {
  return path.join(root, run);
}

export function readRun(folder: string): RunRecord | null {
  return readJson<RunRecord>(path.join(folder, RUN_FILE));
}

export function writeRun(folder: string, record: RunRecord): void {
  writeFileSync(path.join(folder, RUN_FILE), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

export function readResult(folder: string): RunResult | null {
  return readJson<RunResult>(path.join(folder, RESULT_FILE));
}

export function writeResult(folder: string, result: RunResult): void {
  writeFileSync(path.join(folder, RESULT_FILE), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
}

/** A run's state now. A run with no result whose process is gone is stopped, and is stamped so its lifetime can run out. */
export function stateOf(folder: string, record: RunRecord): RunState {
  if (existsSync(path.join(folder, RESULT_FILE))) return 'finished';
  if (record.stopped_at !== undefined) return 'stopped';
  // A run whose child has not yet been recorded is still being started by its parent.
  if (record.pid === null) return Date.now() - Date.parse(record.started_at) > 60_000 ? markStopped(folder, record) : 'running';
  if (isAlive(record.pid, record.pid_start)) return 'running';
  // The child may have written its result between the two checks.
  if (existsSync(path.join(folder, RESULT_FILE))) return 'finished';
  return markStopped(folder, record);
}

function markStopped(folder: string, record: RunRecord): 'stopped' {
  writeRun(folder, { ...record, stopped_at: new Date().toISOString() });
  return 'stopped';
}

function endedAt(folder: string, record: RunRecord): number | null {
  const result = readResult(folder);
  if (result !== null) return Date.parse(result.finished_at);
  if (record.stopped_at !== undefined) return Date.parse(record.stopped_at);
  return null;
}

/** Marks runs that ended without a result as stopped, and removes every folder whose run ended over an hour ago. */
export function sweep(root: string, now = Date.now()): void {
  for (const name of readdirSync(root)) {
    if (!RUN_ID.test(name)) continue;
    const folder = runFolder(root, name);
    const record = readRun(folder);
    if (record === null) {
      // A folder with no record is a start that died before writing one.
      if (now - statSync(folder).mtimeMs > RUN_LIFETIME_MS) rmSync(folder, { recursive: true, force: true });
      continue;
    }
    if (stateOf(folder, record) === 'running') continue;
    const ended = endedAt(folder, readRun(folder) ?? record);
    if (ended !== null && now - ended > RUN_LIFETIME_MS) rmSync(folder, { recursive: true, force: true });
  }
}

/**
 * Takes the per-user lock for `run`, held for now by this process. A lock
 * whose holder is gone is taken over. A live holder refuses, naming its run
 * to the caller only when the caller owns it (D5).
 */
export function takeLock(root: string, run: string, owner: string | null): void {
  const file = path.join(root, LOCK);
  const mine = JSON.stringify({ run, pid: process.pid, pid_start: processStart(process.pid) } satisfies LockRecord);
  for (let attempt = 0; attempt < 5; attempt++) {
    if (createExclusive(file, mine)) return;
    const raw = readRaw(file);
    if (raw === null) continue; // Released between the two calls.
    const holder = parseLock(raw);
    if (holder !== null && isAlive(holder.pid, holder.pid_start)) {
      const held = readRun(runFolder(root, holder.run));
      throw new SecondOpinionBusyError(held !== null && held.owner === owner ? holder.run : null);
    }
    // Revisions after critique 1: the stale lock is replaced only under the reclaim mutex, and only if it is
    // still the one judged stale, so two starters cannot both take it over.
    if (!takeReclaim(root)) continue;
    try {
      if (readRaw(file) === raw) {
        rmSync(file, { force: true });
        if (createExclusive(file, mine)) return;
      }
    } finally {
      rmSync(path.join(root, RECLAIM), { force: true });
    }
  }
  throw new SecondOpinionBusyError(null);
}

const RECLAIM = '.lock.reclaim';
const RECLAIM_STALE_MS = 10_000;

/**
 * Creates `file` holding `content` only if it does not exist, and never shows it empty: the content is written
 * to a temporary name first and hard-linked into place, which fails if the file exists. A reader that found the
 * lock empty would otherwise take it for a stale one and remove a live holder's lock.
 */
function createExclusive(file: string, content: string): boolean {
  const staged = `${file}.${process.pid}.${randomBytes(6).toString('hex')}`;
  writeFileSync(staged, content, { mode: 0o600, flag: 'wx' });
  try {
    linkSync(staged, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    rmSync(staged, { force: true });
  }
}

function readRaw(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function parseLock(raw: string): LockRecord | null {
  try {
    return JSON.parse(raw) as LockRecord;
  } catch {
    return null;
  }
}

/** The reclaim mutex: held for the few milliseconds a takeover takes; one older than ten seconds belongs to a dead reclaimer. */
function takeReclaim(root: string): boolean {
  const file = path.join(root, RECLAIM);
  if (createExclusive(file, String(process.pid))) return true;
  try {
    if (Date.now() - statSync(file).mtimeMs > RECLAIM_STALE_MS) rmSync(file, { force: true });
  } catch {
    // Released meanwhile.
  }
  return false;
}

/** Hands the lock to the detached child, which holds it until its run ends. */
export function passLock(root: string, run: string, pid: number, pidStart: string | null): void {
  writeFileSync(path.join(root, LOCK), JSON.stringify({ run, pid, pid_start: pidStart } satisfies LockRecord), { mode: 0o600 });
}

/** Releases the lock if `run` still holds it. */
export function releaseLock(root: string, run: string): void {
  const file = path.join(root, LOCK);
  const holder = readJson<LockRecord>(file);
  if (holder?.run === run) {
    try {
      unlinkSync(file);
    } catch {
      // Already gone.
    }
  }
}

/** The caller's run folder, or the no-such-run refusal for a malformed id, a missing folder, or another member's run. */
export function ownedRun(root: string, run: string, owner: string | null): { folder: string; record: RunRecord } {
  if (!RUN_ID.test(run)) throw new SecondOpinionNoSuchRunError(run);
  const folder = runFolder(root, run);
  const record = readRun(folder);
  if (record === null || record.owner !== owner) throw new SecondOpinionNoSuchRunError(run);
  return { folder, record };
}
