import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { InvalidNoteFrontmatterError } from '../../errors.js';
import { admitsNotePath } from '../../notes/list.js';
import { parseNoteText } from '../../notes/parse.js';
import { rebaseInProgress } from '../../session/resolve.js';
import { ToolRefusal } from '../jsonrpc.js';
import { locatePath, memberSessions, noSessionRefusal, repoPrefixOf, type MemberSession } from '../member-sessions.js';
import { normalizeStorePath, protectedReason, protectedRefusal } from '../paths.js';
import type { WriteDeps } from '../sessions.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D1, D2, D5 (remote-access spec,
 * *`Edit`, `Write`, `Move` and `Delete` change a member's own session and
 * commit nothing*): Claude Code's Edit and Write, with their parameters
 * unchanged, plus `Move` and `Delete` for the `git mv` and `git rm` a local
 * agent runs. Each addresses a file under the root of a session the caller
 * owns and changes that session's working tree only; nothing commits,
 * pushes or opens a pull request until `session_submit`. Uncommitted rest
 * between calls is the session's normal state, as the lifecycle skill says.
 * The per-member draft these replaced is gone.
 */

export interface EditArgs {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface WriteArgs {
  file_path: string;
  content: string;
}

export interface MoveArgs {
  source_path: string;
  destination_path: string;
}

export interface DeleteArgs {
  file_path: string;
}

const PATH_HINT = 'under the session root session_start returned, e.g. "<root>projects/kestrel.md"';

export const EDIT_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: `The file to modify, ${PATH_HINT}.` },
    old_string: { type: 'string', description: 'The text to replace' },
    new_string: { type: 'string', description: 'The text to replace it with (must be different from old_string)' },
    replace_all: { type: 'boolean', description: 'Replace all occurrences of old_string (default false)' },
  },
  required: ['file_path', 'old_string', 'new_string'],
} as const;

export const WRITE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: `The new file to create, ${PATH_HINT}.` },
    content: { type: 'string', description: 'The content to write to the file' },
  },
  required: ['file_path', 'content'],
} as const;

export const MOVE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    source_path: { type: 'string', description: `The file to move, ${PATH_HINT}.` },
    destination_path: { type: 'string', description: 'Where it goes, under the same session root. Must not exist yet.' },
  },
  required: ['source_path', 'destination_path'],
} as const;

export const DELETE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: `The file to delete, ${PATH_HINT}.` },
  },
  required: ['file_path'],
} as const;

/** D5: `Edit` and `Write` stay text only, with this cap. */
export const MAX_CONTENT_BYTES = 256 * 1024;

const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);

function requiredPath(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw invalid(`"${key}" is required.`);
  return value;
}

export function parseEditArgs(args: Record<string, unknown>): EditArgs {
  const file_path = requiredPath(args, 'file_path');
  if (typeof args.old_string !== 'string' || args.old_string === '') throw invalid('"old_string" is required and cannot be empty.');
  if (typeof args.new_string !== 'string') throw invalid('"new_string" is required.');
  if (args.old_string === args.new_string) throw invalid('"new_string" must be different from "old_string".');
  if (args.replace_all !== undefined && args.replace_all !== null && typeof args.replace_all !== 'boolean') throw invalid('"replace_all" must be true or false.');
  return { file_path, old_string: args.old_string, new_string: args.new_string, replace_all: args.replace_all === true };
}

export function parseWriteArgs(args: Record<string, unknown>): WriteArgs {
  const file_path = requiredPath(args, 'file_path');
  if (typeof args.content !== 'string' || args.content.trim() === '') throw invalid('"content" is required.');
  if (Buffer.byteLength(args.content, 'utf8') > MAX_CONTENT_BYTES) throw invalid(`"content" is at most ${MAX_CONTENT_BYTES} bytes.`);
  return { file_path, content: args.content };
}

export function parseMoveArgs(args: Record<string, unknown>): MoveArgs {
  return { source_path: requiredPath(args, 'source_path'), destination_path: requiredPath(args, 'destination_path') };
}

export function parseDeleteArgs(args: Record<string, unknown>): DeleteArgs {
  return { file_path: requiredPath(args, 'file_path') };
}

export interface FileChangeResult {
  /** The path as the tools address it: the session root, then the path inside it. */
  file_path: string;
  session: string;
  /** `Move` only: where the file went. */
  destination_path?: string;
  committed: false;
  message: string;
}

