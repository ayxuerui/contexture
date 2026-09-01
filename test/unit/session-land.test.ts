import { describe, expect, it } from 'vitest';
import type { ForgeAdapter, MergeMethod, PullRequestState } from '../../src/adapters/forge/types.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { execute } from '../../src/commands/session-land.js';
import {
  MergeNotConfirmedError,
  NoForgeConfiguredError,
  PullRequestClosedError,
  PullRequestHeadMismatchError,
  PullRequestNotMergeableError,
  SessionLandConsentRequiredError,
  SessionLandOnDefaultBranchError,
} from '../../src/core/errors.js';
import type { GitResult, GitRunner } from '../../src/core/git/exec.js';
import type { Store } from '../../src/core/store.js';
import { collectingStream, fakeGitRunner, fakePrompter, makeFakeEnv } from '../helpers/fake-env.js';

/**
 * The shared fake keys responses on the argv alone; landing now cares WHICH
 * checkout each command ran in (the canonical clone vs. a session worktree),
 * so these fixtures key on `<cwd> <argv>` first and fall back to the argv.
 */
function cwdGitRunner(responses: Map<string, GitResult>): { git: GitRunner; calls: { cwd: string; args: string[] }[] } {
  const calls: { cwd: string; args: string[] }[] = [];
  return {
    calls,
    git: {
      async run(args, opts) {
        const cwd = opts.cwd;
        calls.push({ cwd, args: [...args] });
        const argv = args.join(' ');
        return responses.get(`${cwd} ${argv}`) ?? responses.get(argv) ?? { stdout: '', stderr: '', exitCode: 0 };
      },
    },
  };
}

/** A clone at /repo on the default branch, with one session worktree beside it. */
const TWO_WORKTREES = [
  'worktree /repo',
  'HEAD aaaa',
  'branch refs/heads/main',
  '',
  'worktree /repo/.worktrees/session-abc',
  'HEAD bbbb',
  'branch refs/heads/topic/x',
  '',
].join('\n');

function makeConfig(): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: [], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
    adapters: [{ id: 'github', kind: 'forge' }],
  };
}

const STORE: Store = { root: '/repo', config: makeConfig() };

interface FakeForgeOptions {
  initial: Omit<PullRequestState, 'state'> & { state: PullRequestState['state'] };
  /** What pullRequest returns AFTER mergePullRequest is called — defaults to the same PR with state 'merged'. */
  afterMerge?: PullRequestState;
}

function fakeForge(opts: FakeForgeOptions): { adapter: ForgeAdapter; pullRequestCalls: string[]; mergeCalls: [number, MergeMethod][] } {
  const pullRequestCalls: string[] = [];
  const mergeCalls: [number, MergeMethod][] = [];
  let merged = false;
  const adapter: ForgeAdapter = {
    id: 'github',
    kind: 'forge',
    interfaceVersion: 2,
    async isAvailable() {
      return true;
    },
    async openPullRequest() {
      throw new Error('not used in this fixture');
    },
    async pullRequest(_cwd, ref) {
      pullRequestCalls.push(ref);
      if (merged) return opts.afterMerge ?? { ...opts.initial, state: 'merged' };
      return opts.initial;
    },
    async mergePullRequest(_cwd, number, method) {
      mergeCalls.push([number, method]);
      merged = true;
    },
  };
  return { adapter, pullRequestCalls, mergeCalls };
}

/** Non-interactive by construction (both streams default isTTY: false) — matches a CI/script default. */
function nonInteractiveEnv(overrides: Parameters<typeof makeFakeEnv>[0] = {}) {
  return makeFakeEnv(overrides);
}

function interactiveEnv(confirmResponse: boolean, overrides: Parameters<typeof makeFakeEnv>[0] = {}) {
  const { prompter, confirmCalls } = fakePrompter('para', confirmResponse);
  const io = { stdin: collectingStream(true), stdout: collectingStream(true), stderr: collectingStream(false) };
  return { env: makeFakeEnv({ prompter, io, ...overrides }), confirmCalls };
}

const OPEN_MERGEABLE: PullRequestState = {
  number: 5,
  url: 'https://example.com/pull/5',
  title: 'Topic X',
  state: 'open',
  mergeable: 'mergeable',
  headBranch: 'topic/x',
};

