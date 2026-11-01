import { lstat, mkdir, mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';
import type { GitRunner } from './exec.js';

/**
 * serve-keeps-its-clone-current (D12, write-lifecycle spec "Git run for
 * landing and syncing ignores the repository's own hooks and drivers"): the
 * one place that decides which repository configuration git may not act on
 * while `ctxr land`, `ctxr sync` and the store-update runner hold a forge
 * credential. `serve` shares its clone with the agent, so anything under
 * `.git/` may have been written by the agent.
 *
 * Every git command gets, ahead of its own arguments:
 *
 * - `core.hooksPath` set to an empty directory this process owns, so no hook
 *   in `.git/hooks` (or anywhere a repository points `core.hooksPath`) runs;
 * - `core.fsmonitor=false`, so no fsmonitor hook command runs;
 * - every `filter.<x>.clean`, `.smudge` and `.process`, every
 *   `diff.<x>.command` and `.textconv`, and every `merge.<x>.driver` the
 *   configuration declares, blanked — and each declared filter's `required`
 *   turned off, so a blanked filter checks files out as stored rather than
 *   failing the command.
 *
 * Command-line `-c` settings take precedence over every configuration file,
 * includes and `.git/config` among them. A declared key git cannot take as a
 * `-c` setting (a subsection containing `=`) makes git refuse the whole
 * command, which fails closed. This is defense in depth, not a guarantee:
 * git has other settings that run commands, and the design does not claim to
 * cover them all.
 */

/** The driver keys blanked on every command, matched against git's canonical (lowercased) key names. */
const DRIVER_KEYS = '^(filter\\..+\\.(clean|smudge|process)|diff\\..+\\.(command|textconv)|merge\\..+\\.driver)$';

let emptyDir: Promise<string> | null = null;

async function isOwnEmptyDirectory(dir: string, uid: number): Promise<boolean> {
  try {
    const info = await lstat(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) return false;
    if (uid >= 0 && info.uid !== uid) return false;
    return (await readdir(dir)).length === 0;
  } catch {
    return false;
  }
}

/**
 * One empty directory per user, reused across runs so a timer that runs every
 * few minutes leaves nothing behind. When the fixed path is missing it is
 * created; when it is not an empty directory this user owns (someone else
 * made it, or wrote into it), a fresh private one is made instead.
 */
async function resolveEmptyHooksDir(): Promise<string> {
  let uid = -1;
  try {
    uid = userInfo().uid;
  } catch {
    // No user database entry: fall through with no owner check, then a fresh directory if needed.
  }
  const fixed = path.join(tmpdir(), `ctxr-no-hooks-${uid >= 0 ? uid : 'user'}`);
  try {
    await mkdir(fixed, { mode: 0o700 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') return mkdtemp(path.join(tmpdir(), 'ctxr-no-hooks-'));
  }
  if (await isOwnEmptyDirectory(fixed, uid)) return fixed;
  return mkdtemp(path.join(tmpdir(), 'ctxr-no-hooks-'));
}

export function emptyHooksDir(): Promise<string> {
  emptyDir ??= resolveEmptyHooksDir().catch((err: unknown) => {
    emptyDir = null;
    throw err;
  });
  return emptyDir;
}

/**
 * The `-c` arguments every hardened command carries, for a command run in
 * `cwd`. The declared drivers are read on every call, never cached, so a
 * driver written between two commands of one run is blanked too.
 */
export async function hardeningArgs(git: GitRunner, cwd: string, env?: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  const base = ['-c', `core.hooksPath=${await emptyHooksDir()}`, '-c', 'core.fsmonitor=false'];
  const declared = await git.run([...base, 'config', '--name-only', '--get-regexp', DRIVER_KEYS], {
    cwd,
    allowFailure: true,
    ...(env === undefined ? {} : { env }),
  });
  const blanks: string[] = [];
  const filters = new Set<string>();
  for (const key of declared.exitCode === 0 ? declared.stdout.split('\n').filter((line) => line !== '') : []) {
    blanks.push('-c', `${key}=`);
    if (key.startsWith('filter.')) filters.add(key.slice(0, key.lastIndexOf('.')));
  }
  for (const filter of filters) blanks.push('-c', `${filter}.required=false`);
  return [...base, ...blanks];
}

/**
 * A runner that hardens every command it runs. `leadingArgs` hands the same
 * arguments to code that spawns git outside `run` (`patchIds`), so those
 * commands are hardened too.
 */
export function hardenGit(git: GitRunner): GitRunner {
  if (git.hardened === true) return git;
  return {
    hardened: true,
    async run(args, opts) {
      // `git config` reads and writes configuration and runs no hook, driver or fsmonitor; left as is, it reports the
      // repository's own settings rather than these overrides (doctor's hooks check reads core.hooksPath this way).
      if (args[0] === 'config' && !args.includes('--edit') && !args.includes('-e')) return git.run(args, opts);
      const leading = await hardeningArgs(git, opts.cwd, opts.env);
      return git.run([...leading, ...args], opts);
    },
    leadingArgs: (cwd) => hardeningArgs(git, cwd),
  };
}
