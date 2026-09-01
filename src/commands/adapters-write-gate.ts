import path from 'node:path';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { openStore } from '../core/store.js';
import { isWriteInScope } from '../core/write-lifecycle/path-gate.js';

/**
 * Claude Code's PreToolUse hook envelope, as documented at
 * code.claude.com/docs/en/hooks — only the fields this gate reads.
 */
interface PreToolUseInput {
  cwd?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    notebook_path?: string;
  };
}

const GATED_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

async function readStdin(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * `ctxr adapters write-gate`: the target of the generated Claude Code
 * PreToolUse hook (claude-code.ts's permissionConfig). This is deliberately
 * NOT a normal contexture command — it bypasses the --json envelope
 * entirely and speaks Claude Code's own hook protocol on stdout/exit code,
 * because that protocol is what the harness parses:
 *
 *   - deny: a `permissionDecision: "deny"` JSON body on stdout, exit 0.
 *   - let normal permission flow apply: exit 0, no output.
 *   - the gate's own error (unparseable stdin, no resolvable store): a
 *     nonzero exit that is never 2 — exit 2 hard-blocks the tool call
 *     regardless of output, and a bug in this gate must never do that; it
 *     degrades to "normal permission flow applies" instead.
 */
export async function execute(env: RunEnv, flags: { root?: string } = {}): Promise<ExitCode> {
  let raw: string;
  try {
    raw = await readStdin(env.io.stdin);
  } catch {
    return ExitCode.Internal;
  }

  let input: PreToolUseInput;
  try {
    input = JSON.parse(raw) as PreToolUseInput;
  } catch {
    return ExitCode.Internal;
  }

  const toolName = input.tool_name;
  if (!toolName || !GATED_TOOLS.has(toolName)) {
    return ExitCode.Ok;
  }

  const targetPath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
  if (!targetPath) {
    return ExitCode.Ok;
  }

  const cwd = input.cwd ?? env.cwd;
  const effectiveEnv: RunEnv = cwd === env.cwd ? env : { ...env, cwd };

  let root: string;
  let config: Awaited<ReturnType<typeof openStore>>['config'];
  try {
    ({ root, config } = await openStore(effectiveEnv, flags));
  } catch {
    return ExitCode.Internal;
  }

  const relativePath = path.relative(root, path.resolve(cwd, targetPath));
  const scope = await isWriteInScope(config, root, relativePath);
  if (scope.inScope) {
    return ExitCode.Ok;
  }

  const reason =
    `contexture: "${targetPath}" ${scope.reason ?? 'is outside the active session worktree'} in the store at "${root}". ` +
    'Run "ctxr session start" and make this edit inside its worktree instead.';
  const decision = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  env.io.stdout.write(`${JSON.stringify(decision)}\n`);
  return ExitCode.Ok;
}
