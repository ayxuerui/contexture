import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, readSync, closeSync, realpathSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * serve-the-second-opinion-to-chat-apps D1: each model CLI runs from a fresh
 * folder that is its `HOME` and its working directory, seeded with a copy of
 * its own login and nothing else, and wrapped in `setpriv`'s Landlock rules so
 * the kernel lets it read only the system paths, its own install directory and
 * that folder. Landlock needs no privilege and no user namespace, which
 * Docker's default seccomp profile refuses; `setpriv` has it from util-linux
 * 2.40. Where it is missing the run stays as before and says so.
 */

/** Whether runs on this machine can be confined, and if not, why. */
export type Confinement = { confined: true; setpriv: string } | { confined: false; reason: string };

/** What one confined run needs beyond its argument vector. */
export interface ConfinedRun {
  setpriv: string;
  /** The real home the logins are copied from and back to. */
  sourceHome: string;
  /** The CLI's login files, relative to a home. */
  logins: readonly string[];
  /** How many directories above the binary's own the install directory is; 0 allows the binary file alone. */
  installLevels: number;
}

const DIR_READ = 'execute,read-file,read-dir';
const FILE_READ = 'execute,read-file';
const DEVICE = 'read-file,write-file';
const DIR_ALL = 'execute,write-file,read-file,read-dir,remove-dir,remove-file,make-char,make-dir,make-reg,make-sock,make-fifo,make-block,make-sym,refer,truncate';

/** What any program needs to start, resolve a host and verify TLS: read-only, and only where present. */
const SYSTEM_READ = [
  '/usr',
  '/lib',
  '/lib32',
  '/lib64',
  '/libx32',
  '/bin',
  '/sbin',
  '/proc',
  '/etc/ssl',
  '/etc/ca-certificates',
  '/etc/pki',
  '/etc/alternatives',
  '/etc/resolv.conf',
  '/etc/hosts',
  '/etc/host.conf',
  '/etc/nsswitch.conf',
  '/etc/gai.conf',
  '/etc/passwd',
  '/etc/group',
  '/etc/localtime',
];
const DEVICES = ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom'];

/** The executable a bare command name resolves to on a search path, or null. */
export function onPath(cmd: string, searchPath: string | undefined): string | null {
  for (const dir of (searchPath ?? '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, cmd);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not here
    }
  }
  return null;
}

/** A `#!` script's interpreter, resolved through `env` when the script names it that way. */
function interpreterOf(file: string, searchPath: string | undefined): string | null {
  const buf = Buffer.alloc(256);
  let n = 0;
  try {
    const fd = openSync(file, 'r');
    try {
      n = readSync(fd, buf, 0, buf.length, 0);
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
  const head = buf.subarray(0, n).toString('utf8');
  if (!head.startsWith('#!')) return null;
  const words = head.slice(2).split('\n')[0]!.trim().split(/\s+/);
  if (words[0] === undefined) return null;
  if (path.basename(words[0]) !== 'env') return words[0];
  const name = words.slice(1).find((w) => !w.startsWith('-'));
  return name === undefined ? null : onPath(name, searchPath);
}

function rule(file: string, dirRights: string, fileRights: string): string[] {
  try {
    const rights = statSync(file).isDirectory() ? dirRights : fileRights;
    return ['--landlock-rule', `path-beneath:${rights}:${file}`];
  } catch {
    return [];
  }
}

/** The directory `levels - 1` above the binary's own, or the binary itself at 0. */
function installRoot(binary: string, levels: number): string {
  let root = levels === 0 ? binary : path.dirname(binary);
  for (let i = 1; i < levels; i++) root = path.dirname(root);
  return root;
}

/**
 * `setpriv`'s arguments, ending in the binary and its own: the system paths
 * and the install directory readable, the folder fully usable, nothing else.
 */
export function landlockArgs(binary: string, args: readonly string[], folder: string, run: ConfinedRun, env: Record<string, string>): string[] {
  const real = realpathSync(binary);
  const readable = [...SYSTEM_READ, installRoot(real, run.installLevels)];
  const interpreter = interpreterOf(real, env.PATH);
  if (interpreter !== null) readable.push(realpathSync(interpreter));
  if (env.NODE_EXTRA_CA_CERTS) readable.push(env.NODE_EXTRA_CA_CERTS);
  return [
    '--landlock-access',
    'fs',
    ...readable.flatMap((p) => rule(p, DIR_READ, FILE_READ)),
    ...DEVICES.flatMap((p) => rule(p, DEVICE, DEVICE)),
    ...rule(folder, DIR_ALL, DIR_ALL),
    '--',
    binary,
    ...args,
  ];
}

const hashOf = (file: string): string | null => {
  try {
    return createHash('sha256').update(readFileSync(file)).digest('hex');
  } catch {
    return null;
  }
};

export interface SeededLogin {
  source: string;
  copy: string;
  sourceHash: string;
}

/** Copies each login present in the real home into the folder, recording what was copied. */
export function seedLogins(run: ConfinedRun, folder: string): SeededLogin[] {
  const seeded: SeededLogin[] = [];
  for (const rel of run.logins) {
    const source = path.join(run.sourceHome, rel);
    const sourceHash = hashOf(source);
    if (sourceHash === null) continue;
    const copy = path.join(folder, rel);
    mkdirSync(path.dirname(copy), { recursive: true, mode: 0o700 });
    copyFileSync(source, copy);
    chmodSync(copy, 0o600);
    seeded.push({ source, copy, sourceHash });
  }
  return seeded;
}

/**
 * A login the run refreshed goes back over the original, unless the original
 * changed meanwhile: Codex rotates its refresh token, so dropping the copy
 * would break the real login, and overwriting a newer original would too.
 */
export function returnLogins(seeded: readonly SeededLogin[]): void {
  for (const login of seeded) {
    const copyHash = hashOf(login.copy);
    if (copyHash === null || copyHash === login.sourceHash) continue;
    if (hashOf(login.source) !== login.sourceHash) continue;
    const staged = `${login.source}.ctxr-${process.pid}`;
    copyFileSync(login.copy, staged);
    chmodSync(staged, 0o600);
    renameSync(staged, login.source);
  }
}

/** The fresh folder's environment: it is the home, and temporary files stay inside it. */
export function confinedEnv(env: Record<string, string>, folder: string): Record<string, string> {
  const tmp = path.join(folder, '.tmp');
  if (!existsSync(tmp)) mkdirSync(tmp, { mode: 0o700 });
  return { ...env, HOME: folder, TMPDIR: tmp };
}
