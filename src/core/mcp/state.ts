import { createHash, randomBytes, randomInt } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { ExitCode } from '../exit-codes.js';
import { ContextureError } from '../errors.js';

/**
 * serve-the-store-over-mcp design.md D9: everything the remote surface keeps
 * lives in one directory outside the store, and only the member CLI writes
 * it. `members.json` is the member list (single writer: `ctxr mcp member`);
 * `signing.key` is created once, by whichever command runs first, with an
 * exclusive create; `worktrees/` holds capture worktrees for the length of
 * one capture. The server persists nothing (D3).
 */

/** The two scopes a member can hold (design.md D4). `read` reaches `find`/`gather`; `capture` reaches `capture`. */
export const MCP_SCOPES = ['read', 'capture'] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MEMBERS_FILE = 'members.json';
export const SIGNING_KEY_FILE = 'signing.key';
export const WORKTREES_DIR = 'worktrees';

export interface Member {
  /** Random, never reused — re-adding a name mints a new id, so nothing issued to the old one revives. */
  id: string;
  name: string;
  email?: string;
  scopes: McpScope[];
  /** SHA-256 of the normalized access code. The code itself is never stored. */
  code_sha256: string;
  created: string;
}

export interface MembersFile {
  version: 1;
  members: Member[];
}

function stateError(code: string, message: string, subject?: string): ContextureError {
  return new ContextureError(ExitCode.Usage, { code, severity: 'error', message, ...(subject ? { subject } : {}) });
}

function realOrResolved(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The default is keyed by the store root, so two stores on one host never
 * share a member list. A directory inside the store is refused outright:
 * the member list holds code hashes and the signing key signs every token,
 * and neither may ever be one `git add` away from the repository.
 */
export function resolveStateDir(storeRoot: string, home: string | undefined, flag: string | undefined, cwd: string): string {
  let dir: string;
  if (flag !== undefined) {
    dir = path.resolve(cwd, flag);
  } else {
    if (home === undefined || home.length === 0) {
      throw stateError('mcp.state_dir_unresolved', 'No home directory to put MCP state under; pass --state-dir.');
    }
    const key = createHash('sha256').update(realOrResolved(storeRoot)).digest('hex').slice(0, 12);
    dir = path.join(home, '.contexture', 'mcp', key);
  }
  if (isWithin(realOrResolved(dir), realOrResolved(storeRoot)) || isWithin(path.resolve(dir), path.resolve(storeRoot))) {
    throw stateError(
      'mcp.state_dir_inside_store',
      `The MCP state directory "${dir}" is inside the store root; it holds access-code hashes and the signing key, so it must live outside the repository.`,
      dir,
    );
  }
  return dir;
}

export async function ensureStateDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
}

export async function readMembers(dir: string): Promise<MembersFile> {
  let text: string;
  try {
    text = await readFile(path.join(dir, MEMBERS_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, members: [] };
    throw err;
  }
  const parsed = JSON.parse(text) as MembersFile;
  if (parsed.version !== 1 || !Array.isArray(parsed.members)) {
    throw stateError('mcp.members_file_invalid', `"${path.join(dir, MEMBERS_FILE)}" is not a members file this release can read.`);
  }
  return parsed;
}

/** Write-then-rename, so a server reading mid-write sees the old list or the new one, never half of either. */
export async function writeMembers(dir: string, file: MembersFile): Promise<void> {
  const target = path.join(dir, MEMBERS_FILE);
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, target);
}

/** 32 random bytes, created exclusively so the member CLI and a starting server can never both write it. */
export async function loadSigningKey(dir: string): Promise<Buffer> {
  const keyPath = path.join(dir, SIGNING_KEY_FILE);
  try {
    const handle = await open(keyPath, 'wx', 0o600);
    try {
      const key = randomBytes(32);
      await handle.writeFile(key);
      return key;
    } finally {
      await handle.close();
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  const key = await readFile(keyPath);
  if (key.length !== 32) {
    throw stateError('mcp.signing_key_invalid', `"${keyPath}" is not a 32-byte signing key; delete it to sign everyone out and mint a new one.`, keyPath);
  }
  return key;
}

/** Crockford base32: no I, L, O or U, so a code read aloud or retyped from a phone survives. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_GROUPS = 5;
const CODE_GROUP_LENGTH = 4;

/** Twenty symbols of five bits each: 100 bits, shown as `XXXX-XXXX-XXXX-XXXX-XXXX`. */
export function generateAccessCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < CODE_GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < CODE_GROUP_LENGTH; i += 1) group += CROCKFORD[randomInt(CROCKFORD.length)];
    groups.push(group);
  }
  return groups.join('-');
}

/** Case-, space- and hyphen-insensitive, with Crockford's look-alike folding (I/L → 1, O → 0). */
export function normalizeAccessCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
}

export function hashAccessCode(input: string): string {
  return createHash('sha256').update(normalizeAccessCode(input)).digest('hex');
}

export function newMemberId(): string {
  return randomBytes(12).toString('hex');
}

export function parseScopes(list: string): McpScope[] {
  const requested = list
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (requested.length === 0) throw stateError('mcp.scope_empty', `Name at least one scope (${MCP_SCOPES.join(', ')}).`);
  const unknown = requested.filter((s) => !(MCP_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) {
    throw stateError('mcp.scope_unknown', `Unknown scope(s) ${unknown.map((s) => `"${s}"`).join(', ')}; the scopes are ${MCP_SCOPES.join(', ')}.`);
  }
  return MCP_SCOPES.filter((s) => requested.includes(s));
}

/**
 * The server's view of `members.json`: re-read whenever the file's mtime or
 * size changes, so `ctxr mcp member remove` takes effect on the very next
 * call without restarting the server (design.md D4, D9).
 */
export class MemberRegistry {
  private signature = '';
  private members: Member[] = [];

  constructor(private readonly dir: string) {}

  private async refresh(): Promise<void> {
    let current: string;
    try {
      const info = await stat(path.join(this.dir, MEMBERS_FILE));
      current = `${info.mtimeMs}:${info.size}:${info.ino}`;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      current = 'absent';
    }
    if (current === this.signature) return;
    this.members = current === 'absent' ? [] : (await readMembers(this.dir)).members;
    this.signature = current;
  }

  async byId(id: string): Promise<Member | undefined> {
    await this.refresh();
    return this.members.find((m) => m.id === id);
  }

  async byCode(code: string): Promise<Member | undefined> {
    await this.refresh();
    const hash = hashAccessCode(code);
    return this.members.find((m) => m.code_sha256 === hash);
  }

  async count(): Promise<number> {
    await this.refresh();
    return this.members.length;
  }
}
