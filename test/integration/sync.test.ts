import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startSyncLoop } from '../../src/commands/sync.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { runCli, runCliBackground, stopCliBackground } from '../helpers/run-cli.js';
import { makeSessionPair } from '../helpers/session-stores.js';

async function snapshot(store: ApprovalStore) {
  return {
    head: await store.git(['rev-parse', 'HEAD']),
    branch: await store.git(['symbolic-ref', '--short', 'HEAD']),
    status: await store.git(['status', '--porcelain']),
    config: await readFile(path.join(store.root, 'contexture.yaml'), 'utf8'),
  };
}

type Envelope = { data: { canonical_sync: Record<string, unknown> | null; credential: string | null } | null; findings: { code: string; severity: string; message: string }[] };

async function sync(cwd: string, env: Record<string, string | undefined>, args: string[] = []) {
  const r = await runCli(['sync', ...args, '--json'], { cwd, env, timeoutMs: 60_000 });
  return { ...r, envelope: JSON.parse(r.stdout) as Envelope };
}

async function until(check: () => Promise<boolean>, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return check();
}

describe('ctxr sync brings the canonical clone up to date', { timeout: 60_000 }, () => {
  it('fast-forwards a clean clone that is behind, naming both commits', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      const before = await store.git(['rev-parse', 'HEAD']);
      const merged = await store.advanceMain({ 'projects/elsewhere.md': '# Merged elsewhere\n' });
      // advanceMain fetches into the clone; forget that, so the sync has to fetch it itself.
      await store.git(['update-ref', 'refs/remotes/origin/main', before]);
      const r = await sync(store.root, store.env);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(await store.git(['rev-parse', 'HEAD'])).toBe(merged);
      expect(r.envelope.data!.canonical_sync).toEqual({ synced: true, from: before, to: merged, reason: null });
      expect(r.envelope.data!.credential).toBe('gh');
      expect(r.envelope.findings).toEqual([]);
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
    it(`leaves a clone with ${what} exactly as it was, with the success code, and says why`, async () => {
      const store = await makeApprovalStore({ noApproval: true });
      try {
        await arrange(store);
        await store.advanceMain({ 'projects/elsewhere.md': '# Merged elsewhere\n' });
        const before = await snapshot(store);
        const r = await sync(store.root, store.env);
        expect(r.exitCode, r.stdout + r.stderr).toBe(0);
        expect(await snapshot(store)).toEqual(before);
        expect(r.envelope.data!.canonical_sync).toMatchObject({ synced: false, from: before.head, to: before.head });
        expect(String(r.envelope.data!.canonical_sync!.reason)).toContain(reason);
        expect(r.envelope.findings).toEqual([expect.objectContaining({ code: 'sync.canonical_not_synced', severity: 'warning' })]);
      } finally {
        await store.tmp.cleanup();
      }
    });
  }

  it('exits with the setup/usage code, naming the forge as unreachable, when the fetch fails', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      await store.git(['remote', 'set-url', 'origin', path.join(store.tmp.root, 'no-such-origin.git')]);
      const before = await snapshot(store);
      const r = await sync(store.root, store.env);
      expect(r.exitCode, r.stdout + r.stderr).toBe(2);
      expect(r.envelope.findings).toEqual([expect.objectContaining({ code: 'sync.forge_unreachable', severity: 'error' })]);
      expect(r.envelope.findings[0]!.message).toContain('unreachable');
      expect(await snapshot(store)).toEqual(before);
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('touches nothing under shared/', async () => {
    const p = await makeSessionPair();
    try {
      const mountBefore = await p.git(['rev-parse', 'HEAD'], p.mount);
      await p.advance(p.b, { 'projects/b.md': '# B\n' });
      const merged = await p.advance(p.a, { 'projects/a.md': '# A\n' });
      const r = await sync(p.a.root, p.env);
      expect(r.exitCode, r.stdout + r.stderr).toBe(0);
      expect(await p.git(['rev-parse', 'HEAD'], p.a.root)).toBe(merged);
      expect(await p.git(['rev-parse', 'HEAD'], p.mount)).toBe(mountBefore);
      expect(await p.git(['rev-parse', 'refs/remotes/origin/main'], p.mount)).toBe(mountBefore);
    } finally {
      await p.tmp.cleanup();
    }
  });
});

describe('ctxr sync --every keeps the clone and its mounts current', { timeout: 60_000 }, () => {
  it('refuses a minutes value that is not a positive whole number', async () => {
    const store = await makeApprovalStore({ noApproval: true });
    try {
      for (const value of ['0', '-1', '1.5', 'five']) {
        const r = await sync(store.root, store.env, ['--every', value]);
        expect(r.exitCode, `${value}: ${r.stdout}${r.stderr}`).toBe(2);
        expect(r.envelope.findings[0]!.code).toBe('sync.flags');
      }
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('a round fast-forwards the canonical clone and a mount, and the loop keeps running', async () => {
    const p = await makeSessionPair();
    try {
      const mountMerged = await p.advance(p.b, { 'projects/b.md': '# B\n' });
      const merged = await p.advance(p.a, { 'projects/a.md': '# A\n' });
      const { child, firstLine } = await runCliBackground(['sync', '--every', '5', '--json'], { cwd: p.a.root, env: p.env });
      try {
        const envelope = JSON.parse(firstLine) as { data: { every_minutes: number; mounts: { outcome: string }[] } };
        expect(envelope.data.every_minutes).toBe(5);
        expect(envelope.data.mounts.map((m) => m.outcome)).toEqual(['fast_forwarded']);
        expect(await p.git(['rev-parse', 'HEAD'], p.a.root)).toBe(merged);
        expect(await p.git(['rev-parse', 'HEAD'], p.mount)).toBe(mountMerged);
        // Still running after its first round: the loop waits for the next one.
        await new Promise((r) => setTimeout(r, 500));
        expect(child.exitCode).toBeNull();
      } finally {
        await stopCliBackground(child);
      }
    } finally {
      await p.tmp.cleanup();
    }
  });

  it('rounds keep coming, and a failed round is reported on stderr without ending the loop', async () => {
    const p = await makeSessionPair();
    try {
      const lines: string[] = [];
      const env = makeFakeEnv({ git: createExecFileGitRunner(), env: p.env, cwd: p.a.root, now: () => new Date() });
      const loop = startSyncLoop(env, p.a.root, 300, (line) => lines.push(line), 0);
      try {
        const merged = await p.advance(p.a, { 'projects/a.md': '# A\n' });
        const mountMerged = await p.advance(p.b, { 'projects/b.md': '# B\n' });
        expect(await until(async () => (await p.git(['rev-parse', 'HEAD'], p.a.root)) === merged && (await p.git(['rev-parse', 'HEAD'], p.mount)) === mountMerged, 20_000), lines.join('\n')).toBe(true);

        // The forge goes away: the rounds fail, and say so.
        const realOrigin = p.a.origin;
        await p.git(['remote', 'set-url', 'origin', path.join(p.tmp.root, 'gone.git')], p.a.root);
        expect(await until(async () => lines.some((l) => l.startsWith('sync: round failed: canonical clone not synced: fetch failed')), 20_000), lines.join('\n')).toBe(true);

        // It comes back, and a later round brings the clone up to date: the loop never stopped.
        await p.git(['remote', 'set-url', 'origin', realOrigin], p.a.root);
        const later = await p.advance(p.a, { 'projects/later.md': '# Later\n' });
        expect(await until(async () => (await p.git(['rev-parse', 'HEAD'], p.a.root)) === later, 20_000), lines.join('\n')).toBe(true);
      } finally {
        await loop.stop();
      }
    } finally {
      await p.tmp.cleanup();
    }
  });
});
