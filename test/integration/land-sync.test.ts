import { existsSync } from 'node:fs';
import { appendFile, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
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
      expect(r.exitCode, r.stdout + r.stderr + (await store.forge.log())).toBe(0);
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
        expect(r.exitCode, r.stdout + r.stderr + (await store.forge.log())).toBe(0);
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
      expect(r.exitCode, r.stdout + r.stderr + (await store.forge.log())).toBe(0);
      expect(r.envelope.data.results[0]).toMatchObject({ outcome: 'merged', canonical_sync: { synced: false } });
      expect(String((r.envelope.data.results[0]!.canonical_sync as { reason: string }).reason)).toContain('uncommitted');
      expect(await snapshot(store)).toEqual(before);
    } finally {
      await store.tmp.cleanup();
    }
  });
});

describe('a landing run reports a failed fetch, and ignores the repository hooks and drivers', () => {
  it('reports a failed fetch as not synced, even when the stale origin/main equals HEAD', async () => {
    const store = await makeApprovalStore();
    try {
      const head = await store.git(['rev-parse', 'HEAD']);
      expect(await store.git(['rev-parse', 'origin/main'])).toBe(head);
      await store.git(['remote', 'set-url', 'origin', path.join(store.tmp.root, 'no-such-origin.git')]);
      const r = await land(store, ['--pending']);
      expect(r.exitCode, r.stdout + r.stderr + (await store.forge.log())).toBe(0);
      expect(r.envelope.data.canonical_sync).toMatchObject({ synced: false, from: head, to: head });
      const reason = String(r.envelope.data.canonical_sync!.reason);
      expect(reason).toMatch(/^fetch failed: \S/);
      expect(reason).not.toContain('\n');
      expect(r.envelope.findings).toEqual([expect.objectContaining({ code: 'land.canonical_not_synced', severity: 'warning' })]);
      const human = await runCli(['land', '--pending'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
      expect(human.stdout).toContain('canonical clone not synced: fetch failed: ');
      expect(human.stdout).not.toContain('already current');
    } finally {
      await store.tmp.cleanup();
    }
  });

  it('runs neither a planted post-merge hook nor a declared filter driver during the fast-forward', async () => {
    const store = await makeApprovalStore();
    try {
      const gitDir = path.resolve(store.root, await store.git(['rev-parse', '--git-dir']));
      const markers = path.join(store.tmp.root, 'markers');
      await mkdir(markers);
      // A hook the repository's own configuration points at, executable, as a writer of .git/ could leave it.
      await mkdir(path.join(gitDir, 'hooks'), { recursive: true });
      await writeFile(path.join(gitDir, 'hooks', 'post-merge'), `#!/bin/sh\ntouch "${markers}/post-merge"\n`);
      await chmod(path.join(gitDir, 'hooks', 'post-merge'), 0o755);
      await store.git(['config', 'core.hooksPath', path.join(gitDir, 'hooks')]);
      // A filter driver declared in .git/config, applied to every path through .git/info/attributes.
      await mkdir(path.join(gitDir, 'info'), { recursive: true });
      await writeFile(path.join(gitDir, 'info', 'attributes'), '* filter=ctxa\n');
      await store.git(['config', 'filter.ctxa.smudge', `sh -c 'touch "${markers}/smudge"; cat'`]);
      await store.git(['config', 'filter.ctxa.clean', `sh -c 'touch "${markers}/clean"; cat'`]);

      const merged = await store.advanceMain({ 'projects/elsewhere.md': '# Merged elsewhere\n' });
      const r = await land(store, ['--pending']);
      expect(r.exitCode, r.stdout + r.stderr + (await store.forge.log())).toBe(0);
      expect(await store.git(['rev-parse', 'HEAD'])).toBe(merged);
      expect(r.envelope.data.canonical_sync).toMatchObject({ synced: true, to: merged });
      expect(existsSync(path.join(markers, 'post-merge'))).toBe(false);
      expect(existsSync(path.join(markers, 'smudge'))).toBe(false);
      expect(existsSync(path.join(markers, 'clean'))).toBe(false);

      // The control: the same fast-forward through plain git runs both, so the plant was live.
      const next = await store.advanceMain({ 'projects/next.md': '# Next\n' });
      await store.git(['merge', '--ff-only', '--quiet', 'origin/main']);
      expect(await store.git(['rev-parse', 'HEAD'])).toBe(next);
      expect(existsSync(path.join(markers, 'post-merge'))).toBe(true);
      expect(existsSync(path.join(markers, 'smudge'))).toBe(true);
    } finally {
      await store.tmp.cleanup();
    }
  });
});
