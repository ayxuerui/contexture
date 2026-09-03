import { archiveDestinationFromTaxonomyMigration } from './archive-destination-from-taxonomy.js';
import { dropAccessAxesMigration } from './drop-access-axes.js';
import { dropForgeAndWorkspacesExternalMigration } from './drop-forge-and-workspaces-external.js';
import { renameConventionsPathMigration } from './rename-conventions-path.js';
import { renameProceduresPathMigration } from './rename-procedures-path.js';
import type { Migration } from './types.js';

/**
 * Every migration contexture ships, in ascending fromVersion order. Later
 * phases append here, nothing else.
 *
 * The chain is deliberately NOT contiguous: the 1 -> 2 visibility-field
 * rename was retired with the field itself (retire-the-access-axes D7), so a
 * schema-1 store's first pending migration is the 2 -> 3 one, which guards on
 * `schema_version < 3` and carries it straight there. `pendingMigrations`
 * selects on `fromVersion >= current`, never on adjacency, so a gap costs
 * nothing.
 */
export const MIGRATIONS: readonly Migration[] = [
  renameProceduresPathMigration,
  renameConventionsPathMigration,
  dropForgeAndWorkspacesExternalMigration,
  archiveDestinationFromTaxonomyMigration,
  dropAccessAxesMigration,
];

/** Every migration a store currently at `fromVersion` still needs to reach the CLI's supported version, in order. */
export function pendingMigrations(fromVersion: number): Migration[] {
  return MIGRATIONS.filter((m) => m.fromVersion >= fromVersion).slice().sort((a, b) => a.fromVersion - b.fromVersion);
}
