import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { buildChatgptPlugin, buildClaudePlugin, CLAUDE_PLUGIN_NAME, renderedCommit, storeNameFor, type BuiltPlugin, type PluginTarget } from '../core/plugin/build.js';
import type { Store } from '../core/store.js';
import { CLI_VERSION } from '../version.js';

/** publish-one-contexture-plugin D1: contexture's own plugin needs no store; inside one, the store's ChatGPT plugin is written too. */
export const requires: CommandRequires = { store: 'optional' };

/** serve-the-session-lifecycle-to-chat-apps D7: in a store, under the derived cache, which no commit carries. */
export const DEFAULT_PLUGIN_OUT = '.contexture/cache/plugin';

/** publish-one-contexture-plugin D1: outside a store, a directory of its own under the working directory, never the directory itself. */
export const DEFAULT_GENERAL_PLUGIN_OUT = 'contexture-plugin';

/**
 * Where each plugin's directory goes under `--out`. The Claude plugin's is its
 * name, so `--out plugins` in contexture's repository writes the marketplace's
 * `plugins/contexture/` (publish-one-contexture-plugin revision 9).
 */
export const PLUGIN_DIRECTORIES: Readonly<Record<PluginTarget, string>> = { claude: CLAUDE_PLUGIN_NAME, chatgpt: 'chatgpt' };

export interface PluginBuildFlags {
  out?: string;
}

export interface PluginBuildData {
  out: string;
  skills: string[];
  /** The store's connector address, which only its ChatGPT plugin carries; null when no ChatGPT plugin was written. */
  mcp_url: string | null;
  plugins: { target: PluginTarget; name: string; version: string; directory: string; archive: string; files: number }[];
}

/**
 * harness-portability spec, *contexture publishes one plugin for every store*:
 * contexture's Claude plugin, with no connector and the CLI's version, and,
 * in a store that declares `mcp`, that store's ChatGPT plugin with its
 * connector — each as a directory and an archive. A store without the block
 * gets the Claude plugin and a notice. Each run replaces the plugin
 * directories whole, so a skill the plugin no longer carries leaves nothing behind.
 */
export async function execute(env: RunEnv, store: Store | null, flags: PluginBuildFlags): Promise<CommandOutcome<PluginBuildData>> {
  const built: BuiltPlugin[] = [buildClaudePlugin(CLI_VERSION)];
  let mcpUrl: string | null = null;
  const notices: string[] = [];
  if (store !== null && store.config.mcp !== undefined) {
    const chatgpt = buildChatgptPlugin({
      config: store.config,
      storeName: await storeNameFor(env.git, store.root),
      cliVersion: CLI_VERSION,
      commit: await renderedCommit(env.git, store.root),
    });
    built.push(chatgpt);
    mcpUrl = chatgpt.mcpUrl;
  } else if (store !== null) {
    notices.push("plugin build: this store declares no mcp block, so no ChatGPT plugin was written; contexture's Claude plugin needs none.");
  }

  const out =
    flags.out !== undefined ? path.resolve(env.cwd, flags.out) : store !== null ? path.join(store.root, DEFAULT_PLUGIN_OUT) : path.resolve(env.cwd, DEFAULT_GENERAL_PLUGIN_OUT);
  const plugins: PluginBuildData['plugins'] = [];
  for (const plugin of built) {
    const directory = path.join(out, PLUGIN_DIRECTORIES[plugin.target]);
    await rm(directory, { recursive: true, force: true });
    for (const [file, content] of plugin.files) {
      const target = path.join(directory, ...file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, content);
    }
    const archive = path.join(out, plugin.archiveName);
    await writeFileAtomic(archive, plugin.archive);
    plugins.push({ target: plugin.target, name: plugin.name, version: plugin.version, directory, archive, files: plugin.files.size });
  }

  const skills = built[0]!.skills;
  return {
    exitCode: ExitCode.Ok,
    data: { out, skills, mcp_url: mcpUrl, plugins },
    findings: [],
    humanSummary: [
      `built ${plugins.length === 1 ? 'one plugin' : `${plugins.length} plugins`} (${skills.length} skills)`,
      ...plugins.map((p) => `  ${p.target}: ${p.name} ${p.version}, ${p.directory} and ${p.archive}${p.target === 'chatgpt' && mcpUrl !== null ? ` (server ${mcpUrl})` : ''}`),
    ].join('\n'),
    notices,
    storeRoot: store?.root ?? null,
    schemaVersion: store?.config.schema_version ?? null,
  };
}
