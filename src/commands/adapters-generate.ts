import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { type AdaptersGenerateFileResult, generateAdapterOutputs } from '../core/adapter-outputs.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export type { AdaptersGenerateFileResult } from '../core/adapter-outputs.js';

export const requires: CommandRequires = { store: 'required' };

export interface AdaptersGenerateData {
  files: AdaptersGenerateFileResult[];
}

export async function execute(env: RunEnv, store: Store): Promise<CommandOutcome<AdaptersGenerateData>> {
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
