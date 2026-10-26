import { createHash, randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { rebaseInProgress } from '../../session/resolve.js';
import { runServerCli, type CliRunResult } from '../cli-runner.js';
import { ToolRefusal } from '../jsonrpc.js';
import { ownedSession, repoPrefixOf, type MemberSession } from '../member-sessions.js';
import { protectedReason, protectedRefusal, type ProtectedReason } from '../paths.js';
import type { WriteDeps } from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';
import { CTXR_READ_COMMANDS, CTXR_WRITE_COMMANDS, INPUT_ARGUMENT, matchCommand } from '../tool-map.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D4, D5 (remote-access spec,
 * *`ctxr` and `ctxr_write` run allowlisted CLI commands confined to one
 * checkout*): a skill's "run `ctxr lint`" works unchanged. `ctxr` runs a
 * read-only command against the served commit or one of the caller's
 * sessions; `ctxr_write` runs a writing one inside a session the caller owns.
 * Each runs the server's own CLI with the checkout as its working directory
 * and store root, without the server's forge credentials. Before anything
 * runs, the subcommand must be on the tool's allowlist, the root option is
 * refused, and every path-like argument must stay inside the checkout and off
 * the protected paths. After a `ctxr_write` run, every protected path git
 * shows it changed is restored and the call refused, whatever destination the
 * command derived — the boundary does not rest on each command's own checks.
 */

export const CTXR_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    args: { type: 'array', items: { type: 'string' }, description: `The command and its arguments, as you would type them after "ctxr", one item per argument, e.g. ["lint"] or ["catalog", "show", "--section", "projects"]. Read-only commands only: ${CTXR_READ_COMMANDS.join(', ')}.` },
    session: { type: 'string', description: "Run in this session of yours (its directory name) instead of against the store's current commit." },
  },
  required: ['args'],
} as const;

export const CTXR_WRITE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    args: { type: 'array', items: { type: 'string' }, description: `The command and its arguments, one item per argument, e.g. ["ingest", "<root>raw/inbox/x.md", "--into", "<root>projects/kestrel.md", ...]. Writing commands only: ${CTXR_WRITE_COMMANDS.join(', ')}.` },
    session: { type: 'string', description: 'The session of yours to run in (its directory name). Required.' },
    input: { type: 'string', description: `Text for a command that reads a file (rollup write --content-file, session capture --proposal): pass "${INPUT_ARGUMENT}" as that argument and it is replaced with a file holding this text.` },
  },
  required: ['args', 'session'],
} as const;

const MAX_ARGS = 64;
const MAX_ARG_CHARS = 8192;
/** D4: the `input` text is capped like `Write`'s content. */
const MAX_INPUT_BYTES = 256 * 1024;

const invalid = (message: string) => new ToolRefusal('mcp.invalid_arguments', message);

export interface CliArgs {
  args: string[];
  session?: string;
  input?: string;
}

export function parseCliArgs(args: Record<string, unknown>, write: boolean): CliArgs {
  const argv = args.args;
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((a) => typeof a !== 'string')) throw invalid('"args" is a non-empty list of strings: the command, then its arguments.');
  if (argv.length > MAX_ARGS || (argv as string[]).some((a) => a.length > MAX_ARG_CHARS || a.includes('\0'))) throw invalid(`"args" holds at most ${MAX_ARGS} arguments of at most ${MAX_ARG_CHARS} characters each.`);
  const out: CliArgs = { args: [...(argv as string[])] };
  if (args.session !== undefined && args.session !== null) {
    if (typeof args.session !== 'string' || args.session.trim() === '') throw invalid('"session", when given, is the directory name of one of your sessions.');
    out.session = args.session.trim();
  } else if (write) {
    throw new ToolRefusal('mcp.no_session', '"session" is required: ctxr_write runs only inside one of your sessions. Call session_start first.');
  }
  if (args.input !== undefined && args.input !== null) {
    if (!write) throw invalid('"input" is for ctxr_write only.');
    if (typeof args.input !== 'string') throw invalid('"input" must be a string.');
    if (Buffer.byteLength(args.input, 'utf8') > MAX_INPUT_BYTES) throw invalid(`"input" is at most ${MAX_INPUT_BYTES} bytes.`);
    out.input = args.input;
  }
  return out;
}

