import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SecondOpinionSchema } from '../../src/config/schema.js';
import { SecondOpinionBusyError } from '../../src/core/errors.js';
import {
  newRunId,
  ownedRun,
  processStart,
  releaseLock,
  RUN_LIFETIME_MS,
  runFolder,
  runsRoot,
  stateOf,
  sweep,
  takeLock,
  writeResult,
  writeRun,
  type RunRecord,
} from '../../src/core/second-opinion/runs.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * second-opinion-start-and-fetch D2, D4 and Revisions after critique 1: the
 * run folders, the one-run-per-user lock, its takeover from a dead holder, and
 * the sweep that removes a run an hour after it ends.
 */
let tmp: TmpDir;
let savedTmpdir: string | undefined;

beforeEach(async () => {
  tmp = await makeTmpDir('second-opinion-runs-');
  savedTmpdir = process.env.TMPDIR;
  process.env.TMPDIR = tmp.root;
});
afterEach(async () => {
  if (savedTmpdir === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = savedTmpdir;
  await tmp.cleanup();
});

/** A pid that has certainly exited. */
function deadPid(): number {
  return spawnSync(process.execPath, ['-e', '']).pid!;
}

function record(run: string, over: Partial<RunRecord> = {}): RunRecord {
  return { run, mode: 'critique', owner: null, started_at: new Date().toISOString(), pid: null, pid_start: null, lineup: SecondOpinionSchema.parse({}), argv: [], ...over };
}

function makeRun(root: string, over: Partial<RunRecord> = {}): { run: string; folder: string } {
  const run = newRunId();
  const folder = runFolder(root, run);
  mkdirSync(folder, { mode: 0o700 });
  writeRun(folder, record(run, over));
  return { run, folder };
}

const lockFile = (root: string) => path.join(root, '.lock');

describe('the runs folder', () => {
  it('is private to the user, and refused when others can read it', () => {
    const root = runsRoot();
    expect(path.dirname(root)).toBe(tmp.root);
    expect(spawnSync('stat', ['-c', '%a', root], { encoding: 'utf8' }).stdout.trim()).toBe('700');
    chmodSync(root, 0o755);
    expect(() => runsRoot()).toThrow(/can be read by other users/);
  });

  it('names each run with 26 base32 characters, never the same twice', () => {
    const ids = new Set(Array.from({ length: 200 }, newRunId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[a-z2-7]{26}$/);
  });

  it('refuses a malformed id, a missing run, and another owner’s run alike', () => {
    const root = runsRoot();
    const { run } = makeRun(root, { owner: 'a@example.com' });
    expect(() => ownedRun(root, '../etc', null)).toThrow(/No second-opinion run/);
    expect(() => ownedRun(root, newRunId(), null)).toThrow(/No second-opinion run/);
    expect(() => ownedRun(root, run, 'b@example.com')).toThrow(/No second-opinion run/);
    expect(ownedRun(root, run, 'a@example.com').record.owner).toBe('a@example.com');
  });
});

describe('the lock', () => {
  it('refuses a second run while a live holder has it, naming the run only to its owner', () => {
    const root = runsRoot();
    const { run } = makeRun(root, { owner: 'a@example.com' });
    takeLock(root, run, 'a@example.com');
    const busy = (owner: string | null) => {
      try {
        takeLock(root, newRunId(), owner);
      } catch (err) {
        return err as SecondOpinionBusyError;
      }
      throw new Error('expected busy');
    };
    expect(busy('a@example.com').finding.details).toEqual({ run });
    expect(busy('b@example.com').finding.details).toEqual({});
    expect(busy(null).finding.message).not.toContain(run);
  });

  it('takes over a lock whose holder has exited', () => {
    const root = runsRoot();
    writeFileSync(lockFile(root), JSON.stringify({ run: newRunId(), pid: deadPid(), pid_start: null }));
    const run = newRunId();
    takeLock(root, run, null);
    expect(JSON.parse(readFileSync(lockFile(root), 'utf8')).run).toBe(run);
  });

  it('takes over a lock whose pid now belongs to another process', () => {
    const root = runsRoot();
    writeFileSync(lockFile(root), JSON.stringify({ run: newRunId(), pid: process.pid, pid_start: 'not-this-process' }));
    if (processStart(process.pid) === null) return; // No /proc: only the pid is checked, a documented weakness.
    const run = newRunId();
    takeLock(root, run, null);
    expect(JSON.parse(readFileSync(lockFile(root), 'utf8')).run).toBe(run);
  });

  it('is released only by the run that holds it', () => {
    const root = runsRoot();
    const run = newRunId();
    takeLock(root, run, null);
    releaseLock(root, newRunId());
    expect(existsSync(lockFile(root))).toBe(true);
    releaseLock(root, run);
    expect(existsSync(lockFile(root))).toBe(false);
  });

  it('lets exactly one of several simultaneous starters take over a stale lock', async () => {
    const root = runsRoot();
    writeFileSync(lockFile(root), JSON.stringify({ run: newRunId(), pid: deadPid(), pid_start: null }));
    const runsModule = path.resolve(import.meta.dirname, '../../dist/core/second-opinion/runs.js');
    // Each starter waits for a shared start time, tries once, reports, then stays alive so its lock stays live.
    const at = Date.now() + 4000;
    const script = `
      const { takeLock } = await import(${JSON.stringify(runsModule)});
      while (Date.now() < ${at}) {}
      let out = 'ok';
      try { takeLock(${JSON.stringify(root)}, process.argv[1], null); } catch (e) { out = 'busy'; }
      process.stdout.write(out);
      setTimeout(() => {}, 15000);
    `;
    const children: ReturnType<typeof spawn>[] = [];
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        new Promise<string>((resolve) => {
          const child = spawn(process.execPath, ['--input-type=module', '--eval', script, `starter${String(i).padStart(21, 'a')}`], { env: { ...process.env, TMPDIR: tmp.root } });
          let out = '';
          // Each starter reports, then is killed: it holds its lock live until every starter has tried.
          child.stdout.on('data', (d) => {
            out += d;
            resolve(out);
          });
          children.push(child);
        }),
      ),
    );
    for (const child of children) child.kill('SIGKILL');
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'busy')).toHaveLength(7);
  }, 60_000);
});

