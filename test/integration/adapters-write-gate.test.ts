import { execFile } from 'node:child_process';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
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

  it('the script contains no leftover template placeholder or machine-specific path', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const script = await readFile(path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh'), 'utf8');
      expect(script).not.toContain('__CONTEXTURE_BIN__');
      expect(script).not.toContain('__RESOLVE_CTXR__');
      expect(script).not.toContain(tmp.root);
      expect(script).toContain('command -v ctxr');
    } finally {
      await tmp.cleanup();
    }
  });

  it('denies with a resolution-failure reason (not a scope reason) when ctxr cannot be found', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const payload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') },
      });
      // Override the harness default: no CONTEXTURE_BIN, and a PATH with no ctxr on it.
      const unresolvableEnv = { ...env, CONTEXTURE_BIN: undefined, PATH: '/usr/bin:/bin' };
      const { stdout } = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env: unresolvableEnv, input: payload });
      const decision = JSON.parse(stdout);
      expect(decision.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(decision.hookSpecificOutput.permissionDecisionReason).not.toContain(tmp.root);
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain('ctxr-cli');
    } finally {
      await tmp.cleanup();
    }
  });

  it('gates normally through node when CONTEXTURE_BIN names a non-executable dist/bin.js', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const nonExecutableBin = path.join(tmp.root, 'bin-copy.js');
      const distBinContent = await readFile(env.CONTEXTURE_BIN as string, 'utf8');
      await writeFile(nonExecutableBin, distBinContent);
      await chmod(nonExecutableBin, 0o644);

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const payload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') },
      });
      const dispatchedEnv = { ...env, CONTEXTURE_BIN: nonExecutableBin, PATH: '/usr/bin:/bin' };
      const { stdout } = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env: dispatchedEnv, input: payload });
      const decision = JSON.parse(stdout);
      expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });

  it('never falls through to PATH once CONTEXTURE_BIN is set, even if it is broken', async () => {
    const tmp = await makeTmpDir();
    const shimDir = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      // A working ctxr shim on PATH, so a fallthrough would silently succeed
      // instead of denying — proving CONTEXTURE_BIN, once set, is terminal.
      const shimPath = path.join(shimDir.root, 'ctxr');
      await writeFile(shimPath, `#!/bin/sh\nexec node "${env.CONTEXTURE_BIN}" "$@"\n`);
      await chmod(shimPath, 0o755);

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');
      const payload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') },
      });
      const brokenPinEnv = { ...env, CONTEXTURE_BIN: path.join(tmp.root, 'nope.js'), PATH: `${shimDir.root}:/usr/bin:/bin` };
      const { stdout } = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env: brokenPinEnv, input: payload });
      const decision = JSON.parse(stdout);
      expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
      // A resolution-failure deny, not the scope deny the shim would have produced
      // had CONTEXTURE_BIN fallen through to it — the reason names CONTEXTURE_BIN
      // and not the scope-deny's distinguishing "ctxr session start" instruction.
      expect(decision.hookSpecificOutput.permissionDecisionReason).toContain('CONTEXTURE_BIN');
      expect(decision.hookSpecificOutput.permissionDecisionReason).not.toContain('ctxr session start');
    } finally {
      await tmp.cleanup();
      await shimDir.cleanup();
    }
  });

  it('the fail-closed deny body matches the shape the write-gate command emits for an out-of-scope edit', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = hermeticGitEnv();
      await runCli(['init'], { cwd: tmp.root, env });
      await runCli(['adapters', 'generate'], { cwd: tmp.root, env });

      const scriptPath = path.join(tmp.root, '.claude/hooks/claude-code-write-gate.sh');

      const scopePayload = JSON.stringify({
        cwd: tmp.root,
        tool_name: 'Edit',
        tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') },
      });
      const scopeResult = await execWithStdin('sh', [scriptPath], { cwd: tmp.root, env, input: scopePayload });
      const scopeDecision = JSON.parse(scopeResult.stdout);

      const resolutionResult = await execWithStdin('sh', [scriptPath], {
        cwd: tmp.root,
        env: { ...env, CONTEXTURE_BIN: undefined, PATH: '/usr/bin:/bin' },
        input: scopePayload,
      });
      const resolutionDecision = JSON.parse(resolutionResult.stdout);

      expect(resolutionDecision.hookSpecificOutput.hookEventName).toBe(scopeDecision.hookSpecificOutput.hookEventName);
      expect(resolutionDecision.hookSpecificOutput.permissionDecision).toBe(scopeDecision.hookSpecificOutput.permissionDecision);
      expect(resolutionDecision.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
      expect(scopeDecision.hookSpecificOutput.permissionDecisionReason.length).toBeGreaterThan(0);
    } finally {
      await tmp.cleanup();
    }
  });
});
