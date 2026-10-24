import path from 'node:path';
import { ContextureError } from '../errors.js';
import { isUnderPrefix } from '../fs/prefix.js';
import { resolveSession, type SessionRef } from '../session/resolve.js';
import { ToolRefusal } from './jsonrpc.js';
import { Ownership, type OwnedEntry, type OwnedKind } from './ownership.js';
import type { WriteDeps } from './sessions.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D1, D3: a member's sessions, as the
 * tools address them. A session argument is the worktree's directory name; a
 * file path addresses it by its store-relative root — the real worktree path,
 * which can never collide with a note because the worktrees path is never
 * enumerated. Anyone else's session, and any session not started over MCP,
 * answers exactly as one that does not exist.
 */

export interface MemberSession {
  /** The worktree's directory name. */
  name: string;
  ref: SessionRef;
  /** The session's store root, store-relative, with a trailing `/`: what file paths into it start with. */
  root: string;
  kind: OwnedKind;
  started_at: string | null;
}

export async function repoPrefixOf(write: WriteDeps): Promise<string> {
  return write.repoPrefix ?? (await write.git.run(['rev-parse', '--show-prefix'], { cwd: write.canonicalRoot, allowFailure: true })).stdout.trim();
}

export function ownershipOf(write: WriteDeps): Ownership {
  return new Ownership(write.canonicalRoot, write.config);
}

function worktreesPrefix(write: WriteDeps): string {
  return write.config.session.worktrees_path.replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

export async function sessionRootFor(write: WriteDeps, name: string): Promise<string> {
  return `${path.posix.join(worktreesPrefix(write), name, await repoPrefixOf(write))}/`.replace(/\/+$/, '/');
}

async function resolveOwned(write: WriteDeps, entry: OwnedEntry): Promise<MemberSession | null> {
  let ref: SessionRef;
  try {
    ref = await resolveSession(write.git, write.canonicalRoot, write.config, entry.name, write.canonicalRoot);
  } catch (err) {
    if (err instanceof ContextureError) return null;
    throw err;
  }
  return { name: entry.name, ref, root: await sessionRootFor(write, entry.name), kind: entry.record.kind, started_at: entry.record.started_at };
}

/** The member's sessions that still resolve as sessions, by directory name. */
export async function memberSessions(write: WriteDeps, email: string): Promise<MemberSession[]> {
  const found: MemberSession[] = [];
  for (const entry of await ownershipOf(write).ownedBy(email)) {
    const session = await resolveOwned(write, entry);
    if (session !== null) found.push(session);
  }
  return found;
}

/** One of the member's sessions by directory name, resolving only that one; null when it is not theirs. */
async function findOwned(write: WriteDeps, email: string, name: string): Promise<MemberSession | null> {
  const entry = (await ownershipOf(write).ownedBy(email)).find((e) => e.name === name);
  return entry === undefined ? null : resolveOwned(write, entry);
}

/** D1: the refusal for a write outside every session, or a session that is not the member's, naming the way in. */
export function noSessionRefusal(message: string, sessions: readonly MemberSession[]): ToolRefusal {
  const open = sessions.filter((s) => s.kind === 'session');
  const listed = open.length === 0 ? 'You have no open sessions.' : `Your open sessions: ${open.map((s) => `${s.name} (root ${s.root})`).join('; ')}.`;
  return new ToolRefusal('mcp.no_session', `${message} Call session_start to start a session, then address files under the root it returns. ${listed}`, {
    sessions: open.map((s) => ({ session: s.name, root: s.root })),
  });
}

/** One of the member's sessions by directory name; refused as `mcp.no_session` for anything else. */
export async function ownedSession(write: WriteDeps, email: string, name: unknown): Promise<MemberSession> {
  if (typeof name !== 'string' || name.trim() === '') throw new ToolRefusal('mcp.invalid_arguments', '"session" is required: the directory name session_list or session_start gave.');
  const session = await findOwned(write, email, name.trim());
  if (session === null) throw noSessionRefusal(`You have no session named "${name}".`, await memberSessions(write, email));
  return session;
}

export type LocatedPath = { kind: 'view'; rel: string } | { kind: 'session'; session: MemberSession; rel: string } | { kind: 'foreign' };

/**
 * D1: where a normalized store-relative path points. Under one of the
 * member's session roots it is that session's working tree, `rel` inside it;
 * elsewhere under the worktrees path it is someone else's (or nobody's) and is
 * `foreign`; anywhere else it is the served commit.
 */
export async function locatePath(write: WriteDeps, email: string, rel: string): Promise<LocatedPath> {
  const prefix = worktreesPrefix(write);
  if (!isUnderPrefix(rel, prefix)) return { kind: 'view', rel };
  const rest = rel.slice(prefix.length).replace(/^\/+/, '');
  const name = rest.split('/')[0] ?? '';
  if (name === '') return { kind: 'foreign' };
  const session = await findOwned(write, email, name);
  if (session === null) return { kind: 'foreign' };
  const root = session.root.replace(/\/+$/, '');
  if (rel !== root && !rel.startsWith(`${root}/`)) return { kind: 'foreign' };
  return { kind: 'session', session, rel: rel === root ? '' : rel.slice(root.length + 1) };
}
