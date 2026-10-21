import { hostname } from 'node:os';
import { open, readFile, stat, unlink } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';
import path from 'node:path';
import type { GitRunner } from './exec.js';

/**
 * write-lifecycle spec ("One landing runs per repository at a time";
 * serve-lands-approved-changes D4): an exclusive pid file in the repository's
 * common git directory, which every worktree and every container mounting the
 * store shares — the same shape git uses for `index.lock`.
 *
 * Stale when its process is gone. Only the host that wrote it can tell, so a
 * lock from another host (another container) is stale only once it is older
 * than any landing run could be.
 */
export const LAND_LOCK_FILE = 'ctxr-land.lock';
const FOREIGN_STALE_MS = 2 * 60 * 60 * 1000;

export interface LockHolder {
  pid: number;
  host: string;
}

export type LockResult = { acquired: true; release(): Promise<void> } | { acquired: false; holder: LockHolder };

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readHolder(file: string): Promise<LockHolder | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<LockHolder>;
    return typeof parsed.pid === 'number' && typeof parsed.host === 'string' ? { pid: parsed.pid, host: parsed.host } : null;
  } catch {
    return null;
  }
}

async function stale(file: string, holder: LockHolder | null, now: number): Promise<boolean> {
  if (holder !== null && holder.host === hostname()) return !alive(holder.pid);
  try {
    return now - (await stat(file)).mtimeMs > FOREIGN_STALE_MS;
  } catch {
    return true;
  }
}

export async function acquireLandLock(git: GitRunner, cwd: string, now: () => number = Date.now): Promise<LockResult> {
  const common = (await git.run(['rev-parse', '--git-common-dir'], { cwd })).stdout.trim();
  const file = path.join(path.resolve(cwd, common), LAND_LOCK_FILE);
  const me: LockHolder = { pid: process.pid, host: hostname() };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(file, 'wx');
      await handle.writeFile(JSON.stringify(me));
      await handle.close();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const holder = await readHolder(file);
      if (attempt === 0 && (await stale(file, holder, now()))) {
        await unlink(file).catch(() => undefined);
        continue;
      }
      return { acquired: false, holder: holder ?? { pid: 0, host: 'unknown' } };
    }

    // A landing stopped by its parent (serve shutting down) must not leave the lock behind.
    const onSignal = (signal: NodeJS.Signals): void => {
      try {
        unlinkSync(file);
      } catch {
        // already gone
      }
      process.exit(signal === 'SIGINT' ? 130 : 143);
    };
    process.once('SIGTERM', onSignal);
    process.once('SIGINT', onSignal);
    return {
      acquired: true,
      async release() {
        process.off('SIGTERM', onSignal);
        process.off('SIGINT', onSignal);
        const holder = await readHolder(file);
        if (holder?.pid === me.pid && holder.host === me.host) await unlink(file).catch(() => undefined);
      },
    };
  }
  return { acquired: false, holder: { pid: 0, host: 'unknown' } };
}
