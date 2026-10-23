import { execFile } from 'node:child_process';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readConfig } from '../../src/config/load.js';
import { ExitCode } from '../../src/core/exit-codes.js';
import { buildPlugins, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, pluginName, pluginVersion } from '../../src/core/plugin/build.js';
import { renderSkills } from '../../src/core/skills.js';
import { CLI_VERSION } from '../../src/version.js';
import { makeApprovalStore, type ApprovalStore } from '../helpers/approval-store.js';
import { runCli } from '../helpers/run-cli.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D7 (harness-portability spec,
 * *`ctxr plugin build` writes the store's chat-app plugins*): the manifest
 * shapes both vendors document, the skills the MCP render produces, and an
 * archive an independent unzip reads back.
 */

const execFileAsync = promisify(execFile);
const BASE = 'https://ctx-a.example.test';
const MCP_BLOCK = 'mcp:\n  readers: ["@example.com"]\n  editors: ["a@example.com"]\n';

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

describe('ctxr plugin build', () => {
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

  it('writes both plugins, each as a directory and an archive, under the derived cache by default', async () => {
    const result = await runCli(['plugin', 'build', '--json'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr + result.stdout).toBe(ExitCode.Ok);
    const data = (JSON.parse(result.stdout) as { data: { name: string; version: string; mcp_url: string; out: string; skills: string[] } }).data;
    const out = path.join(store.root, '.contexture/cache/plugin');
    const head = await store.git(['rev-parse', 'HEAD']);
    const config = await readConfig(store.root);
    const skills = renderSkills(config, 'mcp');

    expect(data).toMatchObject({ name: 'contexture-store', version: `${CLI_VERSION}+${head.slice(0, 12)}`, mcp_url: `${BASE}/mcp`, out });
    expect(data.skills).toEqual(skills.map((s) => s.file));
    expect((await readdir(out)).sort()).toEqual(['chatgpt', 'claude', 'contexture-store-chatgpt.zip', 'contexture-store-claude.zip']);

    // Claude: .claude-plugin/plugin.json and .mcp.json with an http server entry.
    const claude = path.join(out, 'claude');
    const skillPaths = skills.map((s) => `skills/${s.file}/SKILL.md`);
    expect(await filesUnder(claude)).toEqual(['.claude-plugin/plugin.json', '.mcp.json', 'README.md', ...skillPaths].sort());
    const claudeManifest = await json(path.join(claude, '.claude-plugin/plugin.json'));
    expect(Object.keys(claudeManifest).sort()).toEqual(['description', 'displayName', 'name', 'version']);
    expect(claudeManifest).toMatchObject({ name: 'contexture-store', displayName: 'store (contexture)', version: data.version });
    expect(await json(path.join(claude, '.mcp.json'))).toEqual({ mcpServers: { 'contexture-store': { type: 'http', url: `${BASE}/mcp` } } });

    // ChatGPT: a root plugin.json in the Agent Plugins schema, and mcp.json with OAuth through dynamic registration.
    const chatgpt = path.join(out, 'chatgpt');
    expect(await filesUnder(chatgpt)).toEqual(['README.md', 'mcp.json', 'plugin.json', ...skillPaths].sort());
    const chatgptManifest = await json(path.join(chatgpt, 'plugin.json'));
    expect(Object.keys(chatgptManifest).sort()).toEqual(['$schema', 'description', 'extensions', 'name', 'version']);
    expect(chatgptManifest).toMatchObject({
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: 'contexture-store',
      version: data.version,
      extensions: { 'com.openai.interface': { displayName: 'store (contexture)' } },
    });
    expect(await json(path.join(chatgpt, 'mcp.json'))).toEqual({
      mcpServers: {
        'contexture-store': { type: 'streamable-http', url: `${BASE}/mcp`, extensions: { 'com.openai.auth': { type: 'oauth', client: { mode: 'dcr' } } } },
      },
    });

    for (const dir of [claude, chatgpt]) {
      for (const skill of skills) {
        const text = await readFile(path.join(dir, 'skills', skill.file, 'SKILL.md'), 'utf8');
        expect(text).toBe(skill.content);
        const [, name, description] = /^---\nname: (.*)\ndescription: (.*)\n---\n/.exec(text)!;
        expect(name).toBe(skill.file);
        expect(name!.length).toBeLessThanOrEqual(MAX_NAME_LENGTH);
        expect(description!.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
      }
      // No hook, no local server, no top-level bin/, no variable in an address, and no credential.
      const files = await filesUnder(dir);
      expect(files.some((f) => f === 'bin' || f.startsWith('bin/') || f.startsWith('hooks/') || f.includes('hooks.json'))).toBe(false);
      for (const file of files.filter((f) => f.endsWith('.json'))) {
        const textOf = await readFile(path.join(dir, file), 'utf8');
        expect(textOf, file).not.toMatch(/"command"|"args"|"env"|"headers"|\$\{|\{\{/);
        expect(textOf, file).not.toMatch(/token|secret|password|bearer/i);
      }
    }
  });

  it('archives each directory with its manifest at the root, readable by an independent unzip', async () => {
    const out = path.join(store.root, '.contexture/cache/plugin');
    for (const target of ['claude', 'chatgpt']) {
      const archive = path.join(out, `contexture-store-${target}.zip`);
      expect(await unzip(['-tq', archive])).toMatch(/No errors detected/);
      const listed = (await unzip(['-Z1', archive])).trim().split('\n').sort();
      expect(listed).toEqual(await filesUnder(path.join(out, target)));
      for (const file of listed) {
        expect(await unzip(['-p', archive, file]), `${target}: ${file}`).toBe(await readFile(path.join(out, target, file), 'utf8'));
      }
    }
  });

  it('replaces the plugin directories whole, and writes where --out says, relative to the working directory', async () => {
    const stray = path.join(store.root, '.contexture/cache/plugin/claude/skills/ctxr-gone/SKILL.md');
    await import('node:fs/promises').then(async (fs) => {
      await fs.mkdir(path.dirname(stray), { recursive: true });
      await fs.writeFile(stray, 'left behind\n');
    });
    expect((await runCli(['plugin', 'build'], { cwd: store.root, env: store.env, timeoutMs: 60_000 })).exitCode).toBe(ExitCode.Ok);
    await expect(stat(stray)).rejects.toThrow();

    const result = await runCli(['plugin', 'build', '--out', '../plugins'], { cwd: store.root, env: store.env, timeoutMs: 60_000 });
    expect(result.exitCode, result.stderr).toBe(ExitCode.Ok);
    expect(result.stdout).toContain('contexture-store-claude.zip');
    expect((await readdir(path.join(store.tmp.root, 'plugins'))).sort()).toEqual(['chatgpt', 'claude', 'contexture-store-chatgpt.zip', 'contexture-store-claude.zip']);
  });

  it('exits with the configuration error code and writes nothing on a store with no mcp block', async () => {
    const out = path.join(bare.tmp.root, 'nothing-here');
    for (const args of [['plugin', 'build', '--json'], ['plugin', 'build', '--out', out, '--json']]) {
      const result = await runCli(args, { cwd: bare.root, env: bare.env, timeoutMs: 60_000 });
      expect(result.exitCode).toBe(ExitCode.Usage);
      const envelope = JSON.parse(result.stdout) as { findings: { code: string }[] };
      expect(envelope.findings.map((f) => f.code)).toContain('plugin.mcp_not_declared');
    }
    await expect(stat(out)).rejects.toThrow();
    await expect(stat(path.join(bare.root, '.contexture/cache/plugin'))).rejects.toThrow();
  });

  it('builds the same archive bytes twice from one commit and configuration', async () => {
    const config = await readConfig(store.root);
    const input = { config, storeName: 'store', cliVersion: CLI_VERSION, commit: 'a'.repeat(40) };
    const [first, second] = [buildPlugins(input), buildPlugins(input)];
    for (const [i, plugin] of first.plugins.entries()) expect(plugin.archive.equals(second.plugins[i]!.archive)).toBe(true);
  });
});

describe('the plugin name and version', () => {
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
