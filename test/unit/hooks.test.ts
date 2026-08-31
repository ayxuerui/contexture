import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  configureHooksPath,
  detectStaleHooks,
  getConfiguredHooksPath,
  installHooks,
  resolveOwnBinPath,
} from '../../src/core/hooks.js';
import { fakeGitRunner } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('resolveOwnBinPath', () => {
  it('resolves to a path ending in bin.js, relative to the currently-executing module', () => {
    // Under vitest, this module runs from src/ (not dist/), so the resolved
    // path won't exist on disk here — that it points at the real, built
    // dist/bin.js is verified end-to-end in an integration test instead.
    expect(resolveOwnBinPath().endsWith('bin.js')).toBe(true);
  });
});

describe('installHooks', () => {
  it('writes both hooks, executable, with the placeholders substituted', async () => {
    const tmp = await makeTmpDir();
    try {
      const { changed } = await installHooks(tmp.root, 'main');
      expect(changed.sort()).toEqual(['.githooks/pre-commit', '.githooks/pre-push']);

      const preCommit = await readFile(path.join(tmp.root, '.githooks', 'pre-commit'), 'utf8');
      const prePush = await readFile(path.join(tmp.root, '.githooks', 'pre-push'), 'utf8');
      expect(preCommit).toContain(resolveOwnBinPath());
      expect(preCommit).not.toContain('__CONTEXTURE_BIN__');
      expect(prePush).toContain('DEFAULT_BRANCH="main"');
      expect(prePush).not.toContain('__DEFAULT_BRANCH__');

      const mode = (await stat(path.join(tmp.root, '.githooks', 'pre-commit'))).mode;
      expect(mode & 0o111).not.toBe(0); // executable by someone
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
