import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDecision } from '../../src/core/approval/decision.js';
import { makeApprovalStore, recordApproval, RECORDING_LOGIN, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

const RESOLVER = fileURLToPath(new URL('../helpers/resolver.mjs', import.meta.url));
const TEN_LINES = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

async function land(store: ApprovalStore, args: string[]) {
  const result = await runCli(['land', ...args, '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
  const envelope = JSON.parse(result.stdout) as { data: { results: Record<string, unknown>[] } | null; findings: { code: string }[] };
  return { ...result, envelope, results: envelope.data?.results ?? [] };
}

async function reviewState(store: ApprovalStore, name: string) {
  const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
  const sessions = JSON.parse(result.stdout).data.sessions as { worktree: string; state: string; landing_reason: string | null }[];
  return sessions.find((s) => s.worktree === name);
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

const originMainFile = (store: ApprovalStore, file: string) => store.git(['--git-dir', store.origin, 'show', `main:${file}`], store.tmp.root);

describe('ctxr land (real CLI, real git, fake forge)', () => {
  it('lands an approved head: merges, confirms, syncs the canonical clone, removes the worktree, records the landing', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);

      const result = await land(store, ['7']);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: 'merged', consent: 'recorded', catch_up: 'not-needed', canonical_sync: { synced: true }, reclaim: { removed: true } });
      expect(await originMainFile(store, 'projects/a.md')).toBe('# A');
      expect(await readFile(path.join(store.root, 'projects/a.md'), 'utf8')).toBe('# A\n');
      expect(await exists(s.worktree)).toBe(false);
      expect(await store.git(['branch', '--list', s.branch])).toBe('');
      const record = JSON.parse(await readFile(path.join(store.root, '.contexture/cache/landings', `${s.name}.json`), 'utf8'));
      expect(record).toMatchObject({ pull_request: 7, worktree: s.name, branch: s.branch });
      expect((await store.forge.read()).pulls[0]).toMatchObject({ merged: true });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('does nothing without consent', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      const mainBefore = await store.git(['--git-dir', store.origin, 'rev-parse', 'main'], store.tmp.root);

      const result = await land(store, ['7']);
      expect(result.exitCode).toBe(3);
      expect(result.results[0]).toMatchObject({ outcome: 'no-consent', state: 'awaiting' });
      expect(await store.git(['--git-dir', store.origin, 'rev-parse', 'main'], store.tmp.root)).toBe(mainBefore);
      expect(await store.git(['--git-dir', store.origin, 'rev-parse', s.branch], store.tmp.root)).toBe(s.head);
      expect(await exists(s.worktree)).toBe(true);
      expect((await store.forge.read()).pulls[0]!.merged).toBeFalsy();
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('lands with --confirm and no recorded decision', async () => {
    const store = await makeApprovalStore();
    try {
      await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      const result = await land(store, ['7', '--confirm']);
      expect(result.exitCode, result.stdout).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: 'merged', consent: 'confirm' });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses a pull request whose head is the default branch, and --pending with --confirm', async () => {
    const store = await makeApprovalStore();
    try {
      await store.forge.update((state) => {
        state.pulls.push({ number: 9, head: 'main' });
      });
      const refused = await land(store, ['9', '--confirm']);
      expect(refused.exitCode).toBe(2);
      expect(refused.envelope.findings[0]!.code).toBe('land.default_branch');

      const flags = await land(store, ['--pending', '--confirm']);
      expect(flags.exitCode).toBe(2);
      expect(flags.envelope.findings[0]!.code).toBe('land.flags');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('confirms a merge from the forge even when the merge call errors', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await store.forge.update((state) => {
        state.failAfterMerge = true;
      });
      const result = await land(store, ['7']);
      expect(result.exitCode, result.stdout).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: 'merged', reclaim: { removed: true } });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('--pending lands only the approved pull request', async () => {
    const store = await makeApprovalStore();
    try {
      const a = await store.openSession('ctx-a', 1, { 'projects/a.md': '# A\n' });
      const b = await store.openSession('ctx-b', 2, { 'projects/b.md': '# B\n' });
      const c = await store.openSession('ctx-c', 3, { 'projects/c.md': '# C\n' });
      await recordApproval(store, 1, a.head);
      const { decisionBody } = await import('../../src/core/approval/decision.js');
      await store.forge.update((state) => {
        const at = new Date().toISOString();
        (state.reviews![3] ??= []).push({
          user: { login: RECORDING_LOGIN },
          state: 'CHANGES_REQUESTED',
          body: decisionBody({ decision: 'request-changes', head: c.head, by: 'a@example.com', at, carriedFrom: null, comment: 'No.' }),
          commit_id: c.head,
          submitted_at: at,
        });
      });

      const result = await land(store, ['--pending']);
      expect(result.exitCode, result.stdout).toBe(0);
      expect(result.results.map((r) => [r.pull_request, r.outcome])).toEqual([[1, 'merged']]);
      expect(await exists(b.worktree)).toBe(true);
      expect(await exists(c.worktree)).toBe(true);
      const pulls = (await store.forge.read()).pulls;
      expect(pulls.find((p) => p.number === 2)!.merged).toBeFalsy();
      expect(pulls.find((p) => p.number === 3)!.merged).toBeFalsy();
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('carries an approval over a clean catch-up rebase and records the carry-over', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/other.md': '# Other\n' });

      const result = await land(store, ['7']);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      expect(result.results[0]).toMatchObject({ outcome: 'merged', catch_up: 'carried-over', records_posted: ['carry-over'] });
      const reviews = (await store.forge.read()).reviews!['7']!;
      const carried = parseDecision(reviews[reviews.length - 1]!.body)!;
      expect(carried).toMatchObject({ decision: 'approve', by: 'a@example.com', carriedFrom: s.head });
      expect(carried.head).not.toBe(s.head);
      expect(await originMainFile(store, 'projects/other.md')).toBe('# Other');
      expect(await originMainFile(store, 'projects/a.md')).toBe('# A');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('does not carry an approval over a rebase that changes a patch', async () => {
    const store = await makeApprovalStore();
    try {
      await store.advanceMain({ 'projects/ten.md': TEN_LINES });
      await store.git(['merge', '-q', '--ff-only', 'origin/main']);
      const s = await store.openSession('ctx-a', 7, { 'projects/ten.md': TEN_LINES.replace('line 5', 'line five') });
      await recordApproval(store, 7, s.head);
      // Close enough to change the hunk's context, far enough not to conflict.
      await store.advanceMain({ 'projects/ten.md': TEN_LINES.replace('line 3', 'line three') });

      const result = await land(store, ['7']);
      expect(result.exitCode).toBe(3);
      expect(result.results[0]).toMatchObject({ outcome: 'needs-reapproval', catch_up: 'patches-changed' });
      expect((await store.forge.read()).pulls[0]!.merged).toBeFalsy();
      expect((await reviewState(store, s.name))?.state).toBe('needs-reapproval');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('stops when the leased push is refused because the branch moved', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/other.md': '# Other\n' });
      // Someone pushes to the branch, and the forge has not caught up yet.
      const moved = await store.commitInWorktree(s.worktree, { 'projects/a2.md': '# A2\n' }, 'more');
      await store.git(['push', '-q', 'origin', s.branch], s.worktree);
      await store.git(['reset', '-q', '--hard', s.head], s.worktree);
      await store.forge.update((state) => {
        state.pulls[0]!.stale_head = s.head;
      });

      const result = await land(store, ['7']);
      expect(result.exitCode).toBe(3);
      expect(result.results[0]).toMatchObject({ outcome: 'lease-refused' });
      expect(await store.git(['--git-dir', store.origin, 'rev-parse', s.branch], store.tmp.root)).toBe(moved);
      expect((await store.forge.read()).pulls[0]!.merged).toBeFalsy();
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('blocks on a conflict when no resolver is declared, leaving the branch as it was', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A from the session\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/a.md': '# A from main\n' });

      const result = await land(store, ['7']);
      expect(result.exitCode).toBe(3);
      expect(result.results[0]).toMatchObject({ outcome: 'blocked', catch_up: 'conflict', reason: 'conflict', records_posted: ['blocked:conflict'] });
      expect(await store.git(['--git-dir', store.origin, 'rev-parse', s.branch], store.tmp.root)).toBe(s.head);
      expect(await reviewState(store, s.name)).toMatchObject({ state: 'blocked', landing_reason: 'conflict' });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('runs the resolver on a conflict, pushes an accepted result, and hands it back for re-approval', async () => {
    const store = await makeApprovalStore({ approvalExtra: `  resolver: ["${process.execPath}", "${RESOLVER}"]\n` });
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A from the session\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/a.md': '# A from main\n' });

      const result = await land(store, ['7']);
      expect(result.exitCode, result.stdout + result.stderr).toBe(3);
      expect(result.results[0], JSON.stringify(result.results[0]) + result.stderr).toMatchObject({ outcome: 'needs-reapproval', catch_up: 'conflict-resolved' });
      const pushed = await store.git(['--git-dir', store.origin, 'rev-parse', s.branch], store.tmp.root);
      expect(pushed).not.toBe(s.head);
      const resolvedText = await store.git(['--git-dir', store.origin, 'show', `${pushed}:projects/a.md`], store.tmp.root);
      expect(resolvedText).toContain('# A from main');
      expect(resolvedText).toContain('# A from the session');
      expect((await store.forge.read()).pulls[0]!.merged).toBeFalsy();
      expect(await reviewState(store, s.name)).toMatchObject({ state: 'needs-reapproval', landing_reason: 'conflict-resolved' });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('pushes nothing when the resolver result fails doctor', async () => {
    const store = await makeApprovalStore({ approvalExtra: `  resolver: ["${process.execPath}", "${RESOLVER}", "--broken"]\n` });
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A from the session\n' });
      await recordApproval(store, 7, s.head);
      await store.advanceMain({ 'projects/a.md': '# A from main\n' });

      const result = await land(store, ['7']);
      expect(result.exitCode).toBe(3);
      expect(result.results[0]).toMatchObject({ outcome: 'blocked', reason: 'doctor-failed' });
      expect(await store.git(['--git-dir', store.origin, 'rev-parse', s.branch], store.tmp.root)).toBe(s.head);
      expect(await reviewState(store, s.name)).toMatchObject({ state: 'blocked', landing_reason: 'doctor-failed' });
    } finally {
      await store.tmp.cleanup();
    }
  });
});
