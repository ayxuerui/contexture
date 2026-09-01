import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * `execFile`'s promisified form has no `input` option — only the callback
 * form returns the `ChildProcess` synchronously, the one way to write to
 * and close its stdin, so a stdin-reading child doesn't hang forever
 * waiting for an EOF that never comes (see run-cli.ts for the same fix).
 */
function execWithStdin(
  file: string,
  args: readonly string[],
  opts: { cwd: string; env?: Record<string, string | undefined>; input: string },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args as string[], { cwd: opts.cwd, env: opts.env }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(err, { stdout, stderr }));
      else resolve({ stdout, stderr });
    });
    child.stdin?.end(opts.input);
  });
}

/**
 * task 6.5 / task 7's manual pair, exercised for real: `ctxr adapters
 * generate` installs an executable hook script, and piping a real
 * PreToolUse envelope through it (via `sh`, exactly as Claude Code would
 * invoke it) produces the deny decision for a store-root path.
 */
describe('claude-code write-gate hook (real CLI)', () => {
  it('installs an executable hook script that denies a store-root edit when run through sh', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const mode = (await stat(scriptPath)).mode;
      expect(mode & 0o111).not.toBe(0);

      const payload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') },
      });
      const { stdout } = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env, input: payload });
      const decision = JSON.parse(stdout);
      expect(decision.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets an edit inside the session worktree through the real script with no output', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const payload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Write',
        tool_input: { file_path: path.join(tmp.root, '.worktrees', 'sess1', 'notes', 'foo.md') },
      });
      const { stdout } = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env, input: payload });
      expect(stdout).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('the script contains no leftover template placeholder', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const script = await readFile(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'), 'utf8');
      expect(script).not.toContain('__CONTEXTURE_BIN__');
    } finally {
      await tmp.cleanup();
    }
  });
});
