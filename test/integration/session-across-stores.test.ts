import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseSessionMarker, sessionMarker } from '../../src/core/approval/session-marker.js';
import { runCli } from '../helpers/run-cli.js';
import { makeSessionPair, type SessionPair } from '../helpers/session-stores.js';

/**
 * approve-sessions-across-stores, write-lifecycle: joining a session from a
 * mount, and the session marker `ctxr session submit` writes.
 */
describe('a session joined across stores (real CLI, fake forges)', () => {
  let pair: SessionPair;

  beforeEach(async () => {
    pair = await makeSessionPair();
  });

  afterEach(async () => {
    await pair.tmp.cleanup();
  });

  const codes = (r: { json: any }): string[] => (r.json.findings as { code: string }[]).map((f) => f.code);

  async function startHome(): Promise<{ name: string; branch: string }> {
    const started = await pair.cli(['session', 'start', 'ctx-move'], pair.a.root);
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    return { name: path.basename(started.json.data.worktree), branch: started.json.data.branch };
  }

  it('starts a joined session whose branch names its home, and reports the session', async () => {
    const home = await startHome();
    const homeTail = home.branch.slice('session/'.length);

    const started = await pair.cli(['session', 'start'], pair.a.root);
    expect(started.json.data.session).toEqual({ home: 'example/ctx-a', branch: started.json.data.branch });

    const joined = await pair.cli(['session', 'start', '--joins', home.branch], pair.mount);
    expect(joined.exitCode, joined.stdout + joined.stderr).toBe(0);
    expect(joined.json.data.branch).toBe(`session/example/ctx-a/${homeTail}`);
    expect(joined.json.data.session).toEqual({ home: 'example/ctx-a', branch: home.branch });
    expect(path.dirname(path.dirname(joined.json.data.worktree))).toBe(pair.mount);
    // By worktree name as well as by branch.
    await pair.git(['worktree', 'remove', '--force', joined.json.data.worktree], pair.mount);
    await pair.git(['branch', '-D', joined.json.data.branch], pair.mount);
    const byName = await pair.cli(['session', 'start', '--joins', home.name], pair.mount);
    expect(byName.exitCode, byName.stdout).toBe(0);
    expect(byName.json.data.session).toEqual({ home: 'example/ctx-a', branch: home.branch });
  });

  it('refuses to join from a store that is not a mount, or a session that does not exist, creating nothing', async () => {
    const home = await startHome();
    const worktreesBefore = await pair.git(['worktree', 'list', '--porcelain'], pair.b.root);
    const branchesBefore = await pair.git(['branch', '--list'], pair.b.root);

    const outside = await pair.cli(['session', 'start', '--joins', home.branch], pair.b.root);
    expect(outside.exitCode).toBe(2);
    expect(codes(outside)).toEqual(['session.join_not_a_mount']);
    expect(await pair.git(['worktree', 'list', '--porcelain'], pair.b.root)).toBe(worktreesBefore);
    expect(await pair.git(['branch', '--list'], pair.b.root)).toBe(branchesBefore);

    const mountBranches = await pair.git(['branch', '--list'], pair.mount);
    const unknown = await pair.cli(['session', 'start', '--joins', 'session/20990101-000000-nope'], pair.mount);
    expect(unknown.exitCode).toBe(2);
    expect(codes(unknown)).toEqual(['session.join_unknown_session']);
    expect(await pair.git(['branch', '--list'], pair.mount)).toBe(mountBranches);
    const worktrees = await readdir(path.join(pair.mount, '.worktrees')).catch(() => []);
    expect(worktrees).toEqual([]);
  });

  it('submit appends the session marker to the body it composes, and refuses a body that carries one', async () => {
    const home = await startHome();
    const joined = await pair.cli(['session', 'start', '--joins', home.name], pair.mount);
    const worktree = joined.json.data.worktree as string;
    await mkdir(path.join(worktree, 'projects'), { recursive: true });
    await writeFile(path.join(worktree, 'projects', 'moved.md'), '# Moved\n\nA note moved into ctx-b.\n');
    expect((await runCli(['catalog', 'build'], { cwd: worktree, env: pair.env, timeoutMs: 60_000 })).exitCode).toBe(0);
    const name = path.basename(worktree);
    const base = ['session', 'submit', name, '--branch', 'notes/move', '--message', 'Move a note', '--title', 'Move a note'];

    const claimed = await pair.cli([...base, '--body', `Why: move it.\n\n${sessionMarker({ home: 'example/ctx-a', branch: 'session/other' })}`], pair.mount);
    expect(claimed.exitCode).toBe(2);
    expect(codes(claimed)).toEqual(['session.body_has_session_marker']);
    expect((await pair.b.forge.read()).pulls).toEqual([]);

    const submitted = await pair.cli([...base, '--body', 'Why: move it.'], pair.mount);
    expect(submitted.exitCode, submitted.stdout + submitted.stderr).toBe(0);
    const [pull] = (await pair.b.forge.read()).pulls;
    expect(pull!.body).toMatch(new RegExp(`${sessionMarker({ home: 'example/ctx-a', branch: home.branch }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
    expect(parseSessionMarker(pull!.body)).toEqual({ home: 'example/ctx-a', branch: home.branch });
    // The hand-off names the home store's approval page, by the home session's name.
    expect(submitted.json.data.approval_url).toBe(`https://ctx-a.example.test/approve/${home.name}/`);
    expect(submitted.json.data.session_identity).toEqual({ home: 'example/ctx-a', branch: home.branch });
  });
});
