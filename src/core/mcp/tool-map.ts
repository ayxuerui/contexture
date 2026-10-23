/**
 * serve-the-session-lifecycle-to-chat-apps D9 and revisions 2, 3 and 6: the
 * one place a `ctxr` command is mapped to the MCP tool that runs it. The tool
 * registry (`tools/index.ts`) registers exactly the tools listed here, in
 * this order; the rendered skills' preamble, the drift check over the MCP
 * render and the tool/command alignment check all read this module, so no
 * tool name is ever derived from a command name by rule.
 *
 * Every tool is one of four kinds:
 * - `file`: Claude Code's own file tools, plus `Move` and `Delete`, which stand
 *   in for the `git mv` and `git rm` a local agent runs;
 * - `command`: one `ctxr` command, named for its path, taking its options as
 *   fields (plus `session`, the one field the MCP layer adds);
 * - `runner`: `ctxr` and `ctxr_write`, through which every allowlisted command
 *   without a tool of its own runs (D4);
 * - `exception`: a tool with no command, each with its reason.
 */

export type ToolKind = 'file' | 'command' | 'runner' | 'exception';

export interface ToolEntry {
  name: string;
  kind: ToolKind;
  /** `command` only: the command path, space-separated, as `ctxr <path>` takes it. */
  command?: string;
  /** `runner` and `exception`: why the tool is not a command of its own. */
  reason?: string;
}

/** The one field the MCP layer adds to a command's options: a local command finds its session from its working directory, a stateless server cannot. */
export const SESSION_FIELD = 'session';

/** The fields of the two runners (D4, D9). */
export const RUNNER_FIELDS = ['args', SESSION_FIELD, 'input'] as const;

/** The literal argument `ctxr_write` replaces with the path of a file holding the call's `input` (D4). */
export const INPUT_ARGUMENT = '@input';

/** D4: read-only commands `ctxr` runs, as command paths matched before any option. */
export const CTXR_READ_COMMANDS = [
  'lint',
  'doctor',
  'catalog show',
  'catalog check',
  'graph query',
  'graph diff',
  'context gather',
  'source check',
  'source hash',
  'rollup stale',
  'rollup gather',
  'publish check',
  'publish urls',
  'publish gather',
] as const;

/** D4: writing commands `ctxr_write` runs inside a member's own session. `session capture` is one of them (revision 2). */
export const CTXR_WRITE_COMMANDS = [
  'ingest',
  'archive',
  'entry append',
  'rollup write',
  'source stamp',
  'source add-alt',
  'session capture',
  'catalog build',
  'graph build',
  // ctxr-session-capture regenerates AGENTS.md after a guidance edit. Only the
  // entry document may change: the after-run check restores and refuses any
  // change update makes to the skills, the hooks or the configuration, which
  // is what a server on another ctxr version than the store's would write.
  'update',
] as const;

/** D3: the session commands with a typed tool of their own. */
export const SESSION_COMMAND_TOOLS = {
  'session start': 'session_start',
  'session list': 'session_list',
  'session status': 'session_status',
  'session submit': 'session_submit',
  'session rebase': 'session_rebase',
  'session discard': 'session_discard',
} as const;

/**
 * D6: the git and gh steps the shipped skills name, and the tool each one is in
 * this environment; null marks the server's own work, which the agent skips (the
 * lifecycle skill's canonical-clone refresh). A step not listed here has no
 * counterpart over MCP, and the drift check over the MCP render refuses it. The
 * preamble's tables are rendered from this and `SESSION_COMMAND_TOOLS`.
 */
export const GIT_STEP_TOOLS: Readonly<Record<string, string | null>> = {
  'git mv': 'Move',
  'git rm': 'Delete',
  'git status': 'session_status',
  'git diff': 'session_status',
  'git log': 'session_status',
  'git add': 'session_submit',
  'git commit': 'session_submit',
  'git push': 'session_submit',
  'git branch -m': 'session_submit',
  'gh pr create': 'session_submit',
  'gh pr edit': 'session_submit',
  'git fetch': null,
  'git merge --ff-only': null,
  'git rebase': 'session_rebase',
  'git worktree add': 'session_start',
  'git worktree list': 'session_list',
  'git worktree remove': 'session_discard',
};

/** The registry, in `tools/list` order. */
export const TOOL_REGISTRY: readonly ToolEntry[] = [
  { name: 'find', kind: 'exception', reason: "the content matching a local agent does with its own Grep together with `catalog show`, in one obvious entry for a client that has neither" },
  { name: 'gather', kind: 'exception', reason: '`ctxr context gather` with the bodies attached, which a client cannot read in one call otherwise; named for the clients already connected' },
  { name: 'Read', kind: 'file' },
  { name: 'Grep', kind: 'file' },
  { name: 'Glob', kind: 'file' },
  { name: 'capture', kind: 'exception', reason: 'a one-call capture for a phone: session_start, Write into the inbox, `ctxr source check` and session_submit together' },
  { name: 'session_start', kind: 'command', command: 'session start' },
  { name: 'session_list', kind: 'command', command: 'session list' },
  { name: 'session_status', kind: 'command', command: 'session status' },
  { name: 'Edit', kind: 'file' },
  { name: 'Write', kind: 'file' },
  { name: 'Move', kind: 'file' },
  { name: 'Delete', kind: 'file' },
  { name: 'session_submit', kind: 'command', command: 'session submit' },
  { name: 'session_rebase', kind: 'command', command: 'session rebase' },
  { name: 'session_discard', kind: 'command', command: 'session discard' },
  { name: 'ctxr', kind: 'runner', reason: 'runs every allowlisted read-only command that has no tool of its own (D4)' },
  { name: 'ctxr_write', kind: 'runner', reason: "runs every allowlisted writing command that has no tool of its own, inside the member's session (D4)" },
];