/** The root option, in either spelling, wherever it appears. */
function isRootOption(token: string): boolean {
  return token === '--root' || token.startsWith('--root=');
}

/** What a token says, if it could be a path: an option's `=` value, a bare argument; never an option name or prose. */
function pathCandidate(token: string): { value: string; prefix: string } | null {
  if (token.startsWith('-')) {
    const eq = token.indexOf('=');
    if (!token.startsWith('--') || eq === -1) return null;
    return { value: token.slice(eq + 1), prefix: token.slice(0, eq + 1) };
  }
  return { value: token, prefix: '' };
}

/**
 * D4: every argument after the command path, checked before anything runs.
 * A path under the caller's session root is rewritten to the path inside the
 * session, which is what the command sees as its store root; any other
 * path-like argument must stay inside the checkout and off the protected paths.
 */
export function checkArguments(
  argv: readonly string[],
  allowlist: readonly string[],
  tool: 'ctxr' | 'ctxr_write',
  config: WriteDeps['config'],
  sessionRoot: string | null,
): { command: string; argv: string[] } {
  if (argv.some(isRootOption)) throw new ToolRefusal('mcp.root_option', 'The root option is not accepted: the command always runs against the checkout this tool chose.');
  const command = matchCommand(argv, allowlist);
  if (command === null) {
    throw new ToolRefusal('mcp.command_not_allowed', `"${argv.join(' ')}" is not a command ${tool} runs. Put the command first; ${tool} runs: ${allowlist.join(', ')}.`, { allowed: [...allowlist] });
  }
  const words = command.split(' ').length;
  const rewritten = argv.slice(0, words);
  for (const token of argv.slice(words)) {
    const candidate = pathCandidate(token);
    if (candidate === null || candidate.value === INPUT_ARGUMENT || /\s/.test(candidate.value) || candidate.value === '') {
      rewritten.push(token);
      continue;
    }
    let value = candidate.value.replace(/\\/g, '/');
    if (sessionRoot !== null) {
      const root = sessionRoot.replace(/\/+$/, '');
      const bare = value.replace(/^\/+/, '');
      if (bare === root) value = '.';
      else if (bare.startsWith(`${root}/`)) value = bare.slice(root.length + 1);
    }
    if (path.posix.isAbsolute(value) || /^[A-Za-z]:\//.test(value)) {
      throw new ToolRefusal('mcp.path_outside_store', `"${candidate.value}" is an absolute path; name files relative to the store${sessionRoot === null ? '' : ` or under your session root ${sessionRoot}`}.`);
    }
    const normalized = path.posix.normalize(value);
    if (normalized === '..' || normalized.startsWith('../')) throw new ToolRefusal('mcp.path_outside_store', `"${candidate.value}" is outside the checkout this command runs in.`);
    const reason = protectedReason(normalized.replace(/\/+$/, ''), config);
    if (reason !== null && normalized !== '.') throw protectedRefusal(candidate.value, reason);
    rewritten.push(`${candidate.prefix}${value}`);
  }
  return { command, argv: rewritten };
}

/** D4: the server's environment without its forge credentials, with the checkout as the store root. */
export function childEnv(env: Readonly<Record<string, string | undefined>>, cwd: string, cacheDir: string): Record<string, string> {
  const child: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;
    if (/TOKEN/i.test(key) || key.startsWith('GH_') || key.startsWith('GITHUB_') || key.startsWith('CONTEXTURE_GITHUB_')) continue;
    if (key === 'CONTEXTURE_ROOT' || key === 'CONTEXTURE_STORE_ROOT' || key === 'GIT_ASKPASS' || key === 'SSH_ASKPASS' || key === 'SSH_AUTH_SOCK') continue;
    child[key] = value;
  }
  child.CONTEXTURE_STORE_ROOT = cwd;
  // gh's own credential file is out of reach too: its configuration directory is one that does not exist.
  child.GH_CONFIG_DIR = path.join(cacheDir, 'no-gh-config');
  child.GIT_TERMINAL_PROMPT = '0';
  return child;
}

