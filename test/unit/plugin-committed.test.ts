import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildClaudePlugin, CLAUDE_PLUGIN_NAME, firstDifference, skillBody } from '../../src/core/plugin/build.js';
import { commandMapProblems, PLUGIN_COMMANDS } from '../../src/core/plugin/commands.js';
import { MCP_SKILL_FILES, renderMcpSkills } from '../../src/core/skills.js';
import { CLI_VERSION } from '../../src/version.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * publish-one-contexture-plugin D3 (harness-portability spec, *The committed
 * plugin is checked against the render*): the plugin the repository's
 * marketplace lists is what `ctxr plugin build` writes, byte for byte, at the
 * package's version. A pull request that changes a skill, the shared opening section or the
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

/**
 * publish-one-contexture-plugin D5 (harness-portability spec, *The plugin's
 * commands open its skills*): each command is its skill's render under a
 * typed-shortcut description, and nothing else in its frontmatter.
 */
describe("the plugin's commands", () => {
  const plugin = buildClaudePlugin(CLI_VERSION);
  const skills = renderMcpSkills();

  it('are the seven the map declares, each opening a skill the plugin carries', () => {
    expect(PLUGIN_COMMANDS).toEqual({
      capture: 'ctxr-capture',
      ingest: 'ctxr-ingest-orchestration',
      research: 'ctxr-research',
      rollup: 'ctxr-rollup',
      mission: 'ctxr-mission',
      session: 'ctxr-session-lifecycle',
      submit: 'ctxr-submit',
    });
    expect(commandMapProblems(PLUGIN_COMMANDS, [...MCP_SKILL_FILES])).toEqual([]);
    expect([...plugin.files.keys()].filter((f) => f.startsWith('commands/')).sort()).toEqual(Object.keys(PLUGIN_COMMANDS).map((c) => `commands/${c}.md`).sort());
  });

  it('fails naming the command when it maps to a skill the plugin does not carry', () => {
    expect(commandMapProblems({ ...PLUGIN_COMMANDS, land: 'ctxr-land' }, [...MCP_SKILL_FILES])).toEqual(['command land opens ctxr-land, which the plugin does not carry']);
  });

  it("carry their skill's render, then the person's arguments, under a description-only frontmatter worded as a typed shortcut", () => {
    for (const [command, skill] of Object.entries(PLUGIN_COMMANDS)) {
      const text = plugin.files.get(`commands/${command}.md`)!;
      const match = /^---\n([^]*?)\n---\n\n([^]*)\n\n(.*)\n$/.exec(text);
      expect(match, command).not.toBeNull();
      const [, head, body, last] = match as unknown as [string, string, string, string];
      expect(head.split('\n'), command).toEqual([`description: Typed shortcut for /contexture:${command}, which opens the ${skill} skill. A request in words loads ${skill} itself.`]);
      expect(head, command).not.toMatch(/: .*: /);
      expect(body, `${command}: body differs from ${skill}`).toBe(skillBody(skills.find((s) => s.file === skill)!.content));
      expect(last, command).toMatch(/\$ARGUMENTS$/);
    }
    // The spec's scenario, spelled out.
    expect(plugin.files.get('commands/submit.md')).toContain('opens the pull request against `<default branch>`');
  });
});
