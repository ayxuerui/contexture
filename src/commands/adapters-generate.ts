import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { configuredAdapters } from '../adapters/registry.js';
import { agentsMdPath } from '../core/agents-doc.js';
import { ExitCode } from '../core/exit-codes.js';
import { upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import { mergeJsonArrayLists } from '../core/json-config-merge.js';
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
export async function generateAdapterOutputs(store: Store): Promise<AdaptersGenerateFileResult[]> {
  const files: AdaptersGenerateFileResult[] = [];

  for (const adapter of configuredAdapters(store.config, 'harness-generation')) {
    const entryPath = path.join(store.root, adapter.entryFileName);
    const { changed } = await upsertFencedRegionInFile(
      entryPath,
      harnessEntryFence(adapter.id),
      adapter.render(agentsMdPath(store.root)),
    );
    files.push({ path: adapter.entryFileName, changed });

    if (adapter.permissionConfig) {
      const permPath = path.join(store.root, adapter.permissionConfig.path);
      const rules = adapter.permissionConfig.render({
        root: store.root,
        worktreesPath: store.config.session.worktrees_path,
      });
      const { changed: permChanged } = await mergeJsonArrayLists(
        permPath,
        rules as Record<string, Record<string, readonly string[]>>,
      );
      files.push({ path: adapter.permissionConfig.path, changed: permChanged });
    }

  }

  return files;
}

export async function execute(store: Store): Promise<CommandOutcome<AdaptersGenerateData>> {
  const files = await generateAdapterOutputs(store);
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
