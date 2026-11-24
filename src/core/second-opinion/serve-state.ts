import { randomBytes } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { SecondOpinionUsageError } from '../errors.js';

/**
 * offer-the-second-opinion-on-its-own D9 (remote-access spec, *The
 * second-opinion server's sign-in survives a restart*): `ctxr serve` derives
 * its token-signing key from the GitHub App's private key. This server has no
 * App, and a random key per process would sign every member out at each
 * restart. So it keeps a 32-byte key in a file under its state directory,
 * made on first start for its own user alone, and refuses to start when the
 * file or the directory is open to anyone else. Deleting the file signs
 * everyone out.
 *
 * A model CLI the server starts runs in a fresh home under Landlock rules
 * that name the system paths, its own install and its scratch folder, never
 * this directory, so it cannot read the key.
 */
export const SIGNING_KEY_FILE = 'signing-key';
const KEY_BYTES = 32;

/** `--state-dir`, else `$XDG_STATE_HOME/ctxr/second-opinion-serve`, else `~/.local/state/ctxr/second-opinion-serve`. */
export function stateDirectory(flag: string | undefined, env: Readonly<Record<string, string | undefined>>, cwd: string): string {
  if (flag !== undefined && flag !== '') return path.resolve(cwd, flag);
  const base = env.XDG_STATE_HOME || path.join(env.HOME || homedir(), '.local', 'state');
  return path.join(base, 'ctxr', 'second-opinion-serve');
}

function ownOnly(target: string, kind: 'directory' | 'file'): void {
  const info = lstatSync(target);
  if (info.isSymbolicLink() || (kind === 'directory' ? !info.isDirectory() : !info.isFile())) throw new SecondOpinionUsageError(`${target} is not a ${kind}; the server keeps its signing key in a ${kind} of its own`, { path: target });
  if (typeof process.getuid === 'function' && info.uid !== process.getuid()) throw new SecondOpinionUsageError(`${target} belongs to another user; the signing key is for the server's own user alone`, { path: target });
  if ((info.mode & 0o077) !== 0) {
    throw new SecondOpinionUsageError(`${target} can be read by other users (mode ${(info.mode & 0o777).toString(8)}); run chmod ${kind === 'directory' ? '700' : '600'} on it, or remove it to sign everyone out and start with a new key`, { path: target });
  }
}

/** The signing key in `dir`, made on first start. Throws a usage error, naming the path, when it is not the server's alone. */
export function signingKey(dir: string): Buffer {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  ownOnly(dir, 'directory');
  const file = path.join(dir, SIGNING_KEY_FILE);
  try {
    writeFileSync(file, randomBytes(KEY_BYTES), { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw new SecondOpinionUsageError(`${file} cannot be written (${(err as NodeJS.ErrnoException).code ?? String(err)})`, { path: file });
  }
  ownOnly(file, 'file');
  const key = readFileSync(file);
  if (key.length !== KEY_BYTES) throw new SecondOpinionUsageError(`${file} does not hold a ${KEY_BYTES}-byte key; remove it to sign everyone out and start with a new one`, { path: file });
  return key;
}
