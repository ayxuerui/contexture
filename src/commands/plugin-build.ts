import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { buildPlugins, renderedCommit, storeNameFor, type PluginTarget } from '../core/plugin/build.js';
import type { Store } from '../core/store.js';
import { CLI_VERSION } from '../version.js';

export const requires: CommandRequires = { store: 'required' };

/** serve-the-session-lifecycle-to-chat-apps D7: under the derived cache, which no commit carries. */
export const DEFAULT_PLUGIN_OUT = '.contexture/cache/plugin';

export interface PluginBuildFlags {
  out?: string;
}

export interface PluginBuildData {
  name: string;
  version: string;
  mcp_url: string;
  out: string;
  skills: string[];
  plugins: { target: PluginTarget; directory: string; archive: string; files: number }[];
}

/**
 * harness-portability spec, *`ctxr plugin build` writes the store's chat-app
 * plugins*: the Claude and ChatGPT plugins, each as a directory and as an
 * archive. A store with no `mcp` block is refused before anything is written,
 * by the builder's own configuration error. Each run replaces the two plugin
 * directories whole, so a skill the plugin no longer carries leaves nothing
 * behind.
 */
export async function execute(env: RunEnv, store: Store, flags: PluginBuildFlags): Promise<CommandOutcome<PluginBuildData>> {
  const bundle = buildPlugins({
    config: store.config,
    storeName: await storeNameFor(env.git, store.root),
    cliVersion: CLI_VERSION,
    commit: await renderedCommit(env.git, store.root),
  });

  const out = flags.out === undefined ? path.join(store.root, DEFAULT_PLUGIN_OUT) : path.resolve(env.cwd, flags.out);
  const plugins: PluginBuildData['plugins'] = [];
  for (const plugin of bundle.plugins) {
    const directory = path.join(out, plugin.target);
    await rm(directory, { recursive: true, force: true });
    for (const [file, content] of plugin.files) {
      const target = path.join(directory, ...file.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFileAtomic(target, content);
    }
    const archive = path.join(out, plugin.archiveName);
    await writeFileAtomic(archive, plugin.archive);
    plugins.push({ target: plugin.target, directory, archive, files: plugin.files.size });
  }

  return {
    exitCode: ExitCode.Ok,
    data: { name: bundle.name, version: bundle.version, mcp_url: bundle.mcpUrl, out, skills: bundle.skills, plugins },
    findings: [],
    humanSummary: [
      `built ${bundle.name} ${bundle.version} (${bundle.skills.length} skills, server ${bundle.mcpUrl})`,
      ...plugins.map((p) => `  ${p.target}: ${p.archive}`),
    ].join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
