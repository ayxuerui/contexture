import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { buildCatalog, type CatalogBuildResult } from '../core/catalog/build.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export type CatalogBuildData = CatalogBuildResult;

export async function execute(store: Store): Promise<CommandOutcome<CatalogBuildData>> {
  const result = await buildCatalog(store);
  return {
    exitCode: ExitCode.Ok,
    data: result,
    findings: [],
    humanSummary: `Catalog built: ${result.totalNotes} note(s) across ${result.sections.length} section(s).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
