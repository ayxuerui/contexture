import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../../../config/schema.js';
import { joinBaseUrl, noteRoute } from '../../browse/page-url.js';
import { isUnderAnyPrefix } from '../../fs/prefix.js';
import { admitsNotePath } from '../../notes/list.js';
import { ToolRefusal } from '../jsonrpc.js';
import { locatePath, type MemberSession } from '../member-sessions.js';
import { ENTRY_DOCUMENT, nameablePath, normalizeStorePath, readablePath, searchExclusions } from '../paths.js';
import { glob as ripgrepGlob, grep as ripgrepGrep, type GrepParams } from '../ripgrep.js';
import type { WriteDeps } from '../sessions.js';
import type { McpView, Snapshot, SyncDeps } from '../sync.js';

/**
 * serve-the-store-over-mcp design.md D12 (remote-access spec, *`Read`,
 * `Grep` and `Glob` give file-shaped access with Claude Code's parameters*):
 * Claude Code's own file tools, by name and parameter, answering from the
 * commit being served. Paths are store-relative (a leading `/` names the
 * store root). What these tools may never read or return is one list, used
 * both to refuse a named path and as ripgrep's exclusions.
 *
 * serve-the-session-lifecycle-to-chat-apps D1, D5 (remote-access spec,
 * *`Read`, `Grep` and `Glob` read the served commit or a member's own
 * session*): a path under the root of one of the caller's sessions reads that
 * session's working tree, uncommitted work included; any other path reads the
 * served commit. The readable set widens to the templates, house conventions,
 * log and skills the owned skills read (`paths.ts`).
 */

export const READ_DEFAULT_LIMIT = 2000;
const READ_MAX_LINE_CHARS = 2000;
const GREP_MAX_LINES = 1000;

export { readablePath } from '../paths.js';

/** A caller's path as a store-relative one; refused when it leaves the store or is hidden. `''` is the store root. */
export function resolveStorePath(input: string, config: StoreConfig): string {
  const normalized = normalizeStorePath(input);
  if (!nameablePath(normalized, config)) {
    throw new ToolRefusal('mcp.path_not_readable', `"${normalized}" is not something these tools read (configuration, derived files and tool-owned folders are not).`);
  }
  return normalized;
}

/** Where a read is answered from: the served commit's view, or one of the caller's sessions. */
export type ReadTarget = { kind: 'view'; rel: string } | { kind: 'session'; session: MemberSession; rel: string };

/** The read target for a caller's path; a path under another member's (or no) session is hidden like the worktrees path. */
export async function readTarget(write: WriteDeps, email: string, input: string, config: StoreConfig): Promise<ReadTarget> {
  const normalized = normalizeStorePath(input);
  const located = await locatePath(write, email, normalized);
  if (located.kind === 'foreign') throw new ToolRefusal('mcp.path_not_readable', `"${normalized}" is not something these tools read (configuration, derived files and tool-owned folders are not).`);
  if (!nameablePath(located.rel, config)) {
    throw new ToolRefusal('mcp.path_not_readable', `"${normalized}" is not something these tools read (configuration, derived files and tool-owned folders are not).`);
  }
  return located;
}

/** What the file tools need for a read: the view, and the write side that knows the caller's sessions. */
export interface FileContext {
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
}

// ---- Read ----------------------------------------------------------------------

export interface ReadArgs {
  file_path: string;
  offset?: number;
  limit?: number;
}

export const READ_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    file_path: { type: 'string', description: 'The file to read, relative to the store root (a leading / means the store root), e.g. "projects/kestrel.md".' },
    offset: { type: 'number', description: 'The line number to start reading from. Only provide if the file is too large to read at once.' },
    limit: { type: 'number', description: 'The number of lines to read. Only provide if the file is too large to read at once.' },
  },
  required: ['file_path'],
} as const;

function positiveInteger(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new ToolRefusal('mcp.invalid_arguments', `"${name}" must be a whole number.`);
  return value;
}

export function parseReadArgs(args: Record<string, unknown>): ReadArgs {
  if (typeof args.file_path !== 'string' || args.file_path.trim() === '') throw new ToolRefusal('mcp.invalid_arguments', '"file_path" is required.');
  return { file_path: args.file_path, offset: positiveInteger(args.offset, 'offset'), limit: positiveInteger(args.limit, 'limit') };
}

