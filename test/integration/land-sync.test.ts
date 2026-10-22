import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { makeApprovalStore, recordApproval, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

async function snapshot(store: ApprovalStore) {
  return {
    head: await store.git(['rev-parse', 'HEAD']),
    branch: await store.git(['symbolic-ref', '--short', 'HEAD']),
    status: await store.git(['status', '--porcelain']),
    config: await readFile(path.join(store.root, 'contexture.yaml'), 'utf8'),
  };
}

async function land(store: ApprovalStore, args: string[]) {
  const r = await runCli(['land', ...args, '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
  return { ...r, envelope: JSON.parse(r.stdout) as { data: { canonical_sync?: Record<string, unknown>; results: Record<string, unknown>[] }; findings: { code: string; severity: string }[] } };
}

describe('every landing run brings the canonical clone up to date when it is safe to', () => {
  it('syncs a change merged elsewhere on a sweep with nothing to land', async () => {
    const store = await makeApprovalStore();
    try {
      const before = await store.git(['rev-parse', 'HEAD']);
      const merged = await store.advanceMain({ 'projects/elsewhere.md': '# Merged elsewhere\n' });
      const r = await land(store, ['--pending']);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(await store.git(['rev-parse', 'HEAD'])).toBe(merged);
      expect(r.envelope.data.canonical_sync).toEqual({ synced: true, from: before, to: merged, reason: null });
      expect(r.envelope.findings).toEqual([]);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('reports an already-current clone as synced, from equal to to', async () => {
    const store = await makeApprovalStore();
    try {
      const r = await land(store, ['--pending']);
      const head = await store.git(['rev-parse', 'HEAD']);
      expect(r.envelope.data.canonical_sync).toEqual({ synced: true, from: head, to: head, reason: null });
    } finally {
      await store.tmp.cleanup();
    }
  });

  const leftAlone: [string, (store: ApprovalStore) => Promise<void>, string][] = [
    ['uncommitted changes to a tracked file', (s) => appendFile(path.join(s.root, 'contexture.yaml'), '# being edited\n'), 'uncommitted changes to tracked files'],
    ['another branch checked out', async (s) => void (await s.git(['checkout', '-q', '-b', 'ctx-a-elsewhere'])), '"ctx-a-elsewhere"'],
    ['a commit the forge does not have', async (s) => {
      await appendFile(path.join(s.root, 'local.md'), '# Local only\n');
      await s.git(['add', 'local.md']);
      await s.git(['commit', '-q', '--no-verify', '-m', 'local only']);
    }, 'diverged'],
  ];
  for (const [what, arrange, reason] of leftAlone) {
    it(`leaves a clone with ${what} exactly as it was, and says why`, async () => {
      const store = await makeApprovalStore();
      try {
        await arrange(store);
        await store.advanceMain({ 'projects/elsewhere.md': '# Merged elsewhere\n' });
        const before = await snapshot(store);
        const r = await land(store, ['--pending']);
        expect(r.exitCode, r.stdout + r.stderr).toBe(0);
        expect(await snapshot(store)).toEqual(before);
        expect(r.envelope.data.canonical_sync).toMatchObject({ synced: false, from: before.head, to: before.head });
        expect(String(r.envelope.data.canonical_sync!.reason)).toContain(reason);
        expect(r.envelope.findings).toEqual([expect.objectContaining({ code: 'land.canonical_not_synced', severity: 'warning' })]);
      } finally {
        await store.tmp.cleanup();
      }
    });
  }

  it('land <pr> merges but leaves a dirty canonical clone alone', async () => {
    const store = await makeApprovalStore();
    try {
      const s = await store.openSession('ctx-a', 7, { 'projects/a.md': '# A\n' });
      await recordApproval(store, 7, s.head);
      await appendFile(path.join(store.root, 'contexture.yaml'), '# being edited\n');
      const before = await snapshot(store);
      const r = await land(store, ['7']);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(r.envelope.data.results[0]).toMatchObject({ outcome: 'merged', canonical_sync: { synced: false } });
      expect(String((r.envelope.data.results[0]!.canonical_sync as { reason: string }).reason)).toContain('uncommitted');
      expect(await snapshot(store)).toEqual(before);
    } finally {
      await store.tmp.cleanup();
    }
  });
});
