import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyInstallPath, isGlobalInstallWritable } from '../../src/core/install-kind.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * A POSIX global layout under a temp prefix: `<prefix>/bin/node` as the running
 * Node, and the CLI's entrypoint under `<prefix>/lib/node_modules`.
 */
async function globalLayout(root: string): Promise<{ execPath: string; binPath: string; modules: string; binDir: string }> {
  const binDir = path.join(root, 'prefix', 'bin');
  const modules = path.join(root, 'prefix', 'lib', 'node_modules');
  const entry = path.join(modules, 'ctxr-cli', 'dist');
  await mkdir(binDir, { recursive: true });
  await mkdir(entry, { recursive: true });
  const execPath = path.join(binDir, 'node');
  const binPath = path.join(entry, 'bin.js');
  await writeFile(execPath, '');
  await writeFile(binPath, '');
  return { execPath, binPath, modules, binDir };
}

// Root ignores mode bits, so a non-writable directory cannot be simulated for it.
const runningAsRoot = process.getuid?.() === 0;

describe('a global install reports whether the running user can upgrade it', () => {
  it('is writable when both the global node_modules and the prefix bin are', async () => {
    const tmp = await makeTmpDir();
    try {
      const layout = await globalLayout(tmp.root);
      expect(classifyInstallPath(layout.binPath, layout.execPath)).toBe('global');
      expect(await isGlobalInstallWritable(layout.binPath, layout.execPath)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  // cli-contract: "A global install the user cannot write is distinguished" — the shape of a
  // container image that ships the CLI as root while the agent runs unprivileged.
  it.skipIf(runningAsRoot)('is not writable when the global node_modules is not', async () => {
    const tmp = await makeTmpDir();
    const layout = await globalLayout(tmp.root);
    try {
      await chmod(layout.modules, 0o555);
      expect(classifyInstallPath(layout.binPath, layout.execPath)).toBe('global');
      expect(await isGlobalInstallWritable(layout.binPath, layout.execPath)).toBe(false);
    } finally {
      await chmod(layout.modules, 0o755);
      await tmp.cleanup();
    }
  });

  it.skipIf(runningAsRoot)('is not writable when the prefix bin is not', async () => {
    const tmp = await makeTmpDir();
    const layout = await globalLayout(tmp.root);
    try {
      await chmod(layout.binDir, 0o555);
      expect(await isGlobalInstallWritable(layout.binPath, layout.execPath)).toBe(false);
    } finally {
      await chmod(layout.binDir, 0o755);
      await tmp.cleanup();
    }
  });

  it('is not writable when the entrypoint is under no global root at all', async () => {
    const tmp = await makeTmpDir();
    try {
      const layout = await globalLayout(tmp.root);
      const elsewhere = path.join(tmp.root, 'project', 'node_modules', 'ctxr-cli', 'dist', 'bin.js');
      expect(await isGlobalInstallWritable(elsewhere, layout.execPath)).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});
