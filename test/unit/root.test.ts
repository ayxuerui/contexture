import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NoStoreRootError, SupersededStoreRootEnvVarError } from '../../src/core/errors.js';
import { CONFIG_FILE_NAME, resolveExistingRoot, resolveRootForInit } from '../../src/core/root.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('resolveExistingRoot', () => {
  it('prefers --root over CONTEXTURE_STORE_ROOT', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_STORE_ROOT: '/env-root' } });
    expect(resolveExistingRoot(env, { root: '/flag-root' })).toBe('/flag-root');
  });

  it('falls back to CONTEXTURE_STORE_ROOT when no --root is given', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_STORE_ROOT: '/env-root' } });
    expect(resolveExistingRoot(env, {})).toBe('/env-root');
  });

  it('walks up from cwd looking for contexture.yaml', async () => {
    const tmp = await makeTmpDir();
    try {
      const nested = path.join(tmp.root, 'a', 'b', 'c');
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), 'schema_version: 1\n');
      const env = makeFakeEnv({ cwd: nested, env: {} });
      expect(resolveExistingRoot(env, {})).toBe(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });

  it('throws NoStoreRootError, naming what was checked, when nothing resolves', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({ cwd: tmp.root, env: {} });
      let caught: unknown;
      try {
        resolveExistingRoot(env, {});
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(NoStoreRootError);
      expect((caught as NoStoreRootError).finding.code).toBe('root.not_found');
      expect((caught as NoStoreRootError).finding.message).toContain(tmp.root);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not recognize an alias env var', async () => {
    const tmp = await makeTmpDir();
    try {
      const env = makeFakeEnv({
        cwd: tmp.root,
        env: { CONTEXTURE_HOME: '/should-be-ignored', CTX_ROOT: '/also-ignored', CONTEXT_ROOT: '/nope' },
      });
      expect(() => resolveExistingRoot(env, {})).toThrow(NoStoreRootError);
    } finally {
      await tmp.cleanup();
    }
  });

  // rename-store-root-env-var: CONTEXTURE_ROOT is superseded by
  // CONTEXTURE_STORE_ROOT and is recognized only to refuse — never resolved
  // as a root, so a half-migrated environment fails loudly instead of
  // silently walking up and resolving a different store.
  it('refuses when only the superseded CONTEXTURE_ROOT is set', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_ROOT: '/old-root' } });
    let caught: unknown;
    try {
      resolveExistingRoot(env, {});
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(SupersededStoreRootEnvVarError);
    expect((caught as SupersededStoreRootEnvVarError).finding.message).toContain('CONTEXTURE_ROOT');
    expect((caught as SupersededStoreRootEnvVarError).finding.message).toContain('CONTEXTURE_STORE_ROOT');
  });

  it('prefers CONTEXTURE_STORE_ROOT over a superseded CONTEXTURE_ROOT set alongside it, and does not refuse', () => {
    const env = makeFakeEnv({
      cwd: '/somewhere',
      env: { CONTEXTURE_ROOT: '/old-root', CONTEXTURE_STORE_ROOT: '/new-root' },
    });
    expect(resolveExistingRoot(env, {})).toBe('/new-root');
  });

  it('lets an explicit --root beat a set superseded CONTEXTURE_ROOT without refusing', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_ROOT: '/old-root' } });
    expect(resolveExistingRoot(env, { root: '/flag-root' })).toBe('/flag-root');
  });
});

