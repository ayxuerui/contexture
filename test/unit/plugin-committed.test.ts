import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildClaudePlugin, CLAUDE_PLUGIN_NAME, firstDifference } from '../../src/core/plugin/build.js';
import { CLI_VERSION } from '../../src/version.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * publish-one-contexture-plugin D3 (harness-portability spec, *The committed
 * plugin is checked against the render*): the plugin the repository's
 * marketplace lists is what `ctxr plugin build` writes, byte for byte, at the
 * package's version. A pull request that changes a skill, the preamble or the
 * version without `npm run plugin` fails here, naming the first file that differs.
 */

const REPO = fileURLToPath(new URL('../..', import.meta.url));
const COMMITTED = path.join(REPO, 'plugins', CLAUDE_PLUGIN_NAME);
const packageVersion = async (): Promise<string> => (JSON.parse(await readFile(path.join(REPO, 'package.json'), 'utf8')) as { version: string }).version;

describe('the committed plugin', () => {
  it('is the render, file for file and byte for byte (run `npm run plugin` when this fails)', async () => {
    expect(await firstDifference(buildClaudePlugin(await packageVersion()), COMMITTED)).toBeNull();
  });

  it("carries the package's version, which the CLI reports", async () => {
    const manifest = JSON.parse(await readFile(path.join(COMMITTED, '.claude-plugin/plugin.json'), 'utf8')) as { name: string; version: string };
    expect(manifest.version).toBe(await packageVersion());
    expect(CLI_VERSION).toBe(await packageVersion());
    expect(manifest.name).toBe(CLAUDE_PLUGIN_NAME);
  });

  it('is listed by the repository marketplace, with the version left to the plugin', async () => {
    const marketplace = JSON.parse(await readFile(path.join(REPO, '.claude-plugin/marketplace.json'), 'utf8')) as {
      name: string;
      owner: { name: string };
      plugins: Record<string, unknown>[];
    };
    expect(marketplace.name).toBe('contexture');
    expect(marketplace.owner.name).toBe('contexture');
    expect(marketplace.plugins).toHaveLength(1);
    expect(marketplace.plugins[0]).toMatchObject({ name: CLAUDE_PLUGIN_NAME, source: `./plugins/${CLAUDE_PLUGIN_NAME}` });
    // A version here would be read before plugin.json's only when that one is missing; one place keeps them from disagreeing.
    expect(marketplace.plugins[0]).not.toHaveProperty('version');
  });
});

describe('the freshness comparison', () => {
  let tmp: TmpDir;
  let copy: string;
  beforeAll(async () => {
    tmp = await makeTmpDir('contexture-plugin-fresh-');
    copy = path.join(tmp.root, 'contexture');
  });
  afterAll(async () => {
    await tmp?.cleanup();
  });

  const fresh = async (): Promise<void> => {
    await rm(copy, { recursive: true, force: true });
    await cp(COMMITTED, copy, { recursive: true });
  };

  it('fails naming the skill file when a skill changes and the plugin is not regenerated', async () => {
    await fresh();
    const skill = path.join(copy, 'skills/ctxr-capture/SKILL.md');
    await writeFile(skill, `${await readFile(skill, 'utf8')}\nAn edit to the template the plugin never saw.\n`);
    expect(await firstDifference(buildClaudePlugin(CLI_VERSION), copy)).toBe('skills/ctxr-capture/SKILL.md: differs from the build');
  });

  it('fails naming a file the build no longer writes, and one it writes that is missing', async () => {
    await fresh();
    await writeFile(path.join(copy, 'skills/ctxr-capture/notes.md'), 'stray\n');
    expect(await firstDifference(buildClaudePlugin(CLI_VERSION), copy)).toBe('skills/ctxr-capture/notes.md: on disk, but not in the build');
    await fresh();
    await rm(path.join(copy, 'LICENSE'));
    expect(await firstDifference(buildClaudePlugin(CLI_VERSION), copy)).toBe('LICENSE: in the build, but missing on disk');
  });

  it('fails on the manifest when only the version moves', async () => {
    await fresh();
    expect(await firstDifference(buildClaudePlugin('99.0.0'), copy)).toBe('.claude-plugin/plugin.json: differs from the build');
  });
});