export interface ReadResult {
  file_path: string;
  /** `cat -n` style: the line number, a tab, the line. */
  content: string;
  total_lines: number;
  first_line: number;
  last_line: number;
  /** The session whose working tree was read; null for the served commit. */
  session: string | null;
  capture: boolean;
  /** The note's page on the browsing surface, for citing; null for a capture, a session's copy, or anything not a note. */
  url: string | null;
}

function numbered(text: string, offset: number | undefined, limit: number | undefined): { content: string; total: number; first: number; last: number } {
  const lines = text.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const first = Math.max(1, offset ?? 1);
  const count = limit ?? READ_DEFAULT_LIMIT;
  const slice = lines.slice(first - 1, first - 1 + count);
  const content = slice
    .map((line, i) => `${String(first + i).padStart(6)}\t${line.length > READ_MAX_LINE_CHARS ? `${line.slice(0, READ_MAX_LINE_CHARS)}… (line truncated)` : line}`)
    .join('\n');
  return { content, total: lines.length, first, last: first + slice.length - 1 };
}

/** One file under `root`, numbered; refused unless it is readable, a regular file, and inside `root` once resolved. */
async function readUnder(root: string, rel: string, config: StoreConfig, shown: string, args: ReadArgs): Promise<{ text: string; n: ReturnType<typeof numbered> }> {
  if (!readablePath(rel, config)) {
    throw new ToolRefusal('mcp.path_not_readable', `"${shown}" is not a note, a capture, the entry document, a template, a house convention, the log or a skill, so it cannot be read here.`);
  }
  const absolute = path.join(root, rel);
  const info = await lstat(absolute).catch(() => null);
  if (info === null || (!info.isFile() && !info.isSymbolicLink())) throw new ToolRefusal('mcp.file_not_found', `"${shown}" does not exist.`);
  // A link is never followed: a committed symlink named like a note could otherwise read anything the server can.
  if (info.isSymbolicLink()) throw new ToolRefusal('mcp.path_not_readable', `"${shown}" is a symbolic link, which these tools do not follow.`);
  const real = await realpath(absolute);
  if (path.relative(await realpath(root), real).startsWith('..')) throw new ToolRefusal('mcp.path_outside_store', `"${shown}" is outside the store.`);
  const text = await readFile(absolute, 'utf8');
  return { text, n: numbered(text, args.offset, args.limit) };
}

export async function readTool(ctx: FileContext, email: string, args: ReadArgs): Promise<ReadResult> {
  const target = await readTarget(ctx.write, email, args.file_path, ctx.write.config);
  if (target.kind === 'session') {
    const config = ctx.write.config;
    const shown = `${target.session.root}${target.rel}`;
    const { n } = await readUnder(target.session.ref.storeRoot, target.rel, config, shown, args);
    const capture = isUnderAnyPrefix(target.rel, [config.ingest.capture_root]);
    return { file_path: shown, content: n.content, total_lines: n.total, first_line: n.first, last_line: n.last, session: target.session.name, capture, url: null };
  }
  return ctx.view.read(ctx.syncDeps, async (snapshot) => {
    const config = snapshot.store.config;
    const rel = resolveStorePath(target.rel, config);
    const { n } = await readUnder(snapshot.store.root, rel, config, rel, args);
    const capture = isUnderAnyPrefix(rel, [config.ingest.capture_root]);
    const url = admitsNotePath(rel, config) ? joinBaseUrl(ctx.write.baseUrl, noteRoute(rel)) : null;
    return { file_path: rel, content: n.content, total_lines: n.total, first_line: n.first, last_line: n.last, session: null, capture, url };
  });
}

export function renderRead(data: unknown): string {
  const r = data as ReadResult;
  const notes: string[] = [];
  if (r.session !== null) notes.push(`This is the working-tree copy in your session ${r.session}, including any change not yet submitted; it is not yet in the store.`);
  if (r.capture) notes.push('This is a capture: raw material not yet filed into a note. Do not present it as what the store says.');
  if (r.url !== null) notes.push(`${r.file_path}, at ${r.url}. Include this link when you cite the note.`);
  if (r.last_line < r.total_lines) notes.push(`Showing lines ${r.first_line}–${r.last_line} of ${r.total_lines}.`);
  return [...notes.map((n) => `[${n}]`), r.content].join('\n');
}

// ---- Grep ----------------------------------------------------------------------

export interface GrepArgs extends GrepParams {
  head_limit?: number;
  offset?: number;
}

