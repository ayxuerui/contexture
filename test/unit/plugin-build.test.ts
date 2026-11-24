import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_VENDORED_SKILLS } from '../../src/config/defaults.js';
import { readConfig } from '../../src/config/load.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { buildChatgptPlugin, buildClaudePlugin, buildServerChatgptPlugin, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, pluginName, pluginVersion, skillBody } from '../../src/core/plugin/build.js';
import { CONTEXTURE_PLUGIN, definitionProblems, PLUGIN_COMMANDS, PLUGIN_DEFINITIONS, SECOND_OPINION_PLUGIN } from '../../src/core/plugin/commands.js';
import { renderMcpSkills } from '../../src/core/skills.js';

/** publish-through-the-plugin D3: the default craft skills each plugin carries, unchanged, beside their licenses, and the notices. */
const VENDORED_FILES = [...DEFAULT_VENDORED_SKILLS.flatMap((name) => [`skills/${name}/LICENSE.txt`, `skills/${name}/SKILL.md`]), 'THIRD_PARTY_NOTICES.md'];
const CARRIED_SKILLS = (skills: readonly { file: string }[]): string[] => [...skills.map((s) => s.file), ...DEFAULT_VENDORED_SKILLS];
import { CLI_VERSION } from '../../src/version.js';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

/**
 * publish-one-contexture-plugin D1 (harness-portability spec, *contexture
 * publishes one plugin for every store*): `ctxr plugin build` writes
 * contexture's Claude plugin, with no connector, wherever it runs, and in a
 * store that declares `mcp` that store's ChatGPT plugin as well
 * (serve-the-session-lifecycle-to-chat-apps D7): the manifest shapes both
 * vendors document, the skills the MCP render produces, and archives an
 * independent unzip reads back.
 */

const execFileAsync = promisify(execFile);
const BASE = 'https://ctx-a.example.test';
const MCP_BLOCK = 'mcp:\n  readers: ["@example.com"]\n  editors: ["a@example.com"]\n';
const REPO = fileURLToPath(new URL('../..', import.meta.url));

async function filesUnder(dir: string, sub = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(path.join(dir, sub), { withFileTypes: true })) {
    const rel = sub === '' ? entry.name : `${sub}/${entry.name}`;
    if (entry.isDirectory()) out.push(...(await filesUnder(dir, rel)));
    else out.push(rel);
  }
  return out.sort();
}

async function unzip(args: string[]): Promise<string> {
  return (await execFileAsync('unzip', args, { maxBuffer: 16 * 1024 * 1024 })).stdout;
}