export const TOOL_NAMES: readonly string[] = TOOL_REGISTRY.map((t) => t.name);

/** The command path at the front of `argv` that `allowlist` holds, longest first; null when none does. Matched before any option. */
export function matchCommand(argv: readonly string[], allowlist: readonly string[]): string | null {
  const leading: string[] = [];
  for (const token of argv) {
    if (token.startsWith('-')) break;
    leading.push(token);
  }
  let best: string | null = null;
  for (const entry of allowlist) {
    const words = entry.split(' ');
    if (words.length <= leading.length && words.every((w, i) => leading[i] === w) && (best === null || words.length > best.split(' ').length)) best = entry;
  }
  return best;
}

export type CommandRoute = { via: 'tool'; tool: string } | { via: 'ctxr' } | { via: 'ctxr_write' };

/** How a `ctxr <command path>` step runs over MCP; null when the surface does not run it. */
export function routeForCommand(commandPath: string): CommandRoute | null {
  const words = commandPath.trim().split(/\s+/);
  const typed = (SESSION_COMMAND_TOOLS as Record<string, string>)[words.slice(0, 2).join(' ')];
  if (typed !== undefined) return { via: 'tool', tool: typed };
  if (matchCommand(words, CTXR_WRITE_COMMANDS) !== null) return { via: 'ctxr_write' };
  if (matchCommand(words, CTXR_READ_COMMANDS) !== null) return { via: 'ctxr' };
  return null;
}

/** The file tools: Claude Code's own, plus the two that stand in for `git mv` and `git rm` (D9). */
export const FILE_TOOLS = ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Move', 'Delete'] as const;
/** The named exceptions (D9): tools with no command, each with its reason in the registry. */
export const NAMED_EXCEPTIONS = ['find', 'gather', 'capture'] as const;
/** The command runners (D4, D9). */
export const RUNNERS = ['ctxr', 'ctxr_write'] as const;

/** One CLI command as the alignment check sees it: its path and the snake_case names of its options and arguments. */
export interface CommandShape {
  path: string;
  params: readonly string[];
}

/**
 * D9: what is wrong with a registry against the CLI's commands, one line per
 * problem, each naming the tool. Empty when every tool is a file tool, a
 * runner, a named exception, or a command-named tool whose fields other than
 * `session` are options or arguments that command registers.
 */
export function alignmentProblems(registry: readonly ToolEntry[], toolFields: Readonly<Record<string, readonly string[]>>, commands: readonly CommandShape[]): string[] {
  const problems: string[] = [];
  const byPath = new Map(commands.map((c) => [c.path, c]));
  for (const entry of registry) {
    const fields = toolFields[entry.name] ?? [];
    switch (entry.kind) {
      case 'file':
        if (!(FILE_TOOLS as readonly string[]).includes(entry.name)) problems.push(`${entry.name}: registered as a file tool, but it is not one of ${FILE_TOOLS.join(', ')}`);
        break;
      case 'exception':
        if (!(NAMED_EXCEPTIONS as readonly string[]).includes(entry.name)) problems.push(`${entry.name}: not a named exception (${NAMED_EXCEPTIONS.join(', ')})`);
        else if ((entry.reason ?? '').trim() === '') problems.push(`${entry.name}: a named exception carries its reason`);
        break;
      case 'runner': {
        if (!(RUNNERS as readonly string[]).includes(entry.name)) problems.push(`${entry.name}: not a command runner (${RUNNERS.join(', ')})`);
        const extra = fields.filter((f) => !(RUNNER_FIELDS as readonly string[]).includes(f));
        if (extra.length > 0) problems.push(`${entry.name}: a runner takes only ${RUNNER_FIELDS.join(', ')}, not ${extra.join(', ')}`);
        break;
      }
      case 'command': {
        const command = entry.command === undefined ? undefined : byPath.get(entry.command);
        if (command === undefined) {
          problems.push(`${entry.name}: no \`ctxr ${entry.command ?? '?'}\` command exists`);
          break;
        }
        if (entry.name !== command.path.split(' ').join('_')) problems.push(`${entry.name}: a command's tool is named for its path, \`${command.path.split(' ').join('_')}\``);
        const extra = fields.filter((f) => f !== SESSION_FIELD && !command.params.includes(f));
        if (extra.length > 0) problems.push(`${entry.name}: ${extra.join(', ')} ${extra.length === 1 ? 'is not an option' : 'are not options'} of \`ctxr ${command.path}\``);
        break;
      }
      default:
        problems.push(`${entry.name}: is neither a file tool, a command, a runner nor a named exception`);
    }
  }
  for (const listed of [...CTXR_READ_COMMANDS, ...CTXR_WRITE_COMMANDS]) {
    if (!commands.some((c) => c.path === listed || c.path.startsWith(`${listed} `))) problems.push(`ctxr: the allowlisted \`ctxr ${listed}\` is not a command`);
  }
  return problems;
}
