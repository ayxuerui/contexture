import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NoStoreRootError } from '../../src/core/errors.js';
import { CONFIG_FILE_NAME, resolveExistingRoot, resolveRootForInit } from '../../src/core/root.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

describe('resolveExistingRoot', () => {
  it('prefers --root over CONTEXTURE_ROOT', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_ROOT: '/env-root' } });
    expect(resolveExistingRoot(env, { root: '/flag-root' })).toBe('/flag-root');
  });

  it('falls back to CONTEXTURE_ROOT when no --root is given', () => {
    const env = makeFakeEnv({ cwd: '/somewhere', env: { CONTEXTURE_ROOT: '/env-root' } });
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

  it('prefers --root over CONTEXTURE_ROOT', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: { CONTEXTURE_ROOT: '/env-root' } });
    expect(resolveRootForInit(env, { root: '/flag-root' })).toBe('/flag-root');
  });

  it('falls back to cwd when neither --root nor CONTEXTURE_ROOT is given', () => {
    const env = makeFakeEnv({ cwd: '/cwd', env: {} });
    expect(resolveRootForInit(env, {})).toBe('/cwd');
  });
});