const json = async (file: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;

interface BuildData {
  out: string;
  skills: string[];
  mcp_url: string | null;
  plugins: { target: string; name: string; version: string; directory: string; archive: string; files: number }[];
}

/** No hook, no local server, no top-level bin/, no variable in an address, and no credential. */
async function expectNothingRunnable(dir: string): Promise<void> {
  const files = await filesUnder(dir);
  expect(files.some((f) => f === 'bin' || f.startsWith('bin/') || f.startsWith('hooks/') || f.includes('hooks.json'))).toBe(false);
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const textOf = await readFile(path.join(dir, file), 'utf8');
    expect(textOf, file).not.toMatch(/"command"|"args"|"env"|"headers"|\$\{|\{\{/);
    expect(textOf, file).not.toMatch(/token|secret|password|bearer/i);
  }
}

describe('ctxr plugin build outside any store', () => {
  let tmp: TmpDir;
  beforeAll(async () => {
    tmp = await makeTmpDir('contexture-plugin-general-');
  });
  afterAll(async () => {
    await tmp?.cleanup();
  });

  it('writes the Claude plugin with the rendered skills, no MCP server entry and the CLI version, and no ChatGPT plugin', async () => {
    const result = await runCli(['plugin', 'build', '--json'], { cwd: tmp.root, env: hermeticGitEnv(), timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr + result.stdout).toBe(ExitCode.Ok);
    const envelope = JSON.parse(result.stdout) as { data: BuildData; store_root: string | null };
    const out = path.join(tmp.root, 'contexture-plugin');
    const skills = renderMcpSkills();
    expect(envelope.data).toMatchObject({ out, mcp_url: null, skills: CARRIED_SKILLS(skills) });
    expect(envelope.data.plugins.map((p) => [p.target, p.name, p.version])).toEqual([
      ['claude', 'contexture', CLI_VERSION],
      ['claude', 'second-opinion', CLI_VERSION],
    ]);
    expect((await readdir(out)).sort()).toEqual(['contexture', 'contexture-claude.zip', 'second-opinion', 'second-opinion-claude.zip']);

    const dir = path.join(out, 'contexture');
    expect(await filesUnder(dir)).toEqual(['.claude-plugin/plugin.json', 'LICENSE', 'README.md', ...Object.keys(PLUGIN_COMMANDS).map((c) => `commands/${c}.md`), ...skills.map((s) => `skills/${s.file}/SKILL.md`), ...VENDORED_FILES].sort());
    for (const name of DEFAULT_VENDORED_SKILLS) {
      for (const file of ['SKILL.md', 'LICENSE.txt']) {
        expect(await readFile(path.join(dir, 'skills', name, file), 'utf8'), `${name}/${file}`).toBe(await readFile(path.join(REPO, 'templates/vendor', name, file), 'utf8'));
      }
    }
    expect(await readFile(path.join(dir, 'THIRD_PARTY_NOTICES.md'), 'utf8')).toBe(await readFile(path.join(REPO, 'THIRD_PARTY_NOTICES.md'), 'utf8'));
    const manifest = await json(path.join(dir, '.claude-plugin/plugin.json'));
    expect(Object.keys(manifest).sort()).toEqual(['author', 'description', 'displayName', 'homepage', 'keywords', 'license', 'name', 'repository', 'version']);
    const pkg = JSON.parse(await readFile(path.join(REPO, 'package.json'), 'utf8')) as { version: string; license: string };
    expect(manifest).toMatchObject({ name: 'contexture', displayName: 'contexture', version: CLI_VERSION, license: pkg.license, author: { name: 'contexture' } });
    expect(await readFile(path.join(dir, 'LICENSE'), 'utf8')).toBe(await readFile(path.join(REPO, 'LICENSE'), 'utf8'));
    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme.split(/\s+/).filter(Boolean).length).toBeGreaterThanOrEqual(40);
    expect(readme).toContain('ayxuerui/contexture');
    expect(readme).toContain('**Sync automatically**');
    expect(readme).toContain('- `/contexture:submit` opens `ctxr-submit`');
    expect(readme).toContain('- `/contexture:publish` opens `ctxr-publish`');
    expect(readme).toContain('carries `frontend-design` and `eli5`');
    expect(readme).not.toMatch(/__[A-Z_]+__/);

    for (const skill of skills) {
      const text = await readFile(path.join(dir, 'skills', skill.file, 'SKILL.md'), 'utf8');
      expect(text).toBe(skill.content);
      const [, name, description] = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(text)!;
      expect(name).toBe(skill.file);
      expect(name!.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
      expect(description!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    }
    await expectNothingRunnable(dir);

    // What the command writes is the builder's output, byte for byte, which the freshness test compares the repository's copy with.
    for (const [file, content] of buildClaudePlugin(CLI_VERSION).files) expect(await readFile(path.join(dir, ...file.split('/')), 'utf8'), file).toBe(content);
  });

  it('archives each directory with its manifest at the root, readable by an independent unzip', async () => {
    const out = path.join(tmp.root, 'contexture-plugin');
    for (const name of ['contexture', 'second-opinion']) {
      const archive = path.join(out, `${name}-claude.zip`);
      expect(await unzip(['-tq', archive])).toMatch(/No errors detected/);
      const listed = (await unzip(['-Z1', archive])).trim().split('\n').sort();
      expect(listed).toEqual(await filesUnder(path.join(out, name)));
      for (const file of listed) expect(await unzip(['-p', archive, file]), file).toBe(await readFile(path.join(out, name, file), 'utf8'));
    }
  });

  /**
   * offer-the-second-opinion-on-its-own D6 (harness-portability spec,
   * *contexture publishes a plugin that carries only the second opinion*).
   */
  it('writes the second-opinion plugin with one skill, one command, no MCP server entry and the CLI version', async () => {
    const dir = path.join(tmp.root, 'contexture-plugin', 'second-opinion');
    expect(await filesUnder(dir)).toEqual(['.claude-plugin/plugin.json', 'LICENSE', 'README.md', 'commands/ask.md', 'skills/ctxr-second-opinion/SKILL.md']);
    const manifest = await json(path.join(dir, '.claude-plugin/plugin.json'));
    expect(Object.keys(manifest).sort()).toEqual(['author', 'description', 'displayName', 'homepage', 'keywords', 'license', 'name', 'repository', 'version']);
    expect(manifest).toMatchObject({ name: 'second-opinion', version: CLI_VERSION, author: { name: 'contexture' } });
    await expectNothingRunnable(dir);

    // Both plugins carry the same skill text, byte for byte.
    const skill = await readFile(path.join(dir, 'skills/ctxr-second-opinion/SKILL.md'), 'utf8');
    expect(skill).toBe(await readFile(path.join(tmp.root, 'contexture-plugin', 'contexture', 'skills/ctxr-second-opinion/SKILL.md'), 'utf8'));
    expect(skill).toBe(renderMcpSkills().find((s) => s.file === 'ctxr-second-opinion')!.content);

    const command = await readFile(path.join(dir, 'commands/ask.md'), 'utf8');
    expect(command).toMatch(/^---\ndescription: Typed shortcut for \/second-opinion:ask, which opens the ctxr-second-opinion skill\./);
    expect(command).toContain(skillBody(skill));

    const readme = await readFile(path.join(dir, 'README.md'), 'utf8');
    expect(readme).toContain('- `/second-opinion:ask` opens `ctxr-second-opinion`');
    expect(readme.replace(/\s+/g, ' ')).toContain('Install `second-opinion` only if you do not use `contexture`');
    expect(readme).toContain('ayxuerui/contexture');
    expect(readme).not.toMatch(/__[A-Z_]+__/);
    for (const [file, content] of buildClaudePlugin(CLI_VERSION, SECOND_OPINION_PLUGIN).files) expect(await readFile(path.join(dir, ...file.split('/')), 'utf8'), file).toBe(content);
  });

  it('fails the build naming the plugin and the command when a command opens a skill the plugin does not carry', () => {
    const broken = { ...SECOND_OPINION_PLUGIN, commands: { ask: 'ctxr-second-opinion', capture: 'ctxr-capture' } };
    expect(definitionProblems([CONTEXTURE_PLUGIN, broken], renderMcpSkills().map((s) => s.file))).toEqual(['plugin second-opinion: command capture opens ctxr-capture, which the plugin does not carry']);
    expect(() => buildClaudePlugin(CLI_VERSION, broken)).toThrow(/plugin second-opinion: command capture opens ctxr-capture/);
    expect(definitionProblems(PLUGIN_DEFINITIONS, renderMcpSkills().map((s) => s.file))).toEqual([]);
    expect(PLUGIN_DEFINITIONS.map((d) => d.name)).toEqual(['contexture', 'second-opinion']);
  });

  it('builds a ChatGPT plugin that carries the second-opinion skill alone, with a server\'s connector', () => {
    const plugin = buildServerChatgptPlugin({ storeName: 'opinion.example.com', baseUrl: 'https://opinion.example.com/', cliVersion: CLI_VERSION, commit: null }, SECOND_OPINION_PLUGIN);
    expect(plugin).toMatchObject({ name: 'second-opinion-opinion-example-com', version: CLI_VERSION, mcpUrl: 'https://opinion.example.com/mcp', skills: ['ctxr-second-opinion'], archiveName: 'second-opinion-opinion-example-com-chatgpt.zip' });
    expect([...plugin.files.keys()]).toEqual(['README.md', 'mcp.json', 'plugin.json', 'skills/ctxr-second-opinion/SKILL.md']);
    expect(JSON.parse(plugin.files.get('mcp.json')!)).toMatchObject({ mcpServers: { 'second-opinion-opinion-example-com': { type: 'streamable-http', url: 'https://opinion.example.com/mcp' } } });
    expect(plugin.files.get('README.md')).not.toMatch(/__[A-Z_]+__/);
  });
});

describe('ctxr plugin build in a store', () => {
  let store: ApprovalStore;
  let bare: ApprovalStore;

  beforeAll(async () => {
    store = await makeApprovalStore({ baseUrl: BASE });
    await writeFile(path.join(store.root, 'contexture.yaml'), `${await readFile(path.join(store.root, 'contexture.yaml'), 'utf8')}${MCP_BLOCK}`);
    await store.git(['commit', '-qam', 'declare mcp', '--no-verify']);
    bare = await makeApprovalStore({ baseUrl: BASE });
  }, 120_000);

  afterAll(async () => {
    await store?.tmp.cleanup();
    await bare?.tmp.cleanup();
  });

  it("writes contexture's Claude plugin and the store's ChatGPT plugin with its connector, under the derived cache by default", async () => {
    const result = await runCli(['plugin', 'build', '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr + result.stdout).toBe(ExitCode.Ok);
    const data = (JSON.parse(result.stdout) as { data: BuildData }).data;
    const out = path.join(store.root, '.contexture/cache/plugin');
    const head = await store.git(['rev-parse', 'HEAD']);
    const skills = renderMcpSkills();

    expect(data).toMatchObject({ out, mcp_url: `${BASE}/mcp`, skills: CARRIED_SKILLS(skills) });
    expect(data.plugins.map((p) => [p.target, p.name, p.version])).toEqual([
      ['claude', 'contexture', CLI_VERSION],
      ['claude', 'second-opinion', CLI_VERSION],
      ['chatgpt', 'contexture-store', `${CLI_VERSION}+${head.slice(0, 12)}`],
    ]);
    expect((await readdir(out)).sort()).toEqual(['chatgpt', 'contexture', 'contexture-claude.zip', 'contexture-store-chatgpt.zip', 'second-opinion', 'second-opinion-claude.zip']);

    // The Claude plugin is the same as anywhere else: the store's configuration does not reach it.
    const claude = path.join(out, 'contexture');
    for (const [file, content] of buildClaudePlugin(CLI_VERSION).files) expect(await readFile(path.join(claude, ...file.split('/')), 'utf8'), file).toBe(content);
    expect(await filesUnder(claude)).not.toContain('.mcp.json');

    // ChatGPT: a root plugin.json in the Agent Plugins schema, and mcp.json with OAuth through dynamic registration.
    const chatgpt = path.join(out, 'chatgpt');
    const skillPaths = skills.map((s) => `skills/${s.file}/SKILL.md`);
    expect(await filesUnder(chatgpt)).toEqual(['README.md', 'mcp.json', 'plugin.json', ...skillPaths, ...VENDORED_FILES].sort());
    const chatgptManifest = await json(path.join(chatgpt, 'plugin.json'));
    expect(Object.keys(chatgptManifest).sort()).toEqual(['$schema', 'description', 'extensions', 'name', 'version']);
    expect(chatgptManifest).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'contexture-store',
      version: data.plugins[2]!.version,
      extensions: { 'com.openai': { interface: { displayName: 'store (contexture)' } } },
    });
    // The nesting OpenAI's plugin guide documents: extensions -> "com.openai" -> auth.
    expect(await json(path.join(chatgpt, 'mcp.json'))).toEqual({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: {
        'contexture-store': { type: 'streamable-http', url: `${BASE}/mcp`, extensions: { 'com.openai': { auth: { type: 'oauth', client: { mode: 'dcr' } } } } },
      },
    });
    for (const skill of skills) expect(await readFile(path.join(chatgpt, 'skills', skill.file, 'SKILL.md'), 'utf8')).toBe(skill.content);
    for (const dir of [claude, chatgpt]) await expectNothingRunnable(dir);
  });

  it('archives each directory with its manifest at the root, readable by an independent unzip', async () => {
    const out = path.join(store.root, '.contexture/cache/plugin');
    for (const [dir, archiveName] of [['contexture', 'contexture-claude.zip'], ['chatgpt', 'contexture-store-chatgpt.zip']] as const) {
      const archive = path.join(out, archiveName);
      expect(await unzip(['-tq', archive])).toMatch(/No errors detected/);
      const listed = (await unzip(['-Z1', archive])).trim().split('\n').sort();
      expect(listed).toEqual(await filesUnder(path.join(out, dir)));
      for (const file of listed) expect(await unzip(['-p', archive, file]), `${dir}: ${file}`).toBe(await readFile(path.join(out, dir, file), 'utf8'));
    }
  });

  it('replaces the plugin directories whole, and writes where --out says, relative to the working directory', async () => {
    const stray = path.join(store.root, '.contexture/cache/plugin/contexture/skills/ctxr-gone/SKILL.md');
    await mkdir(path.dirname(stray), { recursive: true });
    await writeFile(stray, 'left behind\n');
    expect((await runCli(['plugin', 'build'], { cwd: store.root, env: store.env, timeoutMs: 60_000 })).exitCode).toBe(ExitCode.Ok);
    await expect(stat(stray)).rejects.toThrow();

    const result = await runCli(['plugin', 'build', '--out', '../plugins'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toContain('contexture-store-chatgpt.zip');
    expect((await readdir(path.join(store.tmp.root, 'plugins'))).sort()).toEqual(['chatgpt', 'contexture', 'contexture-claude.zip', 'contexture-store-chatgpt.zip', 'second-opinion', 'second-opinion-claude.zip']);
  });

  it('writes only the Claude plugins, and says why, in a store with no mcp block', async () => {
    const result = await runCli(['plugin', 'build', '--json'], { cwd: bare.root, env: bare.env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr + result.stdout).toBe(ExitCode.Ok);
    const data = (JSON.parse(result.stdout) as { data: BuildData }).data;
    expect(data.mcp_url).toBeNull();
    expect(data.plugins.map((p) => p.target)).toEqual(['claude', 'claude']);
    expect(result.stderr).toContain('declares no mcp block, so no ChatGPT plugin was written');
    expect((await readdir(path.join(bare.root, '.contexture/cache/plugin'))).sort()).toEqual(['contexture', 'contexture-claude.zip', 'second-opinion', 'second-opinion-claude.zip']);
  });

  it('builds the same archive bytes twice from one commit and configuration, and refuses a ChatGPT plugin without mcp', async () => {
    const config = await readConfig(store.root);
    const input = { config, storeName: 'store', cliVersion: CLI_VERSION, commit: 'a'.repeat(40) };
    expect(buildChatgptPlugin(input).archive.equals(buildChatgptPlugin(input).archive)).toBe(true);
    expect(buildClaudePlugin(CLI_VERSION).archive.equals(buildClaudePlugin(CLI_VERSION).archive)).toBe(true);
    expect(() => buildChatgptPlugin({ ...input, config: { ...config, mcp: undefined } })).toThrow(/no mcp block/);
  });
});

describe('the ChatGPT plugin name and version', () => {
  it('is contexture- and a slug of the store name, within 64 characters', () => {
    expect(pluginName('pkm')).toBe('contexture-pkm');
    expect(pluginName('Ready Run_Brain!')).toBe('contexture-ready-run-brain');
    expect(pluginName('---')).toBe('contexture-store');
    const long = pluginName('x'.repeat(40) + '-' + 'y'.repeat(40));
    expect(long.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
    expect(long).not.toMatch(/-$/);
  });

  it('carries the rendered commit as build metadata', () => {
    expect(pluginVersion('0.32.0', '0123456789abcdef0123')).toBe('0.32.0+0123456789ab');
    expect(pluginVersion('0.32.0', null)).toBe('0.32.0');
  });
});