export interface CliToolContext {
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
  /** The CLI entry the runners spawn with `process.execPath`. */
  entry: string;
  timeoutMs?: number;
}

export interface CliToolResult extends CliRunResult {
  command: string;
  args: string[];
  /** What it ran against: the session, or the served commit. */
  ran_against: { session: string; root: string } | { commit: string };
}

/** `--no-input` always: nothing a tool runs may wait on a person. */
function finalArgv(argv: readonly string[]): string[] {
  return argv.includes('--no-input') ? [...argv] : [...argv, '--no-input'];
}

export async function ctxrTool(ctx: CliToolContext, email: string, args: CliArgs): Promise<CliToolResult> {
  if (args.session !== undefined) {
    const session = await ownedSession(ctx.write, email, args.session);
    const checked = checkArguments(args.args, CTXR_READ_COMMANDS, 'ctxr', ctx.write.config, session.root);
    const cwd = session.ref.storeRoot;
    const run = await runServerCli({ entry: ctx.entry, argv: finalArgv(checked.argv), cwd, env: childEnv(ctx.write.env, cwd, cacheDirOf(ctx.write, cwd)), timeoutMs: ctx.timeoutMs });
    return { command: checked.command, args: checked.argv, ...run, ran_against: { session: session.name, root: session.root } };
  }
  return ctx.view.read(ctx.syncDeps, async (snapshot) => {
    const checked = checkArguments(args.args, CTXR_READ_COMMANDS, 'ctxr', snapshot.store.config, null);
    const cwd = snapshot.store.root;
    const run = await runServerCli({ entry: ctx.entry, argv: finalArgv(checked.argv), cwd, env: childEnv(ctx.write.env, cwd, cacheDirOf(ctx.write, cwd)), timeoutMs: ctx.timeoutMs });
    return { command: checked.command, args: checked.argv, ...run, ran_against: { commit: snapshot.head } };
  });
}

function cacheDirOf(write: WriteDeps, storeRoot: string): string {
  return path.join(storeRoot, write.config.derived.paths[0] ?? '.contexture/cache/', 'mcp');
}