describe('state and the sweep', () => {
  it('reports a run whose process is gone and left no result as stopped, and stamps it', () => {
    const root = runsRoot();
    const { folder } = makeRun(root, { pid: deadPid(), pid_start: null });
    const rec = JSON.parse(readFileSync(path.join(folder, 'run.json'), 'utf8'));
    expect(stateOf(folder, rec)).toBe('stopped');
    expect(JSON.parse(readFileSync(path.join(folder, 'run.json'), 'utf8')).stopped_at).toBeTypeOf('string');
  });

  it('reports a run with a result as finished even after its process has exited', () => {
    const root = runsRoot();
    const { folder } = makeRun(root, { pid: deadPid(), pid_start: null });
    writeResult(folder, { exit_code: 0, human: 'done', data: null, finished_at: new Date().toISOString() });
    expect(stateOf(folder, JSON.parse(readFileSync(path.join(folder, 'run.json'), 'utf8')))).toBe('finished');
  });

  it('treats a run with no recorded child as starting for a minute, then as stopped', () => {
    const root = runsRoot();
    const fresh = makeRun(root);
    const old = makeRun(root, { started_at: new Date(Date.now() - 120_000).toISOString() });
    expect(stateOf(fresh.folder, record(fresh.run))).toBe('running');
    expect(stateOf(old.folder, record(old.run, { started_at: new Date(Date.now() - 120_000).toISOString() }))).toBe('stopped');
  });

  it('removes a run an hour after it finished or stopped, and keeps a recent or running one', () => {
    const root = runsRoot();
    const longAgo = new Date(Date.now() - RUN_LIFETIME_MS - 60_000).toISOString();
    const finishedOld = makeRun(root, { pid: deadPid() });
    writeResult(finishedOld.folder, { exit_code: 0, human: '', data: null, finished_at: longAgo });
    const finishedNew = makeRun(root, { pid: deadPid() });
    writeResult(finishedNew.folder, { exit_code: 0, human: '', data: null, finished_at: new Date().toISOString() });
    const stoppedOld = makeRun(root, { pid: deadPid(), stopped_at: longAgo });
    const running = makeRun(root, { pid: process.pid, pid_start: processStart(process.pid), started_at: longAgo });
    sweep(root);
    expect(existsSync(finishedOld.folder)).toBe(false);
    expect(existsSync(stoppedOld.folder)).toBe(false);
    expect(existsSync(finishedNew.folder)).toBe(true);
    expect(existsSync(running.folder)).toBe(true);
  });
});
