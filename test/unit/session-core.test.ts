import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { MIGRATION_STEPS } from '../../src/config/migrations.js';
import { decisionBody } from '../../src/core/approval/decision.js';
import { buildCatalog } from '../../src/core/catalog/build.js';
import { SessionRefusedError } from '../../src/core/errors.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { ghCredentials } from '../../src/core/forge/credentials.js';
import { createGhForgeClient } from '../../src/core/forge/github.js';
import { createExecFileGitRunner, type GitRunner } from '../../src/core/git/exec.js';
import { discardSession } from '../../src/core/session/discard.js';
import { listSessions } from '../../src/core/session/list.js';
import { rebaseSession } from '../../src/core/session/rebase.js';
import { resolveSession, type SessionRef } from '../../src/core/session/resolve.js';
import { sessionStatus } from '../../src/core/session/status.js';
import { submitSession, type SubmitDeps, type SubmitInput } from '../../src/core/session/submit.js';
import { makeApprovalStore, RECORDING_LOGIN, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

/**
 * bring-the-session-lifecycle-into-the-cli: the shared session core against a
 * real canonical clone, a bare origin and the fake `gh` — the fixture `land`
 * and the MCP write tests use, never a mocked git runner (design.md D1, point 3).
 */
describe('the session core (real git, bare origin, fake gh)', () => {
  let store: ApprovalStore;
  let deps: SubmitDeps;
  let git: GitRunner;

  beforeEach(async () => {
    store = await makeApprovalStore();
    const base = createExecFileGitRunner();
    // Every git call runs in the fixture's hermetic environment, as the CLI's own process would.
    git = { run: (args, opts) => base.run(args, { ...opts, env: opts.env ?? store.env }) };
    const credentials = ghCredentials(store.env);
    deps = { git, config: await readConfig(store.root, MIGRATION_STEPS), credentials, forge: createGhForgeClient(store.root, credentials), env: store.env };
  });

  afterEach(async () => {
    await store.tmp.cleanup();
  });

  async function start(label: string): Promise<SessionRef> {
    const started = await runCli(['session', 'start', label, '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
    expect(started.exitCode, started.stdout + started.stderr).toBe(0);
    return resolveSession(git, store.root, deps.config, path.basename(JSON.parse(started.stdout).data.worktree as string), store.root);
  }

  async function edit(session: SessionRef, files: Record<string, string>): Promise<void> {
    for (const [rel, text] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(session.path, rel)), { recursive: true });
      await writeFile(path.join(session.path, rel), text);
    }
    // The catalog follows the change, as the derived-artifacts skill has an agent do before submitting.
    await buildCatalog({ root: session.storeRoot, config: deps.config });
  }

  const input = (overrides: Partial<SubmitInput> = {}): SubmitInput => ({
    branch: 'notes/intro',
    message: 'Rewrite the intro',
    title: 'Rewrite the intro',
    body: 'Why: the intro was out of date.',
    ...overrides,
  });

  const refusal = async (promise: Promise<unknown>): Promise<SessionRefusedError> => {
    const err = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(SessionRefusedError);
    return err as SessionRefusedError;
  };

  const pulls = async () => (await store.forge.read()).pulls;
  const commitsOn = async (ref: string) => Number(await store.git(['rev-list', '--count', `origin/main..${ref}`]));

  it('status reports a session\'s edited and new files as uncommitted, with nothing ahead', async () => {
    await store.advanceMain({ 'projects/a.md': '# A\n' });
    const session = await start('ctx-a-intro');
    await writeFile(path.join(session.path, 'projects/a.md'), '# A\n\nEdited.\n');
    await writeFile(path.join(session.path, 'projects/new.md'), '# New\n');
    const status = await sessionStatus({ ...deps }, session, { diff: true });
    expect(status.uncommitted.map((c) => c.path).sort()).toEqual(['projects/a.md', 'projects/new.md']);
    expect(status.ahead).toBe(0);
    expect(status.base).toBe('origin/main');
    expect(status.diff).toContain('+Edited.');
    expect(status.diff).toContain('+# New');
  });

  it('submits a session: one commit, the renamed branch on the remote, and a pull request whose body ends with the graph diff block', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n\nThe new intro.\n' });
    const result = await submitSession(deps, session, input());

    expect(result).toMatchObject({ branch: 'notes/intro', renamed_from: session.branch, steps: { gate: 'pass', branch: 'renamed', push: 'pushed', pull_request: 'created' } });
    expect(result.steps.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(await commitsOn('origin/notes/intro')).toBe(1);
    const [pull] = await pulls();
    expect(pull).toMatchObject({ number: result.pull_request.number, head: 'notes/intro', title: 'Rewrite the intro', state: 'open' });
    expect(pull!.body!.startsWith('Why: the intro was out of date.\n\n')).toBe(true);
    const block = await runCli(['graph', 'diff', '--since', 'origin/main', '--format', 'markdown'], { cwd: session.storeRoot, env: store.env });
    expect(pull!.body!.endsWith(block.stdout.replace(/\n$/, ''))).toBe(true);
    expect(pull!.body!).toContain('## Knowledge changes');
    expect(pull!.body!).not.toContain('## Pages');
    expect(result.approval_url).toBe(`http://127.0.0.1:1/approve/${encodeURIComponent(session.name)}/`);
  });

  it('adds a Pages section when the change set carries a page, from the publish urls report', async () => {
    const session = await start('ctx-a-page');
    await edit(session, { '.contexture/publish/launch/index.html': '<!doctype html><title>Launch</title>\n' });
    await submitSession(deps, session, input({ branch: 'notes/launch-page' }));
    const [pull] = await pulls();
    const pages = pull!.body!.slice(pull!.body!.indexOf('## Pages'), pull!.body!.indexOf('## Knowledge changes'));
    expect(pages).toContain('`.contexture/publish/launch`');
    expect(pages).toContain('added');
    expect(pages).toMatch(/server can see this session's worktree/);
    expect(pull!.body!.indexOf('## Pages')).toBeLessThan(pull!.body!.indexOf('## Knowledge changes'));
  });

  it('publishes once when a submit whose response was lost is run again', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    await submitSession(deps, session, input());
    const again = await submitSession(deps, await resolveSession(git, store.root, deps.config, session.name, store.root), input());
    expect(again.steps).toMatchObject({ staged: [], commit: null, branch: 'kept', push: 'up-to-date', pull_request: 'found' });
    expect(await pulls()).toHaveLength(1);
    expect(await commitsOn('origin/notes/intro')).toBe(1);
  });

  it('resumes into one pull request after the pull-request step failed', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    await store.forge.update((state) => {
      state.failCreatePull = 1;
    });
    const failed = await refusal(submitSession(deps, session, input()));
    expect(failed.exitCode).toBe(ExitCode.CheckFailed);
    expect(failed.finding).toMatchObject({ code: 'session.pull_request_failed', details: { step: 'pull_request' } });
    const resumed = await submitSession(deps, await resolveSession(git, store.root, deps.config, session.name, store.root), input());
    expect(resumed.steps).toMatchObject({ commit: null, push: 'up-to-date', pull_request: 'created' });
    expect(await pulls()).toHaveLength(1);
  });

  it('answers requested changes on the same pull request: a second commit, the pull request updated', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    const first = await submitSession(deps, session, input());
    const renamed = await resolveSession(git, store.root, deps.config, session.name, store.root);
    await edit(renamed, { 'projects/intro.md': '# Intro\n\nWith the requested change.\n' });
    const second = await submitSession(deps, renamed, input({ message: 'Answer the review', title: 'Rewrite the intro, revised' }));
    expect(second.pull_request.number).toBe(first.pull_request.number);
    expect(second.steps).toMatchObject({ push: 'pushed', pull_request: 'updated' });
    expect(await pulls()).toHaveLength(1);
    expect((await pulls())[0]!.title).toBe('Rewrite the intro, revised');
    expect(await commitsOn('origin/notes/intro')).toBe(2);
  });

  it('commits nothing when a derived file was staged earlier, and leaves the index as it was', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n', '.contexture/cache/stray.json': '{}\n' });
    await store.git(['add', '-f', '.contexture/cache/stray.json'], session.path);
    const indexBefore = await store.git(['diff', '--cached', '--name-only'], session.path);
    const err = await refusal(submitSession(deps, session, input()));
    expect(err.exitCode).toBe(ExitCode.CheckFailed);
    expect(err.finding).toMatchObject({ code: 'session.derived_path_staged', details: { paths: ['.contexture/cache/stray.json'] } });
    expect(await store.git(['diff', '--cached', '--name-only'], session.path)).toBe(indexBefore);
    expect(await commitsOn(session.branch)).toBe(0);
    expect(await pulls()).toHaveLength(0);
  });

  it('stops before the commit when the store-scope check fails', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    await writeFile(path.join(session.path, 'projects/broken.md'), '---\ntitle: [unclosed\n---\nbody\n');
    const err = await refusal(submitSession(deps, session, input()));
    expect(err.exitCode).toBe(ExitCode.CheckFailed);
    expect(err.finding).toMatchObject({ code: 'session.gate_failed', details: { step: 'gate' } });
    expect(await commitsOn(session.branch)).toBe(0);
    expect(await store.git(['ls-remote', 'origin', 'refs/heads/notes/intro'])).toBe('');
    expect(await pulls()).toHaveLength(0);
  });

  it('refuses a body carrying a generated section, and a branch name it may not take, with the usage code', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    for (const body of ['Why.\n\n## Knowledge changes\n\nmine', 'Why.\n\n**Pages**\n\n| a |']) {
      const err = await refusal(submitSession(deps, session, input({ body })));
      expect(err.exitCode).toBe(ExitCode.Usage);
      expect(err.finding.code).toBe('session.body_has_generated_section');
    }
    expect((await refusal(submitSession(deps, session, input({ branch: 'main' })))).finding.code).toBe('session.branch_is_default');
    const other = await start('ctx-b');
    expect((await refusal(submitSession(deps, session, input({ branch: other.branch })))).finding.code).toBe('session.branch_taken');
    expect(await commitsOn(session.branch)).toBe(0);
  });

  it('reports a rebase conflict with both sides, refuses submit until it is resolved, and continues', async () => {
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nOriginal line.\n' });
    const session = await start('ctx-a-intro');
    await store.commitInWorktree(session.path, { 'projects/intro.md': '# Intro\n\nSession line.\n' }, 'session edit');
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nMain line.\n' });

    const conflicted = await rebaseSession(deps, session, 'start');
    expect(conflicted.outcome).toBe('conflict');
    expect(conflicted.conflicts).toEqual([{ path: 'projects/intro.md', default_branch: '# Intro\n\nMain line.\n', session: '# Intro\n\nSession line.\n' }]);

    const during = await resolveSession(git, store.root, deps.config, session.name, store.root);
    expect(during.branch).toBe(session.branch);
    expect((await refusal(submitSession(deps, during, input()))).finding.code).toBe('session.rebase_in_progress');
    expect((await refusal(rebaseSession(deps, during, 'continue'))).finding.code).toBe('session.conflict_unresolved');

    await writeFile(path.join(session.path, 'projects/intro.md'), '# Intro\n\nMain line.\nSession line.\n');
    const continued = await rebaseSession(deps, during, 'continue');
    expect(continued.outcome).toBe('rebased');
    expect(await store.git(['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], session.path)).toBe('');
    expect(await readFile(path.join(session.path, 'projects/intro.md'), 'utf8')).toContain('Session line.');
  });

  it('aborts a conflicted rebase back to where the session was', async () => {
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nOriginal line.\n' });
    const session = await start('ctx-a-intro');
    const head = await store.commitInWorktree(session.path, { 'projects/intro.md': '# Intro\n\nSession line.\n' }, 'session edit');
    await store.advanceMain({ 'projects/intro.md': '# Intro\n\nMain line.\n' });
    expect((await rebaseSession(deps, session, 'start')).outcome).toBe('conflict');
    const aborted = await rebaseSession(deps, session, 'abort');
    expect(aborted).toMatchObject({ outcome: 'aborted', head });
  });

  it('pushes a rebased session with a lease, onto the same pull request', async () => {
    await store.advanceMain({ 'projects/a.md': '# A\n' });
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    await submitSession(deps, session, input());
    await store.advanceMain({ 'notes.txt': 'not a note\n' });
    const renamed = await resolveSession(git, store.root, deps.config, session.name, store.root);
    expect((await rebaseSession(deps, renamed, 'start')).outcome).toBe('rebased');
    const again = await submitSession(deps, renamed, input());
    expect(again.steps).toMatchObject({ commit: null, push: 'pushed-with-lease' });
    expect(await pulls()).toHaveLength(1);
    expect(await store.git(['rev-parse', 'origin/notes/intro'])).toBe(again.head);
  });

  it('discard refuses uncommitted or unpushed work without --force, and refuses what is not a session', async () => {
    const session = await start('ctx-a-intro');
    await writeFile(path.join(session.path, 'projects/x.md'), '# X\n');
    const dirty = await refusal(discardSession(deps, session));
    expect(dirty.exitCode).toBe(ExitCode.CheckFailed);
    expect(dirty.finding).toMatchObject({ code: 'session.discard_uncommitted', details: { paths: ['projects/x.md'] } });
    await store.git(['add', '-A'], session.path);
    await store.git(['commit', '-qm', 'x'], session.path);
    expect((await refusal(discardSession(deps, session))).finding.code).toBe('session.discard_unpushed');
    expect((await store.git(['worktree', 'list'])).includes(session.path)).toBe(true);

    const canonical = await refusal(resolveSession(git, store.root, deps.config, path.basename(store.root), store.root));
    expect(canonical.exitCode).toBe(ExitCode.Usage);
    const outside = path.join(store.tmp.root, 'elsewhere');
    await store.git(['worktree', 'add', '-q', '-b', 'session/elsewhere', outside]);
    const elsewhere = await refusal(resolveSession(git, store.root, deps.config, outside, store.root));
    expect(elsewhere.exitCode).toBe(ExitCode.Usage);
    expect((await store.git(['worktree', 'list'])).includes(outside)).toBe(true);

    const forced = await discardSession(deps, session, { force: true });
    expect(forced).toMatchObject({ removed: true, forced: true, closed_pull_request: null });
    expect((await store.git(['worktree', 'list'])).includes(session.path)).toBe(false);
    expect(await store.git(['branch', '--list', session.branch])).toBe('');
  });

  it('discards a published session cleanly, closing its pull request only when asked', async () => {
    const session = await start('ctx-a-intro');
    await edit(session, { 'projects/intro.md': '# Intro\n' });
    const submitted = await submitSession(deps, session, input());
    const renamed = await resolveSession(git, store.root, deps.config, session.name, store.root);
    const result = await discardSession(deps, renamed, { closePullRequest: true });
    expect(result).toMatchObject({ removed: true, forced: false, closed_pull_request: submitted.pull_request.number });
    expect((await pulls())[0]!.state).toBe('closed');
    expect(await store.git(['ls-remote', 'origin', 'refs/heads/notes/intro'])).not.toBe('');
  });

  it('lists each session\'s local state, and with review its pull request and requested changes', async () => {
    const quiet = await start('ctx-quiet');
    await writeFile(path.join(quiet.path, 'projects/q.md'), '# Q\n');
    const opened = await store.openSession('ctx-c', 3, { 'projects/c.md': '# C\n' });
    await store.forge.update((state) => {
      const at = new Date().toISOString();
      (state.reviews ??= {})[3] = [
        {
          user: { login: RECORDING_LOGIN },
          state: 'CHANGES_REQUESTED',
          body: decisionBody({ decision: 'request-changes', head: opened.head, by: 'b@example.com', at, carriedFrom: null, comment: 'Name the source.' }),
          commit_id: opened.head,
          submitted_at: at,
        },
      ];
    });

    const local = await listSessions(git, store.root, deps.config);
    const byName = Object.fromEntries(local.sessions.map((s) => [s.name, s]));
    expect(byName[quiet.name]).toMatchObject({ uncommitted: true, ahead: 0 });
    expect(byName[quiet.name]!.pull_request).toBeUndefined();
    expect(byName[opened.name]).toMatchObject({ uncommitted: false, ahead: 1 });

    const reviewed = await listSessions(git, store.root, deps.config, { review: { forge: deps.forge, recordingLogin: RECORDING_LOGIN } });
    const rows = Object.fromEntries(reviewed.sessions.map((s) => [s.name, s]));
    expect(rows[opened.name]).toMatchObject({ pull_request: { number: 3, state: 'open' }, review: { state: 'changes-requested', comment: 'Name the source.' } });
    expect(rows[quiet.name]).toMatchObject({ pull_request: null, review: null });

    await store.forge.update((state) => {
      state.fail = { pulls: 502 };
    });
    const unreachable = await listSessions(git, store.root, deps.config, { review: { forge: deps.forge, recordingLogin: RECORDING_LOGIN } });
    expect(unreachable.forge_reachable).toBe(false);
    expect(unreachable.sessions.find((s) => s.name === opened.name)).toMatchObject({ pull_request: { number: null, state: 'unknown' }, review: { state: 'unknown' } });
  });
});