/** A file in one of the caller's sessions, refused outside every session root and on every protected path (D1, D5). */
interface Target {
  session: MemberSession;
  /** Store-relative inside the session. */
  rel: string;
  /** As the tools address it. */
  shown: string;
  absolute: string;
}

async function target(write: WriteDeps, email: string, input: string): Promise<Target> {
  const normalized = normalizeStorePath(input);
  const located = await locatePath(write, email, normalized);
  if (located.kind !== 'session') {
    throw noSessionRefusal(`"${normalized}" is not under the root of one of your sessions, so nothing was changed.`, await memberSessions(write, email));
  }
  if (located.rel === '') throw invalid(`"${normalized}" is a session root, not a file in it.`);
  const reason = protectedReason(located.rel, write.config);
  if (reason !== null) throw protectedRefusal(normalized, reason);
  return { session: located.session, rel: located.rel, shown: normalized, absolute: path.join(located.session.ref.storeRoot, located.rel) };
}

/**
 * The nearest existing ancestor of the target, resolved, must sit inside the
 * session's worktree, and the target itself must not be a link: a committed
 * symlinked folder would otherwise carry a write anywhere the server can.
 */
async function confined(t: Target): Promise<void> {
  const top = await realpath(t.session.ref.path);
  let probe = path.dirname(t.absolute);
  for (;;) {
    const found = await realpath(probe).catch(() => null);
    if (found !== null) {
      if (found !== top && !found.startsWith(`${top}${path.sep}`)) throw new ToolRefusal('mcp.path_outside_store', `"${t.shown}" resolves outside its session.`);
      break;
    }
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  const info = await lstat(t.absolute).catch(() => null);
  if (info?.isSymbolicLink()) throw new ToolRefusal('mcp.path_not_editable', `"${t.shown}" is a symbolic link, which these tools do not follow.`);
}

function rebaseRefusal(session: MemberSession, what: string): ToolRefusal {
  return new ToolRefusal(
    'mcp.rebase_in_progress',
    `A rebase is in progress in ${session.name}, so ${what}. Resolve the conflicting files with Edit, then call session_rebase with continue: true, or undo it with abort: true.`,
    { session: session.name },
  );
}

/** D2 risks: during a rebase only `Edit` and `Write` on a conflicting path go through. */
async function checkRebase(write: WriteDeps, t: Target, allowConflicting: boolean): Promise<void> {
  if (!(await rebaseInProgress(write.git, t.session.ref.path))) return;
  if (allowConflicting) {
    const conflicted = (await write.git.run(['diff', '--name-only', '--diff-filter=U', '-z'], { cwd: t.session.ref.path, allowFailure: true })).stdout.split('\0');
    if (conflicted.includes(`${await repoPrefixOf(write)}${t.rel}`)) return;
  }
  throw rebaseRefusal(t.session, `"${t.shown}" cannot be changed until it finishes`);
}

/** D5: a path the note enumeration admits must still parse as a note; templates, the log and other files are not notes. */
function checkNote(write: WriteDeps, t: Target, text: string): void {
  if (!admitsNotePath(t.rel, write.config)) return;
  try {
    parseNoteText(text, t.rel);
  } catch (err) {
    const reason = err instanceof InvalidNoteFrontmatterError ? err.finding.message : err instanceof Error ? err.message : String(err);
    throw new ToolRefusal('mcp.not_a_note', `The result would not be a valid note, so nothing was changed: ${reason}`);
  }
}

async function existing(t: Target): Promise<string | null> {
  const info = await lstat(t.absolute).catch(() => null);
  if (info === null) return null;
  if (!info.isFile()) throw new ToolRefusal('mcp.path_not_editable', `"${t.shown}" is not a regular file.`);
  return readFile(t.absolute, 'utf8');
}

function changed(t: Target, verb: string, extra: Partial<FileChangeResult> = {}): FileChangeResult {
  return {
    file_path: t.shown,
    session: t.session.name,
    committed: false,
    ...extra,
    message: `${verb} in your session ${t.session.name}. Nothing is committed or published until you call session_submit.`,
  };
}

function replace(text: string, args: EditArgs): string {
  return args.replace_all === true ? text.split(args.old_string).join(args.new_string) : text.replace(args.old_string, () => args.new_string);
}

/** Under the write mutex. */
export async function editTool(write: WriteDeps, email: string, args: EditArgs): Promise<FileChangeResult> {
  const t = await target(write, email, args.file_path);
  await checkRebase(write, t, true);
  await confined(t);
  const current = await existing(t);
  if (current === null) throw new ToolRefusal('mcp.file_not_found', `"${t.shown}" does not exist. Use Write to create a new file.`);
  const count = current.split(args.old_string).length - 1;
  if (count === 0) throw new ToolRefusal('mcp.edit_failed', `old_string was not found in "${t.shown}". Read the file again and copy the text exactly.`);
  if (count > 1 && args.replace_all !== true) {
    throw new ToolRefusal('mcp.edit_failed', `old_string occurs ${count} times in "${t.shown}". Include more surrounding text to make it unique, or set replace_all.`, { occurrences: count });
  }
  const text = replace(current, args);
  if (Buffer.byteLength(text, 'utf8') > MAX_CONTENT_BYTES) throw invalid(`The result would be over ${MAX_CONTENT_BYTES} bytes; nothing was changed.`);
  checkNote(write, t, text);
  await writeFile(t.absolute, text);
  return changed(t, `Edited "${t.shown}"`);
}

/** Under the write mutex. Never overwrites. */
export async function writeTool(write: WriteDeps, email: string, args: WriteArgs): Promise<FileChangeResult> {
  const t = await target(write, email, args.file_path);
  await checkRebase(write, t, true);
  await confined(t);
  if ((await lstat(t.absolute).catch(() => null)) !== null) {
    throw new ToolRefusal('mcp.file_exists', `"${t.shown}" already exists. Write only creates new files; use Edit to change it.`);
  }
  const text = args.content.endsWith('\n') ? args.content : `${args.content}\n`;
  checkNote(write, t, text);
  await mkdir(path.dirname(t.absolute), { recursive: true });
  await writeFile(t.absolute, text, { flag: 'wx' });
  return changed(t, `Created "${t.shown}"`);
}

async function tracked(write: WriteDeps, t: Target): Promise<boolean> {
  return (await write.git.run(['ls-files', '--error-unmatch', '--', t.absolute], { cwd: t.session.ref.path, allowFailure: true })).exitCode === 0;
}

/** Under the write mutex. A tracked file moves as `git mv` moves it, so the session shows a rename. */
export async function moveTool(write: WriteDeps, email: string, args: MoveArgs): Promise<FileChangeResult> {
  const from = await target(write, email, args.source_path);
  const to = await target(write, email, args.destination_path);
  if (from.session.name !== to.session.name) throw invalid('"source_path" and "destination_path" must be under the same session root.');
  await checkRebase(write, from, false);
  await confined(from);
  await confined(to);
  if ((await existing(from)) === null) throw new ToolRefusal('mcp.file_not_found', `"${from.shown}" does not exist.`);
  if ((await lstat(to.absolute).catch(() => null)) !== null) throw new ToolRefusal('mcp.file_exists', `"${to.shown}" already exists; Move never overwrites.`);
  await mkdir(path.dirname(to.absolute), { recursive: true });
  if (await tracked(write, from)) {
    const moved = await write.git.run(['mv', '--', from.absolute, to.absolute], { cwd: from.session.ref.path, allowFailure: true });
    if (moved.exitCode !== 0) throw new ToolRefusal('mcp.move_failed', `"${from.shown}" could not be moved: ${moved.stderr.trim()}`);
  } else {
    await rename(from.absolute, to.absolute);
  }
  return changed(from, `Moved "${from.shown}" to "${to.shown}"`, { destination_path: to.shown });
}

/** Under the write mutex. Destructive: the working-tree copy is gone, though a committed version stays in history. */
export async function deleteTool(write: WriteDeps, email: string, args: DeleteArgs): Promise<FileChangeResult> {
  const t = await target(write, email, args.file_path);
  await checkRebase(write, t, false);
  await confined(t);
  if ((await existing(t)) === null) throw new ToolRefusal('mcp.file_not_found', `"${t.shown}" does not exist.`);
  if (await tracked(write, t)) {
    const removed = await write.git.run(['rm', '-q', '-f', '--', t.absolute], { cwd: t.session.ref.path, allowFailure: true });
    if (removed.exitCode !== 0) throw new ToolRefusal('mcp.delete_failed', `"${t.shown}" could not be deleted: ${removed.stderr.trim()}`);
  } else {
    await unlink(t.absolute);
  }
  return changed(t, `Deleted "${t.shown}"`);
}
