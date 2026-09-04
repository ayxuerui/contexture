import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { configuredAdapters } from '../adapters/registry.js';
import { agentsMdPath } from '../core/agents-doc.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import type { GitRunner } from '../core/git/exec.js';
import { mainWorktreePath } from '../core/git/worktree.js';
import { installTemplatedHookScript } from '../core/hooks.js';
import { mergeJsonArrayLists, type MergePatch, type RemovePatch } from '../core/json-config-merge.js';
import { harnessEntryFence } from '../core/markers.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface AdaptersGenerateFileResult {
  path: string;
  changed: boolean;
}

export interface AdaptersGenerateData {
  files: AdaptersGenerateFileResult[];
}

/**
 * adapters spec / task 8.3-8.4: every configured harness-generation adapter
 * gets its entry file's fenced region (re)written from `render()`, and,
 * for a harness that supports it, its permission config merged in. Two
 * adapters targeting the same physical file (the common case: one harness's
 * own entry file) never collide, because each owns a distinctly-named fence.
 */
/** The generation itself, shared with `ctxr update`. */
export async function generateAdapterOutputs(git: GitRunner, store: Store): Promise<AdaptersGenerateFileResult[]> {
  const files: AdaptersGenerateFileResult[] = [];
  // Resolved once per run, not per adapter: every adapter's permission
  // config that needs a stable absolute path (stabilize-write-gate-hook-path)
  // anchors it here, regardless of which checkout is running this generator.
  const mainRoot = await mainWorktreePath(git, store.root);

  for (const adapter of configuredAdapters(store.config, 'harness-generation')) {
    if (adapter.entryFileName !== undefined && adapter.render !== undefined) {
      const entryPath = path.join(store.root, adapter.entryFileName);
      const { changed } = await upsertFencedRegionInFile(
        entryPath,
        harnessEntryFence(adapter.id),
        adapter.render(agentsMdPath(store.root)),
      );
      files.push({ path: adapter.entryFileName, changed });
    }

    if (adapter.permissionConfig) {
      const input = {
        root: store.root,
        mainRoot,
        worktreesPath: store.config.session.worktrees_path,
      };
      let permChanged = false;

      if (adapter.permissionConfig.hookFile) {
        const { changed: hookScriptChanged } = await installTemplatedHookScript(
          store.root,
          adapter.permissionConfig.hookFile.targetPath,
          adapter.permissionConfig.hookFile.templateFileName,
        );
        permChanged = permChanged || hookScriptChanged;
      }

      const permPath = path.join(store.root, adapter.permissionConfig.path);
      const rules = adapter.permissionConfig.render(input);
      const retired = adapter.permissionConfig.retiredRules(input);
      const { changed: rulesChanged } = await mergeJsonArrayLists(permPath, rules as MergePatch, {
        remove: retired as RemovePatch,
      });
      permChanged = permChanged || rulesChanged;

      files.push({ path: adapter.permissionConfig.path, changed: permChanged });
    }
  }

  return files;
}

export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<AdaptersGenerateData>> {
  const files = await generateAdapterOutputs(env.git, store);
  const changedCount = files.filter((f) => f.changed).length;
  return {
    exitCode: ExitCode.Ok,
    data: { files },
    findings: [],
    humanSummary: `adapters generate: ${changedCount} file(s) changed, ${files.length - changedCount} already up to date.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
