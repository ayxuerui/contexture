import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveOnPath } from '../../src/core/environment/probe.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

async function writeExecutable(dir: string, name: string, mode = 0o755): Promise<string> {
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, name);
  await writeFile(full, '#!/bin/sh\nexit 0\n');
  await chmod(full, mode);
  return full;
}

/**
 * isolate-the-portability-test (task 4.4): PATH comes from the passed
 * environment, so every case here runs against a temp directory and nothing
 * global is mutated — the suite stays parallel-safe.
 */
describe('resolveOnPath', () => {
  it('returns the resolved path when the command is found and executable', async () => {
    const tmp = await makeTmpDir();
    try {
      const expected = await writeExecutable(tmp.root, 'gh');
      expect(await resolveOnPath('gh', { PATH: tmp.root })).toBe(expected);
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns null when the command is absent', async () => {
    const tmp = await makeTmpDir();
    try {
      expect(await resolveOnPath('gh', { PATH: tmp.root })).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns null when the file exists but is not executable', async () => {
    const tmp = await makeTmpDir();
    try {
      await writeExecutable(tmp.root, 'gh', 0o644);
      expect(await resolveOnPath('gh', { PATH: tmp.root })).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('returns null for an empty PATH', async () => {
    expect(await resolveOnPath('gh', { PATH: '' })).toBeNull();
  });

  it('returns null when PATH is unset', async () => {
    expect(await resolveOnPath('gh', {})).toBeNull();
  });

  it('takes the first match across multiple entries, and skips empty ones', async () => {
    const tmp = await makeTmpDir();
    try {
      const first = path.join(tmp.root, 'first');
      const second = path.join(tmp.root, 'second');
      const expected = await writeExecutable(first, 'gh');
      await writeExecutable(second, 'gh');
      expect(await resolveOnPath('gh', { PATH: ['', first, second].join(path.delimiter) })).toBe(expected);
    } finally {
      await tmp.cleanup();
    }
  });

  it('skips an entry where the name is a directory rather than an executable', async () => {
    const tmp = await makeTmpDir();
    try {
      const shadowed = path.join(tmp.root, 'shadowed');
      await mkdir(path.join(shadowed, 'gh'), { recursive: true });
      const real = path.join(tmp.root, 'real');
      const expected = await writeExecutable(real, 'gh');
      expect(await resolveOnPath('gh', { PATH: [shadowed, real].join(path.delimiter) })).toBe(expected);
    } finally {
      await tmp.cleanup();
    }
  });
});
