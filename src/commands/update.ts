import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { reconcileStore } from '../core/reconcile.js';
import type { Store } from '../core/store.js';
import { generateAdapterOutputs } from './adapters-generate.js';

export const requires: CommandRequires = { store: 'required' };

export interface UpdateData {
  /** Every store-relative path this run rewrote to the installed version; empty when already current. */
  changed: string[];
}

/**
 * entry-doc-generation spec (D5): after upgrading contexture, bring every
 * contexture-owned file in the store to the installed version — generated
 * AGENTS.md sections, .gitignore blocks, hooks, the contexture-owned skill
 * copies, and each configured adapter's outputs. Operator content is never
 * touched. Idempotent: a current store reports nothing changed.
 */
export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<UpdateData>> {
  const { changed } = await reconcileStore(env, store.root, store.config);
  const adapterFiles = await generateAdapterOutputs(store);
  const all = [...new Set([...changed, ...adapterFiles.filter((f) => f.changed).map((f) => f.path)])];

  return {
    exitCode: ExitCode.Ok,
    data: { changed: all },
    findings: [],
    humanSummary: all.length === 0 ? 'Store is already up to date.' : `Updated ${all.length} contexture-owned file(s).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
