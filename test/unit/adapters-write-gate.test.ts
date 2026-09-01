import { mkdir, symlink } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { execute } from '../../src/commands/adapters-write-gate.js';
import { execute as init } from '../../src/commands/init.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { collectingStream, fakeGitRunner, makeFakeEnv, readAll } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

/** A real, schema-valid store on disk (via the real `init` command against a fake git runner), for `openStore` to resolve. */
async function makeStore(root: string): Promise<void> {
  const env = makeFakeEnv({ cwd: root, env: GIT_IDENTITY });
  await init(env, { root, profile: 'para' });
}

function stdinWith(payload: unknown): PassThrough & { isTTY?: boolean } {
  const stdin = Object.assign(new PassThrough(), { isTTY: false });
  stdin.end(JSON.stringify(payload));
  return stdin;
}

function envFor(root: string, stdin: PassThrough): { env: ReturnType<typeof makeFakeEnv>; stdout: ReturnType<typeof collectingStream> } {
  const stdout = collectingStream();
  const { git } = fakeGitRunner(new Map([['rev-parse --is-inside-work-tree', { exitCode: 0, stdout: 'true\n', stderr: '' }]]));
  const env = makeFakeEnv({ cwd: root, io: { stdin, stdout, stderr: collectingStream() }, git });
  return { env, stdout };
}

describe('adapters write-gate', () => {
  it('denies an Edit targeting a root-level file, naming the store root in the reason', async () => {
    const tmp = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const { env, stdout } = envFor(
        tmp.root,
        stdinWith({ cwd: tmp.root, tool_name: 'Edit', tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') } }),
      );

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      const output = JSON.parse(readAll(stdout));
      expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets an Edit inside the active session worktree through with no output', async () => {
    const tmp = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const worktreeFile = path.join(tmp.root, '.worktrees', 'sess1', 'notes', 'foo.md');
      const { env, stdout } = envFor(
        tmp.root,
        stdinWith({ cwd: tmp.root, tool_name: 'Write', tool_input: { file_path: worktreeFile } }),
      );

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      expect(readAll(stdout)).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets an Edit outside the store entirely through with no output', async () => {
    const tmp = await makeTmpDir();
    const outside = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const { env, stdout } = envFor(
        tmp.root,
        stdinWith({ cwd: tmp.root, tool_name: 'Edit', tool_input: { file_path: path.join(outside.root, 'file.md') } }),
      );

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      expect(readAll(stdout)).toBe('');
    } finally {
      await tmp.cleanup();
      await outside.cleanup();
    }
  });

  it('denies a symlink escape even when the nominal path is inside the worktree tree', async () => {
    const tmp = await makeTmpDir();
    const outside = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      await mkdir(path.join(tmp.root, '.worktrees', 'sess1'), { recursive: true });
      await symlink(outside.root, path.join(tmp.root, '.worktrees', 'sess1', 'linked'));
      const target = path.join(tmp.root, '.worktrees', 'sess1', 'linked', 'note.md');
      const { env, stdout } = envFor(tmp.root, stdinWith({ cwd: tmp.root, tool_name: 'Edit', tool_input: { file_path: target } }));

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      const output = JSON.parse(readAll(stdout));
      expect(output.hookSpecificOutput.permissionDecision).toBe('deny');
      expect(output.hookSpecificOutput.permissionDecisionReason).toContain('symbolic link');
    } finally {
      await tmp.cleanup();
      await outside.cleanup();
    }
  });

  it('exits nonzero, never 2, on unparseable stdin — a hook bug must never hard-block', async () => {
    const tmp = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const stdin = Object.assign(new PassThrough(), { isTTY: false });
      stdin.end('not json at all {{{');
      const { env, stdout } = envFor(tmp.root, stdin);

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).not.toBe(0);
      expect(exitCode).not.toBe(2);
      expect(readAll(stdout)).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes a non-gated tool (e.g. Read) through with no output', async () => {
    const tmp = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const { env, stdout } = envFor(
        tmp.root,
        stdinWith({ cwd: tmp.root, tool_name: 'Read', tool_input: { file_path: path.join(tmp.root, 'AGENTS.md') } }),
      );

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      expect(readAll(stdout)).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });

  it('passes through when tool_input carries no path', async () => {
    const tmp = await makeTmpDir();
    try {
      await makeStore(tmp.root);
      const { env, stdout } = envFor(tmp.root, stdinWith({ cwd: tmp.root, tool_name: 'Edit', tool_input: {} }));

      const exitCode = await execute(env, { root: tmp.root });
      expect(exitCode).toBe(ExitCode.Ok);
      expect(readAll(stdout)).toBe('');
    } finally {
      await tmp.cleanup();
    }
  });
});
