import { execFile } from 'node:child_process';

/**
 * serve-the-store-over-mcp design.md D12: the one module that spawns
 * ripgrep, for the MCP surface's `Grep` and `Glob`. Claude Code's own Grep
 * parameters map onto ripgrep's flags one for one, so they are passed through
 * as an argument vector — never a shell — with `--` ahead of the pattern, so
 * no pattern is ever read as a flag. Ripgrep's engine runs in time linear in
 * its input, so no pattern can hang the server; the time and output limits
 * here bound everything else.
 */

export const RIPGREP_TIMEOUT_MS = 5_000;
export const RIPGREP_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

export interface GrepParams {
  pattern: string;
  path?: string;
  glob?: string;
  type?: string;
  output_mode?: 'content' | 'files_with_matches' | 'count';
  '-i'?: boolean;
  '-n'?: boolean;
  '-A'?: number;
  '-B'?: number;
  '-C'?: number;
  context?: number;
  multiline?: boolean;
}

export type RipgrepOutcome = { kind: 'ok'; lines: string[] } | { kind: 'no-match' } | { kind: 'error'; message: string };

function run(args: readonly string[], cwd: string): Promise<RipgrepOutcome> {
  return new Promise((resolve) => {
    execFile('rg', [...args], { cwd, timeout: RIPGREP_TIMEOUT_MS, maxBuffer: RIPGREP_MAX_OUTPUT_BYTES, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (err === null) {
        resolve({ kind: 'ok', lines: stdout.split('\n').filter((line) => line.length > 0) });
        return;
      }
      const e = err as Error & { code?: number | string; killed?: boolean };
      if (e.code === 1) resolve({ kind: 'no-match' });
      else if (e.code === 'ENOENT') resolve({ kind: 'error', message: 'ripgrep (rg) is not installed where this server runs' });
      else if (e.killed) resolve({ kind: 'error', message: `the search took longer than ${RIPGREP_TIMEOUT_MS / 1000} seconds; narrow it with path or glob` });
      else if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') resolve({ kind: 'error', message: 'the search produced too much output; narrow it with path, glob or head_limit' });
      else resolve({ kind: 'error', message: stderr.trim().split('\n')[0] || `ripgrep failed (${String(e.code)})` });
    });
  });
}

/** `--glob '!<prefix>**'` for each path the tools must never read or return. */
function exclusionArgs(hidden: readonly string[]): string[] {
  return hidden.flatMap((prefix) => {
    const trimmed = prefix.replace(/\/+$/, '');
    return ['--glob', `!${trimmed}`, '--glob', `!${trimmed}/**`];
  });
}

const BASE_ARGS = ['--no-config', '--color', 'never', '--sort', 'path', '--no-messages'];

/** Claude Code's Grep, mapped flag for flag. `searchPath` is store-relative, already confined to the store. */
export function grep(cwd: string, params: GrepParams, searchPath: string | null, hidden: readonly string[]): Promise<RipgrepOutcome> {
  const args = [...BASE_ARGS];
  const mode = params.output_mode ?? 'files_with_matches';
  if (mode === 'files_with_matches') args.push('--files-with-matches');
  else if (mode === 'count') args.push('--count');
  else if (params['-n'] !== false) args.push('--line-number');
  if (params['-i'] === true) args.push('--ignore-case');
  if (mode === 'content') {
    const context = params['-C'] ?? params.context;
    if (context !== undefined) args.push('--context', String(context));
    if (params['-A'] !== undefined) args.push('--after-context', String(params['-A']));
    if (params['-B'] !== undefined) args.push('--before-context', String(params['-B']));
  }
  if (params.multiline === true) args.push('--multiline', '--multiline-dotall');
  if (params.glob !== undefined) args.push('--glob', params.glob);
  if (params.type !== undefined) args.push('--type', params.type);
  // Last: ripgrep lets a later --glob override an earlier one, so a caller's glob must never follow an exclusion.
  args.push(...exclusionArgs(hidden));
  args.push('--', params.pattern);
  if (searchPath !== null) args.push(searchPath);
  return run(args, cwd);
}

/** Claude Code's Glob: files matching `pattern`, under `searchPath`, sorted by path. */
export function glob(cwd: string, pattern: string, searchPath: string | null, hidden: readonly string[]): Promise<RipgrepOutcome> {
  // Exclusions after the caller's pattern: a later --glob takes precedence in ripgrep.
  const args = [...BASE_ARGS, '--files', '--glob', pattern, ...exclusionArgs(hidden)];
  if (searchPath !== null) args.push('--', searchPath);
  return run(args, cwd);
}
