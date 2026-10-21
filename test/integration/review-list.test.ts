import { describe, expect, it } from 'vitest';
import { decisionBody } from '../../src/core/approval/decision.js';
import { makeApprovalStore, recordApproval, RECORDING_LOGIN } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

describe('ctxr review list (real CLI, fake forge)', () => {
  it('reports each open session pull request with its decision state', async () => {
    const store = await makeApprovalStore();
    try {
      const awaiting = await store.openSession('ctx-a', 1, { 'projects/a.md': '# A\n' });
      const approved = await store.openSession('ctx-b', 2, { 'projects/b.md': '# B\n' });
      const changes = await store.openSession('ctx-c', 3, { 'projects/c.md': '# C\n' });
      const moved = await store.openSession('ctx-d', 4, { 'projects/d.md': '# D\n' });
      await runCli(['session', 'start', 'no-pr'], { cwd: store.root, env: store.env });

      await recordApproval(store, approved.number, approved.head);
      await store.forge.update((state) => {
        const at = new Date().toISOString();
        (state.reviews![3] ??= []).push({
          user: { login: RECORDING_LOGIN },
          state: 'CHANGES_REQUESTED',
          body: decisionBody({ decision: 'request-changes', head: changes.head, by: 'b@example.com', at, carriedFrom: null, comment: 'The second section contradicts the policy note.' }),
          commit_id: changes.head,
          submitted_at: at,
        });
        // A well-formed marker by another login is not a decision.
        (state.reviews![1] ??= []).push({
          user: { login: 'ctx-agent' },
          state: 'APPROVED',
          body: decisionBody({ decision: 'approve', head: awaiting.head, by: 'x@example.com', at, carriedFrom: null, comment: null }),
          commit_id: awaiting.head,
          submitted_at: at,
        });
      });
      await recordApproval(store, moved.number, moved.head);
      await store.commitInWorktree(moved.worktree, { 'projects/d.md': '# D, changed\n' }, 'change d');
      await store.git(['push', '-q', 'origin', moved.branch], moved.worktree);

      const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      const sessions = JSON.parse(result.stdout).data.sessions as { worktree: string; state: string; comment: string | null; decided_by: string | null }[];
      const byName = Object.fromEntries(sessions.map((s) => [s.worktree, s]));
      expect(sessions).toHaveLength(4);
      expect(byName[awaiting.name]).toMatchObject({ state: 'awaiting', decided_by: null });
      expect(byName[approved.name]).toMatchObject({ state: 'approved', decided_by: 'a@example.com' });
      expect(byName[changes.name]).toMatchObject({ state: 'changes-requested', comment: 'The second section contradicts the policy note.', decided_by: 'b@example.com' });
      expect(byName[moved.name]).toMatchObject({ state: 'needs-reapproval' });
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('exits with the usage code when the forge cannot be reached', async () => {
    const store = await makeApprovalStore();
    try {
      await store.openSession('ctx-a', 1, { 'projects/a.md': '# A\n' });
      await store.forge.update((state) => {
        state.fail = { pulls: 502 };
      });
      const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).findings[0].code).toBe('forge.unreachable');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('refuses in a store that declares no change approval', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const result = await runCli(['review', 'list', '--json'], { cwd: store.root, env: store.env });
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout).findings[0].code).toBe('change_approval.not_declared');
    } finally {
      await store.tmp.cleanup();
    }
  });
});
