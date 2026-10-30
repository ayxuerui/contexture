import { chmod, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyInstallPath, isGlobalInstallWritable, npmGlobalPrefix } from '../../src/core/install-kind.js';
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

/**
 * install-tools-in-the-home D4: global means "inside the prefix `npm install -g` writes to". The
 * runtime image's shape: Node at /usr/local, npm's prefix at ~/.local, ctxr in ~/.local.
 */
async function userPrefixLayout(root: string): Promise<{ execPath: string; nodeModules: string; npmPrefix: string; userBin: string; userEntry: string; nodeEntry: string }> {
  const nodeBin = path.join(root, 'usr', 'bin');
  const nodeModules = path.join(root, 'usr', 'lib', 'node_modules');
  const npmPrefix = path.join(root, 'home', '.local');
  const userBin = path.join(npmPrefix, 'bin');
  const userEntry = path.join(npmPrefix, 'lib', 'node_modules', 'ctxr-cli', 'dist', 'bin.js');
  const nodeEntry = path.join(nodeModules, 'ctxr-cli', 'dist', 'bin.js');
  for (const dir of [nodeBin, userBin, path.dirname(userEntry), path.dirname(nodeEntry)]) await mkdir(dir, { recursive: true });
  const execPath = path.join(nodeBin, 'node');
  for (const file of [execPath, userEntry, nodeEntry]) await writeFile(file, '');
  return { execPath, nodeModules, npmPrefix, userBin, userEntry, nodeEntry };
}

describe('a global install is one under the prefix npm install -g writes to', () => {
  it('classifies an install under a user npm prefix as global, and writable there', async () => {
    const tmp = await makeTmpDir();
    try {
      const l = await userPrefixLayout(tmp.root);
      expect(classifyInstallPath(l.userEntry, l.execPath)).toBe('undetermined'); // Node's prefix alone: the old answer
      expect(classifyInstallPath(l.userEntry, l.execPath, l.npmPrefix)).toBe('global');
      expect(await isGlobalInstallWritable(l.userEntry, l.execPath, l.npmPrefix)).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });

  it.skipIf(runningAsRoot)('judges writability by the user prefix bin, not by Node\'s directory', async () => {
    const tmp = await makeTmpDir();
    const l = await userPrefixLayout(tmp.root);
    try {
      await chmod(path.dirname(l.execPath), 0o555); // Node's own bin: irrelevant to this install
      expect(await isGlobalInstallWritable(l.userEntry, l.execPath, l.npmPrefix)).toBe(true);
      await chmod(l.userBin, 0o555);
      expect(await isGlobalInstallWritable(l.userEntry, l.execPath, l.npmPrefix)).toBe(false);
    } finally {
      await chmod(path.dirname(l.execPath), 0o755);
      await chmod(l.userBin, 0o755);
      await tmp.cleanup();
    }
  });

  // cli-contract: "An install the package manager would not replace is not global".
  it('does not call an install under Node\'s prefix global when npm writes elsewhere', async () => {
    const tmp = await makeTmpDir();
    try {
      const l = await userPrefixLayout(tmp.root);
      expect(classifyInstallPath(l.nodeEntry, l.execPath)).toBe('global'); // npm unavailable: fallback
      expect(classifyInstallPath(l.nodeEntry, l.execPath, l.npmPrefix)).toBe('undetermined');
      expect(await isGlobalInstallWritable(l.nodeEntry, l.execPath, l.npmPrefix)).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('keeps a project dependency undetermined, and a working copy linked', async () => {
    const tmp = await makeTmpDir();
    try {
      const l = await userPrefixLayout(tmp.root);
      const project = path.join(tmp.root, 'project', 'node_modules', 'ctxr-cli', 'dist', 'bin.js');
      expect(classifyInstallPath(project, l.execPath, l.npmPrefix)).toBe('undetermined');
      expect(classifyInstallPath(path.join(tmp.root, 'checkout', 'dist', 'bin.js'), l.execPath, l.npmPrefix)).toBe('linked');
    } finally {
      await tmp.cleanup();
    }
  });

  it('reads a Windows-shaped prefix, whose packages sit directly under it', () => {
    const prefix = path.resolve('/npm-global');
    const entry = path.join(prefix, 'node_modules', 'ctxr-cli', 'dist', 'bin.js');
    expect(classifyInstallPath(entry, path.resolve('/nodejs/node'), prefix)).toBe('global');
  });
});

describe('npm\'s global prefix', () => {
  const never = async (): Promise<string | null> => {
    throw new Error('npm must not be asked when the environment answers');
  };

  it('is NPM_CONFIG_PREFIX, or npm_config_prefix, when set', async () => {
    expect(await npmGlobalPrefix({ NPM_CONFIG_PREFIX: '/home/agent/.local' }, never)).toBe('/home/agent/.local');
    expect(await npmGlobalPrefix({ npm_config_prefix: '/opt/npm' }, never)).toBe('/opt/npm');
  });

  it('is npm\'s own answer otherwise, and null when npm cannot answer', async () => {
    expect(await npmGlobalPrefix({}, async () => '/Users/me/.npm-global')).toBe('/Users/me/.npm-global');
    expect(await npmGlobalPrefix({}, async () => null)).toBeNull();
  });

  it('ignores a relative or blank setting and asks npm', async () => {
    expect(await npmGlobalPrefix({ NPM_CONFIG_PREFIX: '  ' }, async () => '/usr/local')).toBe('/usr/local');
    expect(await npmGlobalPrefix({ NPM_CONFIG_PREFIX: 'relative' }, async () => null)).toBeNull();
  });
});
