import { dropForgeAndWorkspacesExternalMigration } from './drop-forge-and-workspaces-external.js';
import { renameConventionsPathMigration } from './rename-conventions-path.js';
import { renameProceduresPathMigration } from './rename-procedures-path.js';
import { renameVisibilityFieldMigration } from './rename-visibility-field.js';
import type { Migration } from './types.js';

/** Every migration contexture ships, in ascending fromVersion order. Later phases append here, nothing else. */
export const MIGRATIONS: readonly Migration[] = [
  renameVisibilityFieldMigration,
  renameProceduresPathMigration,
  renameConventionsPathMigration,
  dropForgeAndWorkspacesExternalMigration,
];

/** Every migration a store currently at `fromVersion` still needs to reach the CLI's supported version, in order. */
export function pendingMigrations(fromVersion: number): Migration[] {
  return MIGRATIONS.filter((m) => m.fromVersion >= fromVersion).slice().sort((a, b) => a.fromVersion - b.fromVersion);
}
