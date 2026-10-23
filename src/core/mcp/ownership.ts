import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { writeFileAtomic } from '../fs/atomic.js';
import { listSessionWorktreeDirs, sessionLabelFromDirName } from '../session.js';
import { slugifySegment } from '../slug.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D3 (remote-access spec, *A member
 * works in named sessions of their own*): who started each session over MCP.
 * One JSON file under the canonical checkout's derived cache, keyed by the
 * worktree's directory name, written atomically and only under the surface's
 * write mutex. A record whose worktree is gone — landed, or discarded locally —
 * is dropped on read, and the next write persists the drop. Sessions started
 * locally have no record and are never visible over MCP.
 *
 * A worktree left by the per-member draft of `2026-10-23-serve-the-store-over-mcp`
 * carries no record; it is adopted for the member whose email its label was
 * derived from, so its pull request stays the member's to answer.
 */

export const OWNERSHIP_VERSION = 1;
/** D3: the open sessions a member may hold from `session_start`; a capture's session does not count (revision 8). */
export const MAX_OPEN_SESSIONS = 20;
const DRAFT_LABEL_PREFIX = 'mcp-draft-';

export type OwnedKind = 'session' | 'capture';

export interface OwnershipRecord {
  owner: string;
  kind: OwnedKind;
  /** ISO time; null for an adopted draft, whose start was never recorded. */
  started_at: string | null;
}

interface OwnershipFile {
  version: number;
  sessions: Record<string, OwnershipRecord>;
}

/** The ownership record's path under the canonical checkout, beside the read view. */
export function ownershipFile(canonicalRoot: string): string {
  return path.join(canonicalRoot, '.contexture', 'cache', 'mcp', 'sessions.json');
}

/** The label the earlier per-member draft carried: `mcp-draft-<local part>-<8 hex of the email>`. */
export function draftLabel(email: string): string {
  const local = slugifySegment(email.split('@')[0] ?? 'member').slice(0, 20).replace(/-+$/, '') || 'member';
  const digest = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8);
  return `${DRAFT_LABEL_PREFIX}${local}-${digest}`;
}

export interface OwnedEntry {
  /** The worktree's directory name. */
  name: string;
  record: OwnershipRecord;
}

export class Ownership {
  constructor(
    private readonly canonicalRoot: string,
    private readonly config: StoreConfig,
  ) {}

  private worktreeExists(name: string): boolean {
    return existsSync(path.join(this.canonicalRoot, this.config.session.worktrees_path, name));
  }

  /** Every record whose worktree still exists. */
  async read(): Promise<Record<string, OwnershipRecord>> {
    let parsed: OwnershipFile | null = null;
    try {
      parsed = JSON.parse(await readFile(ownershipFile(this.canonicalRoot), 'utf8')) as OwnershipFile;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT' && !(err instanceof SyntaxError)) throw err;
    }
    const sessions: Record<string, OwnershipRecord> = {};
    for (const [name, record] of Object.entries(parsed?.sessions ?? {})) {
      if (typeof record?.owner === 'string' && this.worktreeExists(name)) sessions[name] = record;
    }
    return sessions;
  }

  private async persist(sessions: Record<string, OwnershipRecord>): Promise<void> {
    const file = ownershipFile(this.canonicalRoot);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, `${JSON.stringify({ version: OWNERSHIP_VERSION, sessions } satisfies OwnershipFile, null, 2)}\n`);
  }

  /** Under the write mutex. */
  async record(name: string, record: OwnershipRecord): Promise<void> {
    const sessions = await this.read();
    sessions[name] = { ...record, owner: record.owner.toLowerCase() };
    await this.persist(sessions);
  }

  /** Under the write mutex. */
  async forget(name: string): Promise<void> {
    const sessions = await this.read();
    delete sessions[name];
    await this.persist(sessions);
  }

  /** The member's sessions on disk, recorded or adopted, by directory name. */
  async ownedBy(email: string): Promise<OwnedEntry[]> {
    const who = email.toLowerCase();
    const sessions = await this.read();
    const owned: OwnedEntry[] = Object.entries(sessions)
      .filter(([, record]) => record.owner === who)
      .map(([name, record]) => ({ name, record }));
    const draft = draftLabel(who);
    for (const name of await listSessionWorktreeDirs(this.canonicalRoot, this.config)) {
      if (sessions[name] === undefined && sessionLabelFromDirName(this.config, name) === draft) owned.push({ name, record: { owner: who, kind: 'session', started_at: null } });
    }
    return owned.sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  /** Every capture session on disk, whoever started it. */
  async captures(): Promise<OwnedEntry[]> {
    return Object.entries(await this.read())
      .filter(([, record]) => record.kind === 'capture')
      .map(([name, record]) => ({ name, record }))
      .sort((a, b) => (a.name < b.name ? -1 : 1));
  }
}