/** A path's state for the after-run check: its content's hash, or absent. */
async function stateOf(file: string): Promise<string> {
  const info = await lstat(file).catch(() => null);
  if (info === null) return 'absent';
  if (info.isSymbolicLink()) return 'link';
  if (!info.isFile()) return 'other';
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/**
 * The protected paths git shows changed in the session, other than derived
 * ones, with each one's state. Rename sources count: moving a hook away
 * changes the hooks directory as surely as writing one.
 */
async function protectedChanges(write: WriteDeps, session: MemberSession): Promise<Map<string, { top: string; reason: ProtectedReason | 'outside'; state: string }>> {
  const prefix = await repoPrefixOf(write);
  const { stdout } = await write.git.run(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'], { cwd: session.ref.path, allowFailure: true });
  const found = new Map<string, { top: string; reason: ProtectedReason | 'outside'; state: string }>();
  for (const field of stdout.split('\0')) {
    if (field.length < 4) continue;
    const top = field.slice(3);
    let reason: ProtectedReason | 'outside' | null;
    if (!top.startsWith(prefix)) reason = 'outside';
    else reason = protectedReason(top.slice(prefix.length).replace(/\/+$/, ''), write.config);
    if (reason === null || reason === 'derived') continue;
    found.set(top, { top, reason, state: await stateOf(path.join(session.ref.path, top)) });
  }
  return found;
}

/** Back to the session's own tip: from HEAD when HEAD has it, else removed. */
async function restorePath(write: WriteDeps, session: MemberSession, top: string): Promise<void> {
  const cwd = session.ref.path;
  const inHead = (await write.git.run(['cat-file', '-e', `HEAD:${top}`], { cwd, allowFailure: true })).exitCode === 0;
  if (inHead) {
    await write.git.run(['restore', '--source=HEAD', '--staged', '--worktree', '--', top], { cwd, allowFailure: true });
  } else {
    await write.git.run(['rm', '-q', '--cached', '--ignore-unmatch', '--', top], { cwd, allowFailure: true });
    await rm(path.join(cwd, top), { recursive: true, force: true });
  }
}

/** Under the write mutex. */
export async function ctxrWriteTool(ctx: CliToolContext, email: string, args: CliArgs): Promise<CliToolResult> {
  const session = await ownedSession(ctx.write, email, args.session);
  if (await rebaseInProgress(ctx.write.git, session.ref.path)) {
    throw new ToolRefusal('mcp.rebase_in_progress', `A rebase is in progress in ${session.name}; finish it with session_rebase (continue: true or abort: true) before running commands in it.`, { session: session.name });
  }
  const checked = checkArguments(args.args, CTXR_WRITE_COMMANDS, 'ctxr_write', ctx.write.config, session.root);
  const usesInput = checked.argv.some((a) => a === INPUT_ARGUMENT || a.endsWith(`=${INPUT_ARGUMENT}`));
  if (usesInput && args.input === undefined) throw invalid(`An argument is "${INPUT_ARGUMENT}" but no "input" text was given.`);

  const cwd = session.ref.storeRoot;
  const cacheDir = cacheDirOf(ctx.write, cwd);
  let inputFile: string | null = null;
  let argv = checked.argv;
  if (usesInput) {
    await mkdir(cacheDir, { recursive: true });
    inputFile = path.join(cacheDir, `input-${randomBytes(6).toString('hex')}.txt`);
    await writeFile(inputFile, args.input!, { flag: 'wx' });
    argv = argv.map((a) => (a === INPUT_ARGUMENT ? inputFile! : a.endsWith(`=${INPUT_ARGUMENT}`) ? `${a.slice(0, -INPUT_ARGUMENT.length)}${inputFile}` : a));
  }

  const before = await protectedChanges(ctx.write, session);
  let run: CliRunResult;
  try {
    run = await runServerCli({ entry: ctx.entry, argv: finalArgv(argv), cwd, env: childEnv(ctx.write.env, cwd, cacheDir), timeoutMs: ctx.timeoutMs });
  } finally {
    if (inputFile !== null) await unlink(inputFile).catch(() => undefined);
  }

  // D5, revision 7: whatever the command derived, a protected change it made does not stay.
  const restored: string[] = [];
  for (const [top, after] of await protectedChanges(ctx.write, session)) {
    if (before.get(top)?.state === after.state) continue;
    await restorePath(ctx.write, session, top);
    restored.push(top);
  }
  if (restored.length > 0) {
    const prefix = await repoPrefixOf(ctx.write);
    const shown = restored.map((top) => (top.startsWith(prefix) ? `${session.root}${top.slice(prefix.length)}` : top));
    throw new ToolRefusal(
      'mcp.path_protected',
      `The command changed ${shown.map((p) => `"${p}"`).join(', ')}, which cannot be changed from here, so ${restored.length === 1 ? 'that change was' : 'those changes were'} undone and the call refused. Other changes it made stay in the session.`,
      { paths: shown, exit_code: run.exit_code, stdout: run.stdout, stderr: run.stderr },
    );
  }
  return { command: checked.command, args: checked.argv, ...run, ran_against: { session: session.name, root: session.root } };
}

export function renderCli(data: unknown): string {
  const r = data as CliToolResult;
  const against = 'session' in r.ran_against ? `session ${r.ran_against.session}` : `commit ${r.ran_against.commit.slice(0, 12)}`;
  const head = r.timed_out ? `ctxr ${r.args.join(' ')} was stopped after the time limit (against ${against}).` : `ctxr ${r.args.join(' ')} exited ${r.exit_code} (against ${against}).`;
  const parts = [head];
  if (r.stdout !== '') parts.push(r.stdout.replace(/\n$/, '') + (r.stdout_truncated ? '\n[output cut at the size limit]' : ''));
  if (r.stderr !== '') parts.push(`[stderr]\n${r.stderr.replace(/\n$/, '')}${r.stderr_truncated ? '\n[cut at the size limit]' : ''}`);
  return parts.join('\n\n');
}