export const GREP_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The regular expression pattern to search for in file contents' },
    path: { type: 'string', description: 'File or directory to search in, relative to the store root. Defaults to the whole store.' },
    glob: { type: 'string', description: 'Glob pattern to filter files (e.g. "*.md", "projects/**/*.md")' },
    type: { type: 'string', description: 'File type to search (e.g. md). More efficient than glob for standard file types.' },
    output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'], description: 'Output mode: "content" shows matching lines, "files_with_matches" shows file paths (default), "count" shows match counts.' },
    '-i': { type: 'boolean', description: 'Case insensitive search' },
    '-n': { type: 'boolean', description: 'Show line numbers in output (content mode; defaults to true)' },
    '-A': { type: 'number', description: 'Number of lines to show after each match (content mode)' },
    '-B': { type: 'number', description: 'Number of lines to show before each match (content mode)' },
    '-C': { type: 'number', description: 'Number of lines to show before and after each match (content mode)' },
    context: { type: 'number', description: 'Alias for -C' },
    multiline: { type: 'boolean', description: 'Enable multiline mode where . matches newlines and patterns can span lines' },
    head_limit: { type: 'number', description: 'Limit output to the first N lines/entries' },
    offset: { type: 'number', description: 'Skip the first N lines/entries before applying head_limit' },
  },
  required: ['pattern'],
} as const;

export function parseGrepArgs(args: Record<string, unknown>): GrepArgs {
  const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);
  if (typeof args.pattern !== 'string' || args.pattern === '') throw invalid('"pattern" is required.');
  const out: GrepArgs = { pattern: args.pattern };
  for (const key of ['path', 'glob', 'type'] as const) {
    if (args[key] !== undefined && args[key] !== null) {
      if (typeof args[key] !== 'string') throw invalid(`"${key}" must be a string.`);
      out[key] = args[key] as string;
    }
  }
  if (args.output_mode !== undefined && args.output_mode !== null) {
    if (args.output_mode !== 'content' && args.output_mode !== 'files_with_matches' && args.output_mode !== 'count') throw invalid('"output_mode" is content, files_with_matches or count.');
    out.output_mode = args.output_mode;
  }
  for (const key of ['-i', '-n', 'multiline'] as const) {
    if (args[key] !== undefined && args[key] !== null) {
      if (typeof args[key] !== 'boolean') throw invalid(`"${key}" must be true or false.`);
      out[key] = args[key] as boolean;
    }
  }
  for (const key of ['-A', '-B', '-C', 'context', 'head_limit', 'offset'] as const) {
    const value = positiveInteger(args[key], key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface GrepResult {
  output_mode: string;
  lines: string[];
  omitted: number;
  /** The session searched; null for the served commit. */
  session: string | null;
  /** Inbox files on session branches with an open pull request that match: captures awaiting approval. Served commit only. */
  awaiting_approval: { path: string; branch: string; lines: string[] }[];
}

/** Where a search runs: a root on disk, the store-relative path inside it, and the prefix its results are shown under. */
interface SearchTarget {
  root: string;
  searchPath: string | null;
  config: StoreConfig;
  /** `''` for the served commit; the session's root for a session. */
  shownPrefix: string;
  session: MemberSession | null;
  pending: Snapshot['pending'];
}

/** Runs `fn` over the search target a `path` argument names: a session of the caller's, else the served commit. */
async function searching<T extends object>(ctx: FileContext, email: string, input: string | undefined, fn: (target: SearchTarget) => Promise<T>): Promise<T> {
  if (input !== undefined) {
    const target = await readTarget(ctx.write, email, input, ctx.write.config);
    if (target.kind === 'session') {
      return fn({ root: target.session.ref.storeRoot, searchPath: target.rel || null, config: ctx.write.config, shownPrefix: target.session.root, session: target.session, pending: [] });
    }
  }
  return ctx.view.read(ctx.syncDeps, (snapshot) => {
    const config = snapshot.store.config;
    const searchPath = input === undefined ? null : resolveStorePath(input, config) || null;
    return fn({ root: snapshot.store.root, searchPath, config, shownPrefix: '', session: null, pending: snapshot.pending });
  });
}

export async function grepTool(ctx: FileContext, email: string, args: GrepArgs): Promise<GrepResult> {
  return searching(ctx, email, args.path, async ({ root, searchPath, config, shownPrefix, session, pending }) => {
    const outcome = await ripgrepGrep(root, args, searchPath, searchExclusions(config));
    if (outcome.kind === 'error') throw new ToolRefusal('mcp.search_failed', `The search could not run: ${outcome.message}.`);
    // design.md D12: Grep returns only what Read would read, so it never prints a file Read refuses.
    const entries = outcome.kind === 'ok' ? outcome.entries.filter((e) => e.path === null || readablePath(e.path, config)) : [];
    const all: string[] = [];
    for (const e of entries) {
      if (e.path === null) {
        if (all.length > 0 && all[all.length - 1] !== '--') all.push(e.rest ?? '--');
      } else if (e.rest === null) all.push(`${shownPrefix}${e.path}`);
      else all.push(`${shownPrefix}${e.path}${/^\d+[-]/.test(e.rest) ? '-' : ':'}${e.rest}`);
    }
    while (all[all.length - 1] === '--') all.pop();
    const start = args.offset ?? 0;
    const limit = Math.min(args.head_limit ?? GREP_MAX_LINES, GREP_MAX_LINES);
    const lines = all.slice(start, start + limit);

    // design.md D12: the duplicate `find` reveals, revealed here too. JavaScript's engine stands in for ripgrep's
    // over a handful of small files; a pattern it cannot compile simply matches none of them.
    const awaiting: GrepResult['awaiting_approval'] = [];
    let regex: RegExp | null = null;
    try {
      regex = new RegExp(args.pattern, args['-i'] === true ? 'i' : '');
    } catch {
      regex = null;
    }
    if (regex !== null) {
      for (const capture of pending) {
        if (searchPath !== null && !isUnderAnyPrefix(capture.path, [searchPath])) continue;
        const matching = capture.text
          .split('\n')
          .map((line, i) => ({ line, n: i + 1 }))
          .filter(({ line }) => regex!.test(line))
          .slice(0, 3)
          .map(({ line, n }) => `${n}:${line}`);
        if (matching.length > 0) awaiting.push({ path: capture.path, branch: capture.branch, lines: matching });
      }
    }
    return { output_mode: args.output_mode ?? 'files_with_matches', lines, omitted: Math.max(0, all.length - start - lines.length), session: session?.name ?? null, awaiting_approval: awaiting };
  });
}

export function renderGrep(data: unknown): string {
  const r = data as GrepResult;
  const out = r.lines.length > 0 ? [...r.lines] : ['No matches found.'];
  if (r.omitted > 0) out.push(`[${r.omitted} more not shown; use offset or narrow the search]`);
  if (r.awaiting_approval.length > 0) {
    out.push('', '[Captures awaiting approval, not yet in the store:]');
    for (const c of r.awaiting_approval) out.push(...c.lines.map((l) => `${c.path} (awaiting approval):${l}`));
  }
  return out.join('\n');
}

// ---- Glob ----------------------------------------------------------------------

export interface GlobArgs {
  pattern: string;
  path?: string;
}

export const GLOB_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    pattern: { type: 'string', description: 'The glob pattern to match files against, e.g. "**/*.md" or "projects/**/*.md"' },
    path: { type: 'string', description: 'The directory to search in, relative to the store root. Defaults to the whole store.' },
  },
  required: ['pattern'],
} as const;

