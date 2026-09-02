import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { DEFAULT_ARCHIVE_DESTINATION } from '../../config/defaults.js';
import { renderStoreConfig } from '../../config/render.js';
import { profileById } from '../../taxonomy/profiles.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

const CONFIG_DELTA: MigrationDelta = {
  path: 'contexture.yaml',
  description: 'rename organize.archive_path to organize.archive_destination and set schema_version to 6',
};

function destinationDelta(from: string, to: string): MigrationDelta {
  return {
    path: to,
    description: `adopt the taxonomy's own archive destination, moving the default-valued archive directory from ${from} to ${to}`,
  };
}

/**
 * archive-destination-from-taxonomy: `ctxr init` wrote a fixed
 * `DEFAULT_ARCHIVE_PATH` regardless of the taxonomy it had just resolved, so
 * every PARA store was born with `archive/` while its own taxonomy declared
 * `archives/` — a config key pointing at a directory the store does not have.
 * Init now asks the profile; this migration does the same for stores already
 * on disk.
 *
 * Two independent halves, and the second is conditional:
 *
 * 1. The key rename is unconditional — every schema-5 store gets
 *    `archive_destination`. `OrganizeSchema`'s fallback transform has already
 *    resolved the old spelling by the time `readConfig` returns, so writing
 *    the parsed config back is what drops `archive_path` from disk.
 * 2. The value only changes when the store never customized it AND its
 *    profile declares a destination of its own. An operator who deliberately
 *    set some other path keeps it; a Zettelkasten or Diataxis store, whose
 *    profile declares none, keeps `archive/` — for them this is a pure key
 *    rename. A custom taxonomy resolves to no shipped profile and is left
 *    alone for the same reason.
 *
 * Like 0004, the directory move is a plain filesystem rename (migrations see
 * only `Store` — `root` + `config`, no `GitRunner`), and it is skipped when
 * the old directory was never created. History survives either way: whatever
 * commits this output stages a coherent delete-old/add-new diff, which
 * `git log --follow`'s rename detection reads identically to a `git mv`.
 *
 * Pending-ness is `schema_version < 6`, not key presence — the rule 0002,
 * 0004, and 0005 established, for the same reason: the fallback transform
 * populates `archive_destination` on an unmigrated store too, so its presence
 * cannot distinguish migrated from not.
 */
export const archiveDestinationFromTaxonomyMigration: Migration = {
  id: '0006-archive-destination-from-taxonomy',
  fromVersion: 5,
  toVersion: 6,
  description:
    "Rename the organize.archive_path config key to organize.archive_destination, adopt the taxonomy profile's own archive destination when the value still sat at the shipped default, and bump schema_version to 6.",

  async plan(store) {
    if (store.config.schema_version >= 6) return [];
    const deltas: MigrationDelta[] = [CONFIG_DELTA];
    const target = taxonomyDestination(store.config.taxonomy.profile, store.config.organize.archive_destination);
    if (target) deltas.push(destinationDelta(DEFAULT_ARCHIVE_DESTINATION, target));
    return deltas;
  },

  async apply(store) {
    if (store.config.schema_version >= 6) return [];

    const configPath = path.join(store.root, 'contexture.yaml');
    const currentConfig = await readConfig(store.root);
    const appliedDeltas: MigrationDelta[] = [CONFIG_DELTA];

    let destination = currentConfig.organize.archive_destination;
    const target = taxonomyDestination(currentConfig.taxonomy.profile, destination);
    if (target) {
      const oldDir = path.join(store.root, DEFAULT_ARCHIVE_DESTINATION);
      const newDir = path.join(store.root, target);
      // Absent whenever nothing was ever archived — only the config changes.
      if (existsSync(oldDir) && !existsSync(newDir)) {
        await rename(oldDir, newDir);
      }
      destination = target;
      appliedDeltas.push(destinationDelta(DEFAULT_ARCHIVE_DESTINATION, target));
    }

    const nextConfig = {
      ...currentConfig,
      schema_version: 6,
      organize: { ...currentConfig.organize, archive_destination: destination },
    };
    await writeFileAtomic(configPath, renderStoreConfig(nextConfig));

    return appliedDeltas;
  },
};

/**
 * The profile's own destination, but only when adopting it is safe: the
 * store must still be sitting on the shipped default (otherwise the value is
 * the operator's, not ours to rewrite), the profile must be a shipped one
 * that declares a destination, and it must actually differ from what's
 * already configured.
 */
function taxonomyDestination(profileId: string | null, current: string): string | undefined {
  if (current !== DEFAULT_ARCHIVE_DESTINATION) return undefined;
  if (profileId === null) return undefined;
  const declared = profileById(profileId)?.archiveDestination;
  if (declared === undefined || declared === current) return undefined;
  return declared;
}
