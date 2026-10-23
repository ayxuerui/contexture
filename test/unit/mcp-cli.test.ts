import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkArguments, childEnv, type CliToolResult } from '../../src/core/mcp/tools/cli.js';
import { CTXR_READ_COMMANDS, CTXR_WRITE_COMMANDS } from '../../src/core/mcp/tool-map.js';
import { makeMcpWriteFixture, type McpWriteFixture } from '../helpers/mcp-write.js';

/**
 * serve-the-session-lifecycle-to-chat-apps tasks 4.1–4.2 (remote-access spec,
 * *`ctxr` and `ctxr_write` run allowlisted CLI commands confined to one
 * checkout*): the server's own CLI, spawned as argv against the served commit
 * or a member's session, with every refusal made before anything runs and
 * every protected change a command makes undone after it.
 */
describe('mcp ctxr and ctxr_write', () => {
  let f: McpWriteFixture;
  let session: string;
  let root: string;
  let worktree: string;

  beforeEach(async () => {
    f = await makeMcpWriteFixture();
    await f.store.advanceMain({ 'projects/a.md': '# A\n\nThe plan.\n\n<!-- contexture:log -->\n<!-- /contexture:log -->\n' }, 'advance main', { catalogued: true });
    ({ session, root } = await f.start('work'));
    worktree = path.join(f.store.root, root);
  });

  afterEach(async () => {
    await f.store.tmp.cleanup();
  });

  const ctxr = (args: Record<string, unknown>, email?: string) => f.call('ctxr', args, email) as Promise<unknown> as Promise<CliToolResult>;
  const ctxrWrite = (args: Record<string, unknown>, email?: string) => f.call('ctxr_write', args, email) as Promise<unknown> as Promise<CliToolResult>;
  const hooks = async () => {
    const dir = path.join(worktree, '.githooks');
    const names = (await readdir(dir)).sort();
    return Promise.all(names.map(async (n) => [n, await readFile(path.join(dir, n), 'utf8')]));
  };

  it("runs a skill's lint step in the member's session and returns its exit code and output", async () => {
    await f.call('Write', { file_path: `${root}projects/new.md`, content: '# New\n\nSee [[nowhere-at-all]].\n' });
    const result = await ctxr({ args: ['lint', '--json'], session });
    expect(result).toMatchObject({ command: 'lint', exit_code: 0, timed_out: false, ran_against: { session, root } });
    const envelope = JSON.parse(result.stdout) as { command: string; store_root?: string };
    expect(envelope.command).toBe('lint');
    // The session's uncommitted note is what the command sees; the served commit has no such file.
    expect((await ctxr({ args: ['source', 'hash', `${root}projects/new.md`], session })).exit_code).toBe(0);
    expect((await ctxr({ args: ['source', 'hash', 'projects/new.md'] })).exit_code).not.toBe(0);
  });

  it('runs against the served commit without a session', async () => {
    const result = await ctxr({ args: ['doctor', '--json'] });
    expect(result.ran_against).toEqual({ commit: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(result.exit_code).toBe(0);
    const shown = await ctxr({ args: ['catalog', 'show', '--section', 'projects'] });
    expect(shown.stdout).toContain('projects/a.md');
  });

  it('refuses a write command without a session, outside the allowlists, and for another member', async () => {
    await expect(ctxrWrite({ args: ['ingest', 'raw/inbox/x.md', '--into', 'projects/a.md', '--source-type', 'web', '--source-id', 'x'] })).rejects.toMatchObject({ code: 'mcp.no_session' });
    await expect(ctxr({ args: ['ingest', 'raw/inbox/x.md'] })).rejects.toMatchObject({ code: 'mcp.command_not_allowed' });
    await expect(ctxr({ args: ['update'] })).rejects.toMatchObject({ code: 'mcp.command_not_allowed' });
    await expect(ctxr({ args: ['serve'] })).rejects.toMatchObject({ code: 'mcp.command_not_allowed' });
    await expect(ctxrWrite({ args: ['session', 'submit', session], session })).rejects.toMatchObject({ code: 'mcp.command_not_allowed' });
    await expect(ctxrWrite({ args: ['catalog', 'build'], session }, 'b@example.com')).rejects.toMatchObject({ code: 'mcp.no_session' });
  });

  it('refuses the root option and any path leaving the checkout before anything runs', async () => {
    await expect(ctxr({ args: ['lint', '--root', '/'] })).rejects.toMatchObject({ code: 'mcp.root_option' });
    await expect(ctxr({ args: ['lint', '--root=/etc'] })).rejects.toMatchObject({ code: 'mcp.root_option' });
    await expect(ctxr({ args: ['source', 'hash', '../ctx-b/work/a.md'] })).rejects.toMatchObject({ code: 'mcp.path_outside_store' });
    await expect(ctxr({ args: ['source', 'hash', '/etc/passwd'] })).rejects.toMatchObject({ code: 'mcp.path_outside_store' });
    await expect(ctxr({ args: ['source', 'hash', 'contexture.yaml'] })).rejects.toMatchObject({ code: 'mcp.path_protected' });
  });

  it('refuses a ctxr_write naming <root>/.githooks/pre-commit, changing no hook', async () => {
    const before = await hooks();
    await expect(ctxrWrite({ args: ['entry', 'append', `${root}.githooks/pre-commit`, '--region', 'x', '--text', 'echo owned'], session })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    await expect(ctxrWrite({ args: ['entry', 'append', `/${root}.githooks/pre-commit`, '--region', 'x', '--text', 'echo owned'], session })).rejects.toMatchObject({ code: 'mcp.path_protected' });
    expect(await hooks()).toEqual(before);
  });

  it('restores and refuses a command whose output lands on a protected path, keeping the rest', async () => {
    const before = await hooks();
    const proposal = [
      'notes:',
      '  - path: .githooks/post-checkout',
      '    mode: create',
      '    body: "#!/bin/sh\\necho owned"',
      '  - path: .githooks/pre-commit',
      '    mode: append',
      '    body: "echo owned"',
      '  - path: projects/kept.md',
      '    mode: create',
      '    body: "# Kept"',
    ].join('\n');
    const refused = ctxrWrite({ args: ['session', 'capture', '--proposal', '@input'], input: proposal, session });
    await expect(refused).rejects.toMatchObject({ code: 'mcp.path_protected', details: { paths: expect.arrayContaining([`${root}.githooks/post-checkout`, `${root}.githooks/pre-commit`]) } });
    expect(await hooks()).toEqual(before);
    expect(await f.store.git(['status', '--porcelain'], worktree)).toBe('?? projects/kept.md');
    // The input file was written under the session's cache path and removed afterwards.
    expect(await readdir(path.join(worktree, '.contexture/cache/mcp')).catch(() => [])).toEqual([]);
  });

  it("regenerates the entry document after a guidance edit, as ctxr-session-capture asks, changing nothing protected", async () => {
    const guidance = f.write.config.harness.guidance_path.replace(/\/*$/, '/');
    await f.call('Write', { file_path: `${root}${guidance}house-test.md`, content: '# House test\n\nAlways cite the source note.\n' });
    const before = await hooks();
    const updated = await ctxrWrite({ args: ['update'], session });
    expect(updated.exit_code).toBe(0);
    expect(await hooks()).toEqual(before);
    expect(await readFile(path.join(worktree, 'AGENTS.md'), 'utf8')).toContain('Always cite the source note.');
    const changed = (await f.store.git(['status', '--porcelain'], worktree)).split('\n').map((l) => l.replace(/^\s*\S+\s+/, '')).sort();
    expect(changed).toEqual(['AGENTS.md', `${guidance}house-test.md`].sort());
  });

  it('runs a writing command in the session, with session-root paths and @input', async () => {
    const appended = await ctxrWrite({ args: ['entry', 'append', `${root}projects/a.md`, '--region', 'log', '--text', '- filed the plan'], session });
    expect(appended).toMatchObject({ exit_code: 0, args: ['entry', 'append', 'projects/a.md', '--region', 'log', '--text', '- filed the plan'] });
    expect(await readFile(path.join(worktree, 'projects/a.md'), 'utf8')).toContain('- filed the plan');
    const captured = await ctxrWrite({ args: ['session', 'capture', '--proposal', '@input'], input: 'notes:\n  - path: projects/from-input.md\n    mode: create\n    body: "# From input"\n', session });
    expect(captured.exit_code).toBe(0);
    expect(existsSync(path.join(worktree, 'projects/from-input.md'))).toBe(true);
    expect(existsSync(path.join(f.store.root, 'projects/from-input.md'))).toBe(false);
    await expect(ctxrWrite({ args: ['session', 'capture', '--proposal', '@input'], session })).rejects.toMatchObject({ code: 'mcp.invalid_arguments' });
  });

  it('stops a run at the time bound', async () => {
    f.ctx.cliTimeoutMs = 1;
    const result = await ctxr({ args: ['doctor'], session });
    expect(result).toMatchObject({ timed_out: true, exit_code: null });
  });

  it('strips forge credentials from the child environment and sets the store root', () => {
    const env = childEnv({ PATH: '/bin', GH_TOKEN: 't', GITHUB_TOKEN: 't', CONTEXTURE_GITHUB_APP_PRIVATE_KEY: 'k', MY_API_TOKEN: 't', CONTEXTURE_STORE_ROOT: '/elsewhere', HOME: '/home/x' }, '/store/w', '/store/w/.contexture/cache/mcp');
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/home/x', CONTEXTURE_STORE_ROOT: '/store/w', GIT_TERMINAL_PROMPT: '0' });
    for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'CONTEXTURE_GITHUB_APP_PRIVATE_KEY', 'MY_API_TOKEN']) expect(env[key]).toBeUndefined();
    expect(env.GH_CONFIG_DIR).toBe('/store/w/.contexture/cache/mcp/no-gh-config');
  });

  it('matches the command path before any option, and leaves prose alone', () => {
    const config = f.write.config;
    expect(checkArguments(['graph', 'query', 'neighbors', 'projects/a.md'], CTXR_READ_COMMANDS, 'ctxr', config, null).command).toBe('graph query');
    expect(() => checkArguments(['--json', 'lint'], CTXR_READ_COMMANDS, 'ctxr', config, null)).toThrow(/not a command/);
    expect(checkArguments(['entry', 'append', 'projects/a.md', '--region', 'log', '--text', 'see ../../elsewhere for more'], CTXR_WRITE_COMMANDS, 'ctxr_write', config, '.worktrees/s/').argv).toContain('see ../../elsewhere for more');
    expect(() => checkArguments(['source', 'stamp', '--id=x', '--hash=../../x'], CTXR_WRITE_COMMANDS, 'ctxr_write', config, null)).toThrow(/outside/);
  });
});
