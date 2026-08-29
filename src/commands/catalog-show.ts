import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { readCatalogSection } from '../core/catalog/build.js';
import { CatalogSectionNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface CatalogShowFlags {
  section: string;
  as?: string;
}

export interface CatalogShowData {
  section: string;
  content: string;
}

export async function execute(store: Store, flags: CatalogShowFlags): Promise<CommandOutcome<CatalogShowData>> {
  const content = await readCatalogSection(store, flags.section, flags.as);
  if (content === null) {
    throw new CatalogSectionNotFoundError(flags.section);
  }
  return {
    exitCode: ExitCode.Ok,
    data: { section: flags.section, content },
    findings: [],
    humanSummary: content,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
