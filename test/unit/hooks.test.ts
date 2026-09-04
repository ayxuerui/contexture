import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { configureHooksPath, detectStaleHooks, getConfiguredHooksPath, installHooks } from '../../src/core/hooks.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));

describe('installHooks', () => {
  it('writes both hooks, executable, with the placeholders substituted, naming no filesystem path', async () => {
    const tmp = await makeTmpDir();
    try {
      const { changed } = await installHooks(tmp.root, 'main');
      expect(changed.sort()).toEqual(['.githooks/pre-commit', '.githooks/pre-push']);

      const preCommit = await readFile(path.join(tmp.root, '.githooks', 'pre-commit'), 'utf8');
      const prePush = await readFile(path.join(tmp.root, '.githooks', 'pre-push'), 'utf8');
      // ctxr is resolved at run time (CONTEXTURE_BIN, then PATH) — the
      // rendered hook carries no path from the machine that generated it.
      expect(preCommit).toContain('command -v ctxr');
      expect(preCommit).not.toContain('__CONTEXTURE_BIN__');
      expect(preCommit).not.toContain('__RESOLVE_CTXR__');
      expect(preCommit).not.toContain(tmp.root);
      expect(preCommit).not.toContain(PACKAGE_DIR.replace(/\/$/, ''));
      expect(prePush).toContain('DEFAULT_BRANCH="main"');
      expect(prePush).not.toContain('__DEFAULT_BRANCH__');

      const mode = (await stat(path.join(tmp.root, '.githooks', 'pre-commit'))).mode;
      expect(mode & 0o111).not.toBe(0); // executable by someone
    } finally {
      await tmp.cleanup();
    }
  });

  it('renders a byte-identical pre-commit hook for two different store roots', async () => {
    const tmpA = await makeTmpDir();
    const tmpB = await makeTmpDir();
    try {
      await installHooks(tmpA.root, 'main');
      await installHooks(tmpB.root, 'main');
      const preCommitA = await readFile(path.join(tmpA.root, '.githooks', 'pre-commit'), 'utf8');
      const preCommitB = await readFile(path.join(tmpB.root, '.githooks', 'pre-commit'), 'utf8');
      expect(preCommitA).toEqual(preCommitB);
    } finally {
      await tmpA.cleanup();
      await tmpB.cleanup();
    }
  });

  it('leaves no unsubstituted __PLACEHOLDER__ token in either installed hook', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      const preCommit = await readFile(path.join(tmp.root, '.githooks', 'pre-commit'), 'utf8');
      const prePush = await readFile(path.join(tmp.root, '.githooks', 'pre-push'), 'utf8');
      expect(preCommit).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
      expect(prePush).not.toMatch(/__[A-Z][A-Z0-9_]*__/);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is idempotent: a second install with identical inputs reports nothing changed', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      const second = await installHooks(tmp.root, 'main');
      expect(second.changed).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('rewrites the hook when the default branch changes', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      const { changed } = await installHooks(tmp.root, 'trunk');
      expect(changed).toEqual(['.githooks/pre-push']); // only pre-push references the branch name
      const prePush = await readFile(path.join(tmp.root, '.githooks', 'pre-push'), 'utf8');
      expect(prePush).toContain('DEFAULT_BRANCH="trunk"');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('detectStaleHooks', () => {
  it('reports nothing stale for a hook installed from a different store root', async () => {
    // Guards byte-stability at the detection layer, not just the render
    // layer: a hook installed via one store root (standing in for "a
    // different machine") must not be reported stale when copied verbatim
    // into another, since the render no longer depends on anything
    // machine-specific.
    const source = await makeTmpDir();
    const target = await makeTmpDir();
    try {
      await installHooks(source.root, 'main');
      const preCommit = await readFile(path.join(source.root, '.githooks', 'pre-commit'), 'utf8');
      await installHooks(target.root, 'main');
      await writeFile(path.join(target.root, '.githooks', 'pre-commit'), preCommit);
      expect(await detectStaleHooks(target.root, 'main')).toEqual([]);
    } finally {
      await source.cleanup();
      await target.cleanup();
    }
  });

  it('reports both hooks stale when neither exists yet', async () => {
    const tmp = await makeTmpDir();
    try {
      const stale = await detectStaleHooks(tmp.root, 'main');
      expect(stale.sort()).toEqual(['.githooks/pre-commit', '.githooks/pre-push']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports nothing stale right after a fresh install', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      expect(await detectStaleHooks(tmp.root, 'main')).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reports pre-push stale when the default branch has since changed', async () => {
    const tmp = await makeTmpDir();
    try {
      await installHooks(tmp.root, 'main');
      expect(await detectStaleHooks(tmp.root, 'trunk')).toEqual(['.githooks/pre-push']);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('configureHooksPath / getConfiguredHooksPath', () => {
  it('reads back what was configured', async () => {
    const { git, calls } = fakeGitRunner();
    await configureHooksPath(git, '/repo');
    expect(calls).toEqual([['config', 'core.hooksPath', '.githooks']]);
  });

  it('returns undefined when core.hooksPath is unset', async () => {
    const { git } = fakeGitRunner(new Map([['config core.hooksPath', { exitCode: 1, stdout: '', stderr: '' }]]));
    expect(await getConfiguredHooksPath(git, '/repo')).toBeUndefined();
  });
});