// resolve-the-worktree-you-are-in: CONTEXTURE_STORE_ROOT names WHICH STORE;
// a session worktree raises WHICH CHECKOUT of it. Contexture cuts those
// worktrees itself, so a command run from one must operate on it rather than
// silently on the canonical clone.
describe('resolveExistingRoot — the worktree the caller is standing in', () => {
  /**
   * Builds a canonical store and a linked worktree of it, laid out exactly as
   * git does: the worktree's `.git` is a FILE reading `gitdir: <owner>/.git/
   * worktrees/<name>`, and both checkouts carry contexture.yaml.
   */
  async function makeStoreWithWorktree(tmpRoot: string, name = 'session-1') {
    const owner = path.join(tmpRoot, 'store');
    const worktree = path.join(owner, '.worktrees', name);
    await mkdir(path.join(owner, '.git', 'worktrees', name), { recursive: true });
    await mkdir(worktree, { recursive: true });
    await writeFile(path.join(owner, CONFIG_FILE_NAME), 'schema_version: 1\n');
    await writeFile(path.join(worktree, CONFIG_FILE_NAME), 'schema_version: 1\n');
    await writeFile(
      path.join(worktree, '.git'),
      `gitdir: ${path.join(owner, '.git', 'worktrees', name)}\n`,
    );
    return { owner, worktree };
  }

  it('resolves the worktree, not the store the env var names', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner, worktree } = await makeStoreWithWorktree(tmp.root);
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('resolves the worktree from a subdirectory of it', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner, worktree } = await makeStoreWithWorktree(tmp.root);
      const nested = path.join(worktree, 'areas', 'deep');
      await mkdir(nested, { recursive: true });
      const env = makeFakeEnv({ cwd: nested, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('accepts a relative gitdir pointer (git worktree add --relative-paths)', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner, worktree } = await makeStoreWithWorktree(tmp.root);
      await writeFile(
        path.join(worktree, '.git'),
        `gitdir: ${path.relative(worktree, path.join(owner, '.git', 'worktrees', 'session-1'))}\n`,
      );
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(worktree);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets an explicit --root beat the worktree the caller is standing in', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner, worktree } = await makeStoreWithWorktree(tmp.root);
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, { root: owner })).toBe(owner);
    } finally {
      await tmp.cleanup();
    }
  });

  it('still pins across stores: a worktree of ANOTHER repo does not redirect', async () => {
    const tmp = await makeTmpDir();
    try {
      const { worktree } = await makeStoreWithWorktree(tmp.root, 'session-1');
      // A second, unrelated store the env var names.
      const other = path.join(tmp.root, 'other-store');
      await mkdir(other, { recursive: true });
      await writeFile(path.join(other, CONFIG_FILE_NAME), 'schema_version: 1\n');
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: other } });
      expect(resolveExistingRoot(env, {})).toBe(other);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not redirect from the main working tree (.git is a directory)', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner } = await makeStoreWithWorktree(tmp.root);
      const env = makeFakeEnv({ cwd: owner, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(owner);
    } finally {
      await tmp.cleanup();
    }
  });

  it('does not redirect to a sibling directory that merely looks like the worktrees dir', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner, worktree } = await makeStoreWithWorktree(tmp.root);
      // `.git/worktrees-backup/x` must not match the `.git/worktrees` prefix.
      const decoy = path.join(owner, '.git', 'worktrees-backup', 'x');
      await mkdir(decoy, { recursive: true });
      await writeFile(path.join(worktree, '.git'), `gitdir: ${decoy}\n`);
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(owner);
    } finally {
      await tmp.cleanup();
    }
  });

  it('falls back to the env var when the cwd store is not a git checkout at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const { owner } = await makeStoreWithWorktree(tmp.root);
      const plain = path.join(tmp.root, 'plain');
      await mkdir(plain, { recursive: true });
      await writeFile(path.join(plain, CONFIG_FILE_NAME), 'schema_version: 1\n');
      const env = makeFakeEnv({ cwd: plain, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveExistingRoot(env, {})).toBe(owner);
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves the no-env cwd walk unchanged', async () => {
    const tmp = await makeTmpDir();
    try {
      const { worktree } = await makeStoreWithWorktree(tmp.root);
      const env = makeFakeEnv({ cwd: worktree, env: {} });
      expect(resolveExistingRoot(env, {})).toBe(worktree);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('resolveRootForInit', () => {
  it('never walks up, even when an ancestor has contexture.yaml', async () => {
    const tmp = await makeTmpDir();
    try {
      const nested = path.join(tmp.root, 'child');
      await mkdir(nested, { recursive: true });
      await writeFile(path.join(tmp.root, CONFIG_FILE_NAME), 'schema_version: 1\n');
      const env = makeFakeEnv({ cwd: nested, env: {} });
      expect(resolveRootForInit(env, {})).toBe(nested);
    } finally {
      await tmp.cleanup();
    }
  });

  it('prefers --root over CONTEXTURE_STORE_ROOT', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: { CONTEXTURE_STORE_ROOT: '/env-root' } });
    expect(resolveRootForInit(env, { root: '/flag-root' })).toBe('/flag-root');
  });

  it('falls back to cwd when neither --root nor CONTEXTURE_STORE_ROOT is given', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: {} });
    expect(resolveRootForInit(env, {})).toBe('/cwd');
  });

  it('refuses when only the superseded CONTEXTURE_ROOT is set', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: { CONTEXTURE_ROOT: '/old-root' } });
    expect(() => resolveRootForInit(env, {})).toThrow(SupersededStoreRootEnvVarError);
  });

  // resolve-the-worktree-you-are-in D6: init CREATES a store rather than
  // finding one, so redirecting it into an existing worktree is the opposite
  // of what it is for.
  it('never redirects into a linked worktree of the store the env var names', async () => {
    const tmp = await makeTmpDir();
    try {
      const owner = path.join(tmp.root, 'store');
      const worktree = path.join(owner, '.worktrees', 'session-1');
      await mkdir(path.join(owner, '.git', 'worktrees', 'session-1'), { recursive: true });
      await mkdir(worktree, { recursive: true });
      await writeFile(path.join(owner, CONFIG_FILE_NAME), 'schema_version: 1\n');
      await writeFile(path.join(worktree, CONFIG_FILE_NAME), 'schema_version: 1\n');
      await writeFile(
        path.join(worktree, '.git'),
        `gitdir: ${path.join(owner, '.git', 'worktrees', 'session-1')}\n`,
      );
      const env = makeFakeEnv({ cwd: worktree, env: { CONTEXTURE_STORE_ROOT: owner } });
      expect(resolveRootForInit(env, {})).toBe(owner);
    } finally {
      await tmp.cleanup();
    }
  });

  it('lets an explicit --root beat a set superseded CONTEXTURE_ROOT without refusing', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: { CONTEXTURE_ROOT: '/old-root' } });
    expect(resolveRootForInit(env, { root: '/flag-root' })).toBe('/flag-root');
  });
});