export function parseGlobArgs(args: Record<string, unknown>): GlobArgs {
  if (typeof args.pattern !== 'string' || args.pattern === '') throw new ToolRefusal('mcp.invalid_arguments', '"pattern" is required.');
  if (args.path !== undefined && args.path !== null && typeof args.path !== 'string') throw new ToolRefusal('mcp.invalid_arguments', '"path" must be a string.');
  return { pattern: args.pattern, ...(typeof args.path === 'string' ? { path: args.path } : {}) };
}

export async function globTool(ctx: FileContext, email: string, args: GlobArgs): Promise<{ files: string[]; omitted: number; session: string | null }> {
  return searching(ctx, email, args.path, async ({ root, searchPath, config, shownPrefix, session }) => {
    const outcome = await ripgrepGlob(root, args.pattern, searchPath, searchExclusions(config));
    if (outcome.kind === 'error') throw new ToolRefusal('mcp.search_failed', `The file listing could not run: ${outcome.message}.`);
    const files = outcome.kind === 'ok' ? outcome.entries.map((e) => e.path).filter((p): p is string => p !== null && readablePath(p, config)) : [];
    return { files: files.slice(0, GREP_MAX_LINES).map((p) => `${shownPrefix}${p}`), omitted: Math.max(0, files.length - GREP_MAX_LINES), session: session?.name ?? null };
  });
}

export function renderGlob(data: unknown): string {
  const r = data as { files: string[]; omitted: number };
  if (r.files.length === 0) return 'No files found';
  return [...r.files, ...(r.omitted > 0 ? [`[${r.omitted} more not shown; narrow the pattern]`] : [])].join('\n');
}