describe('session land (session-submit-and-land D1): the state machine', () => {
  it('lands a mergeable session: merges, confirms merged, and syncs a root checkout already on the default branch', async () => {
    const { adapter, mergeCalls, pullRequestCalls } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git, calls } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.data).toMatchObject({ merged: true, gate: 'confirmed', sync: { attempted: true, synced: true } });
    expect(mergeCalls).toEqual([[5, 'squash']]);
    expect(pullRequestCalls).toEqual(['topic/x', 'topic/x']); // initial read, then the post-merge confirmation
    expect(calls.some((c) => c.join(' ') === 'merge --ff-only origin/main')).toBe(true);
  });

  it('respects --merge-method', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: OPEN_MERGEABLE });
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await execute(env, STORE, { branch: 'topic/x', yes: true, mergeMethod: 'rebase' }, [adapter]);
    expect(mergeCalls).toEqual([[5, 'rebase']]);
  });

  it('a conflicting pull request stops before any side effect', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: { ...OPEN_MERGEABLE, mergeable: 'conflicting' } });
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });

    await expect(execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter])).rejects.toBeInstanceOf(
      PullRequestNotMergeableError,
    );
    expect(mergeCalls).toEqual([]);
  });

  it('an unknown mergeability re-queries once, then stops if still unknown', async () => {
    let calls = 0;
    const adapter: ForgeAdapter = {
      id: 'github',
      kind: 'forge',
      interfaceVersion: 2,
      async isAvailable() {
        return true;
      },
      async openPullRequest() {
        throw new Error('unused');
      },
      async pullRequest() {
        calls += 1;
        return { ...OPEN_MERGEABLE, mergeable: 'unknown' };
      },
      async mergePullRequest() {
        throw new Error('must not merge on an unresolved mergeability');
      },
    };
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter])).rejects.toBeInstanceOf(
      PullRequestNotMergeableError,
    );
    expect(calls).toBe(2); // the initial read, plus exactly one re-query
  });

  it('a closed pull request is refused, nothing merged', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: { ...OPEN_MERGEABLE, state: 'closed' } });
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter])).rejects.toBeInstanceOf(
      PullRequestClosedError,
    );
    expect(mergeCalls).toEqual([]);
  });

  it('gate declined: nothing merged, the command still succeeds', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: OPEN_MERGEABLE });
    const { env, confirmCalls } = interactiveEnv(false, { git: fakeGitRunner().git });

    const outcome = await execute(env, STORE, { branch: 'topic/x' }, [adapter]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.data).toMatchObject({ merged: false, gate: 'declined' });
    expect(mergeCalls).toEqual([]);
    expect(confirmCalls).toHaveLength(1);
  });

  it('gate confirmed interactively (no --yes) merges', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: OPEN_MERGEABLE });
    const { env } = interactiveEnv(true, { git: fakeGitRunner().git });
    const outcome = await execute(env, STORE, { branch: 'topic/x' }, [adapter]);
    expect(outcome.data?.gate).toBe('confirmed');
    expect(mergeCalls).toEqual([[5, 'squash']]);
  });

  it('--no-input without --yes fails before reading or changing anything on the forge', async () => {
    let forgeTouched = false;
    const adapter: ForgeAdapter = {
      id: 'github',
      kind: 'forge',
      interfaceVersion: 2,
      async isAvailable() {
        forgeTouched = true;
        return true;
      },
      async openPullRequest() {
        throw new Error('unused');
      },
      async pullRequest() {
        forgeTouched = true;
        throw new Error('must not be called');
      },
      async mergePullRequest() {
        throw new Error('must not be called');
      },
    };
    const { git, calls } = fakeGitRunner();
    const env = nonInteractiveEnv({ git, noInput: true });

    await expect(execute(env, STORE, { branch: 'topic/x' }, [adapter])).rejects.toBeInstanceOf(
      SessionLandConsentRequiredError,
    );
    expect(forgeTouched).toBe(false);
    expect(calls).toEqual([]);
  });

  it('a retry after a merge-then-crash performs only what remains: skips the merge arm, still syncs', async () => {
    const { adapter, mergeCalls, pullRequestCalls } = fakeForge({ initial: { ...OPEN_MERGEABLE, state: 'merged' } });
    const { git } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);

    expect(outcome.data).toMatchObject({ merged: true, gate: 'not_required', sync: { synced: true } });
    expect(mergeCalls).toEqual([]); // never replayed
    expect(pullRequestCalls).toEqual(['topic/x']); // one read; already merged, no re-confirmation needed
  });

  it('a root checkout off the default branch is reported, not forced', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git } = fakeGitRunner(
      new Map([['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'session/other\n', stderr: '' }]]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.data?.merged).toBe(true);
    expect(outcome.data?.sync).toEqual({
      attempted: false,
      synced: false,
      reason: 'the canonical clone (/repo) is not on the default branch',
    });
  });

  it('a diverged root checkout (fast-forward fails) is reported, not forced', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 1, stdout: '', stderr: 'not possible to fast-forward' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);
    expect(outcome.data?.sync).toEqual({
      attempted: true,
      synced: false,
      reason: 'cannot fast-forward (diverged from origin)',
    });
  });

  it('the summary names why a step did not happen, attempted or not', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git } = fakeGitRunner(
      new Map([['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'session/other\n', stderr: '' }]]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);

    // neither step was attempted, and the summary still carries both reasons the JSON outcome holds
    expect(outcome.humanSummary).toContain('sync skipped: the canonical clone (/repo) is not on the default branch');
    expect(outcome.humanSummary).toContain('reap skipped: pass --reap');
  });

  it('the merge succeeding on the forge but not reading back as merged is a distinct error', async () => {
    const adapter: ForgeAdapter = {
      id: 'github',
      kind: 'forge',
      interfaceVersion: 2,
      async isAvailable() {
        return true;
      },
      async openPullRequest() {
        throw new Error('unused');
      },
      async pullRequest() {
        return OPEN_MERGEABLE; // never flips to merged, even after mergePullRequest
      },
      async mergePullRequest() {
        // no-op: simulates a transport error that hid a real merge, or a merge that silently failed
      },
    };
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter])).rejects.toBeInstanceOf(
      MergeNotConfirmedError,
    );
  });

  it('refuses to land the default branch, before any forge call', async () => {
    let touched = false;
    const adapter: ForgeAdapter = {
      id: 'github',
      kind: 'forge',
      interfaceVersion: 2,
      async isAvailable() {
        touched = true;
        return true;
      },
      async openPullRequest() {
        throw new Error('unused');
      },
      async pullRequest() {
        throw new Error('must not be called');
      },
      async mergePullRequest() {
        throw new Error('must not be called');
      },
    };
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { branch: 'main', yes: true }, [adapter])).rejects.toBeInstanceOf(
      SessionLandOnDefaultBranchError,
    );
    expect(touched).toBe(false);
  });

  it('--pr alone resolves its target from the head branch, from a checkout on the default branch', async () => {
    const { adapter, mergeCalls, pullRequestCalls } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }], // the invoking checkout IS the clone, on main
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { pr: 5, yes: true }, [adapter]);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.data).toMatchObject({ branch: 'topic/x', merged: true, sync: { synced: true } });
    expect(mergeCalls).toEqual([[5, 'squash']]);
    expect(pullRequestCalls).toEqual(['5', '5']); // addressed by number throughout, never by the invoking branch
  });

  it('--pr naming a pull request whose head is the default branch is refused, nothing merged', async () => {
    const { adapter, mergeCalls } = fakeForge({ initial: { ...OPEN_MERGEABLE, headBranch: 'main' } });
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });

    await expect(execute(env, STORE, { pr: 5, yes: true }, [adapter])).rejects.toBeInstanceOf(
      SessionLandOnDefaultBranchError,
    );
    expect(mergeCalls).toEqual([]);
  });

  it('--branch still wins over --pr, and a head mismatch is still refused', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE }); // head is topic/x
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { pr: 5, branch: 'topic/y', yes: true }, [adapter])).rejects.toBeInstanceOf(
      PullRequestHeadMismatchError,
    );
  });

  it('refuses when the resolved head branch differs from the branch requested', async () => {
    const { adapter } = fakeForge({ initial: { ...OPEN_MERGEABLE, headBranch: 'topic/y' } });
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter])).rejects.toBeInstanceOf(
      PullRequestHeadMismatchError,
    );
  });

  it('no forge configured throws before doing anything', async () => {
    const store: Store = { root: '/repo', config: { ...makeConfig(), adapters: [] } };
    const env = nonInteractiveEnv({ git: fakeGitRunner().git });
    await expect(execute(env, store, { branch: 'topic/x', yes: true }, [])).rejects.toBeInstanceOf(
      NoForgeConfiguredError,
    );
  });
});

