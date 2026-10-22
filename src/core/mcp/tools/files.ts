import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../../../config/schema.js';
import { isUnderAnyPrefix } from '../../fs/prefix.js';
import { admitsNotePath, excludedPrefixesFor } from '../../notes/list.js';
import { CONFIG_FILE_NAME } from '../../root.js';
import { draftVersion, findDraft } from '../drafts.js';
import { ToolRefusal } from '../jsonrpc.js';
import { glob as ripgrepGlob, grep as ripgrepGrep, type GrepParams } from '../ripgrep.js';
import type { WriteDeps } from '../sessions.js';
import type { Snapshot } from '../sync.js';

/**
 * serve-the-store-over-mcp design.md D12 (remote-access spec, *`Read`,
 * `Grep` and `Glob` give file-shaped access with Claude Code's parameters*):
 * Claude Code's own file tools, by name and parameter, answering from the
 * commit being served. Paths are store-relative (a leading `/` names the
 * store root). What these tools may never read or return is one list, used
 * both to refuse a named path and as ripgrep's exclusions.
 */

export const READ_DEFAULT_LIMIT = 2000;
const READ_MAX_LINE_CHARS = 2000;
const GREP_MAX_LINES = 1000;
/** The store's entry document, readable though it is not a note. */
const ENTRY_DOCUMENT = 'AGENTS.md';

/** Everything these tools hide: the retrieval exclusions except the capture tier, plus configuration and `.git`. */
export function hiddenPrefixes(config: StoreConfig): string[] {
  const captureRoot = config.ingest.capture_root.replace(/\/+$/, '');
  return [...excludedPrefixesFor(config).filter((p) => p.replace(/\/+$/, '') !== captureRoot), CONFIG_FILE_NAME, '.git'];
}

/** A caller's path as a store-relative one; refused when it leaves the store or is hidden. `''` is the store root. */
export function resolveStorePath(input: string, config: StoreConfig): string {
  const cleaned = input.trim().replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${cleaned}`).replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized === '..' || normalized.startsWith('../') || cleaned.split('/').includes('..')) {
    throw new ToolRefusal('mcp.path_outside_store', `"${input}" is outside the store.`);
  }
  if (normalized !== '' && isUnderAnyPrefix(normalized, hiddenPrefixes(config))) {
    throw new ToolRefusal('mcp.path_not_readable', `"${normalized}" is not something these tools read (configuration, derived files and tool-owned folders are not).`);
  }
  return normalized;
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
  draft: boolean;
  capture: boolean;
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

export async function readTool(snapshot: Snapshot, write: WriteDeps, email: string, args: ReadArgs): Promise<ReadResult> {
  const config = snapshot.store.config;
  const rel = resolveStorePath(args.file_path, config);
  const captureRoot = config.ingest.capture_root;
  const isCapture = isUnderAnyPrefix(rel, [captureRoot]);
  const admitted = admitsNotePath(rel, config);

  const draft = admitted ? await findDraft(write, email) : null;
  const drafted = draft === null ? null : await draftVersion(write, draft, rel);
  if (drafted !== null) {
    const n = numbered(drafted, args.offset, args.limit);
    return { file_path: rel, content: n.content, total_lines: n.total, first_line: n.first, last_line: n.last, draft: true, capture: false };
  }

  if (!admitted && !isCapture && rel !== ENTRY_DOCUMENT) {
    throw new ToolRefusal('mcp.path_not_readable', `"${rel}" is not a note, a capture or the entry document, so it cannot be read here.`);
  }
  const absolute = path.join(snapshot.store.root, rel);
  const info = await stat(absolute).catch(() => null);
  if (info === null || !info.isFile()) throw new ToolRefusal('mcp.file_not_found', `"${rel}" does not exist in the store.`);
  const n = numbered(await readFile(absolute, 'utf8'), args.offset, args.limit);
  return { file_path: rel, content: n.content, total_lines: n.total, first_line: n.first, last_line: n.last, draft: false, capture: isCapture };
}

export function renderRead(data: unknown): string {
  const r = data as ReadResult & { store: { head: string } };
  const notes: string[] = [];
  if (r.draft) notes.push('This is your pending draft of this note (awaiting approval), not the version in the store.');
  if (r.capture) notes.push('This is a capture: raw material not yet filed into a note. Do not present it as what the store says.');
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
  /** Inbox files on session branches with an open pull request that match: captures awaiting approval. */
  awaiting_approval: { path: string; branch: string; lines: string[] }[];
}

export async function grepTool(snapshot: Snapshot, args: GrepArgs): Promise<GrepResult> {
  const config = snapshot.store.config;
  const searchPath = args.path === undefined ? null : resolveStorePath(args.path, config) || null;
  const outcome = await ripgrepGrep(snapshot.store.root, args, searchPath, hiddenPrefixes(config));
  if (outcome.kind === 'error') throw new ToolRefusal('mcp.search_failed', `The search could not run: ${outcome.message}.`);
  const all = outcome.kind === 'ok' ? outcome.lines : [];
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
    for (const capture of snapshot.pending) {
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
  return { output_mode: args.output_mode ?? 'files_with_matches', lines, omitted: Math.max(0, all.length - start - lines.length), awaiting_approval: awaiting };
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

export async function globTool(snapshot: Snapshot, args: GlobArgs): Promise<{ files: string[]; omitted: number }> {
  const config = snapshot.store.config;
  const searchPath = args.path === undefined ? null : resolveStorePath(args.path, config) || null;
  const outcome = await ripgrepGlob(snapshot.store.root, args.pattern, searchPath, hiddenPrefixes(config));
  if (outcome.kind === 'error') throw new ToolRefusal('mcp.search_failed', `The file listing could not run: ${outcome.message}.`);
  const files = outcome.kind === 'ok' ? outcome.lines : [];
  return { files: files.slice(0, GREP_MAX_LINES), omitted: Math.max(0, files.length - GREP_MAX_LINES) };
}

export function renderGlob(data: unknown): string {
  const r = data as { files: string[]; omitted: number };
  if (r.files.length === 0) return 'No files found';
  return [...r.files, ...(r.omitted > 0 ? [`[${r.omitted} more not shown; narrow the pattern]`] : [])].join('\n');
}