describe('session land --reap (D3): opt-in and scoped', () => {
  it('removes only a clean, merged, session-created worktree — not the one it is currently running from', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const porcelain = ['worktree /repo', 'HEAD aaaa', 'branch refs/heads/main', '', 'worktree /repo/.worktrees/session-abc', 'HEAD bbbb', 'branch refs/heads/topic/x', ''].join('\n');
    const { git, calls } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
        ['worktree list --porcelain', { exitCode: 0, stdout: porcelain, stderr: '' }],
        ['status --porcelain', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });

    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true, reap: true }, [adapter]);

    expect(outcome.data?.reap).toEqual({ attempted: true, reaped: true });
    expect(calls.some((c) => c.join(' ') === 'worktree remove /repo/.worktrees/session-abc')).toBe(true);
    expect(calls.some((c) => c.join(' ') === 'branch -d topic/x')).toBe(true);
  });

  it('refuses to remove the worktree it is running from, but still syncs the canonical clone', async () => {
    // Realistic self-referential case: `session land` invoked from INSIDE the worktree it would otherwise
    // reap, so store.root IS that worktree's path, and its branch has been renamed away from the session/
    // prefix. The clone is a different checkout, so synchronizing it is both safe and the whole point.
    const selfStore: Store = { root: '/repo/.worktrees/session-abc', config: makeConfig() };
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git, calls } = cwdGitRunner(
      new Map([
        ['worktree list --porcelain', { exitCode: 0, stdout: TWO_WORKTREES, stderr: '' }],
        ['/repo symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['/repo/.worktrees/session-abc symbolic-ref --short HEAD', { exitCode: 0, stdout: 'topic/x\n', stderr: '' }],
        ['/repo remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['/repo fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['/repo merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git, cwd: '/repo/.worktrees/session-abc' });

    const outcome = await execute(env, selfStore, { branch: 'topic/x', yes: true, reap: true }, [adapter]);

    expect(outcome.data?.sync).toEqual({ attempted: true, synced: true });
    expect(outcome.data?.reap.reaped).toBe(false);
    expect(outcome.data?.reap.reason).toContain('running from');
    expect(outcome.data?.reap.reason).toContain('/repo'); // names where to retry
    expect(calls.some((c) => c.args[0] === 'worktree' && c.args[1] === 'remove')).toBe(false);
    // the fast-forward ran in the clone, never in the worktree the command was invoked from
    expect(calls).toContainEqual({ cwd: '/repo', args: ['merge', '--ff-only', 'origin/main'] });
  });

  it('reaps a session worktree while running from a DIFFERENT session worktree', async () => {
    const selfStore: Store = { root: '/repo/.worktrees/session-other', config: makeConfig() };
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git, calls } = cwdGitRunner(
      new Map([
        ['worktree list --porcelain', { exitCode: 0, stdout: TWO_WORKTREES, stderr: '' }],
        ['/repo symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['/repo remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['/repo fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['/repo merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
        ['/repo/.worktrees/session-abc status --porcelain', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git, cwd: '/repo/.worktrees/session-other' });

    const outcome = await execute(env, selfStore, { branch: 'topic/x', yes: true, reap: true }, [adapter]);

    expect(outcome.data?.sync).toEqual({ attempted: true, synced: true });
    expect(outcome.data?.reap).toEqual({ attempted: true, reaped: true });
    // both mutations go through the clone, not through the unrelated worktree the command ran in
    expect(calls).toContainEqual({ cwd: '/repo', args: ['worktree', 'remove', '/repo/.worktrees/session-abc'] });
    expect(calls).toContainEqual({ cwd: '/repo', args: ['branch', '-d', 'topic/x'] });
  });

  it('without --reap, names session reap and touches no worktree', async () => {
    const { adapter } = fakeForge({ initial: OPEN_MERGEABLE });
    const { git, calls } = fakeGitRunner(
      new Map([
        ['symbolic-ref --short HEAD', { exitCode: 0, stdout: 'main\n', stderr: '' }],
        ['remote', { exitCode: 0, stdout: 'origin\n', stderr: '' }],
        ['fetch origin main', { exitCode: 0, stdout: '', stderr: '' }],
        ['merge --ff-only origin/main', { exitCode: 0, stdout: '', stderr: '' }],
      ]),
    );
    const env = nonInteractiveEnv({ git });
    const outcome = await execute(env, STORE, { branch: 'topic/x', yes: true }, [adapter]);
    expect(outcome.data?.reap).toEqual({ attempted: false, reaped: false, reason: 'pass --reap, or run `ctxr session reap`' });
    expect(calls.some((c) => c[0] === 'worktree' && c[1] === 'remove')).toBe(false);
    expect(calls.some((c) => c[0] === 'branch')).toBe(false);
  });
});
