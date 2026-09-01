import { existsSync } from 'node:fs';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Store } from '../store.js';
import type { Migration, MigrationDelta } from './types.js';

const OLD_DEFAULT_GUIDANCE_PATH = '.contexture/conventions/';
const NEW_DEFAULT_GUIDANCE_PATH = '.contexture/guidance/';

const CONFIG_DELTA: MigrationDelta = {
  path: 'contexture.yaml',
  description: 'rename harness.conventions_path to harness.guidance_path and set schema_version to 4',
};

function directoryDelta(): MigrationDelta {
  return {
    path: NEW_DEFAULT_GUIDANCE_PATH,
    description: `move the default-valued guidance directory from ${OLD_DEFAULT_GUIDANCE_PATH} to ${NEW_DEFAULT_GUIDANCE_PATH}`,
  };
}

/**
 * rename-conventions-path-to-guidance-path (compose-store-guidance-documents
 * design.md D1/D7): unlike 0003's pure key rename, the key's *default value*
 * also changes (`.contexture/conventions/` -> `.contexture/guidance/`), so a
 * store that never customized the path needs its directory moved on disk,
 * not merely its config key renamed. An operator-customized path is left
 * exactly where it is — only the key spelling changes for them.
 *
 * Migrations only see `Store` (`root` + `config`, no `GitRunner` — see
 * core/store.ts), so the directory move is a plain filesystem rename, not
 * `git mv`. History is still preserved: whatever commits this migration's
 * output (the normal session-submit flow) stages a coherent delete-old,
 * add-new diff, which `git log --follow`'s content-similarity rename
 * detection recognizes identically to an explicit `git mv` — git never
 * records "this was a rename" as a distinct fact in its object model
 * either way.
 *
 * Pending-ness is `store.config.schema_version < 4`, the same
 * schema-version-not-key-presence rule 0003 established, for the same
 * reason: `HarnessSchema`'s fallback transform already populates
 * `guidance_path` on an unmigrated store, so its presence can't distinguish
 * migrated from not.
 */
export const renameConventionsPathMigration: Migration = {
  id: '0004-rename-conventions-path-to-guidance-path',
  fromVersion: 3,
  toVersion: 4,
  description:
    'Rename the harness.conventions_path config key to harness.guidance_path, move the guidance directory when it sat at the old default, and bump schema_version to 4.',

  async plan(store) {
    if (store.config.schema_version >= 4) return [];
    const deltas: MigrationDelta[] = [CONFIG_DELTA];
    if (store.config.harness.guidance_path === OLD_DEFAULT_GUIDANCE_PATH) deltas.push(directoryDelta());
    return deltas;
  },

  async apply(store) {
    if (store.config.schema_version >= 4) return [];

    const configPath = path.join(store.root, 'contexture.yaml');
    // readConfig() already resolves harness.guidance_path via HarnessSchema's
    // fallback (from conventions_path if that's all the file has), so
    // currentConfig.harness carries no conventions_path key at all —
    // rendering it below writes only guidance_path to disk.
    const currentConfig = await readConfig(store.root);
    const appliedDeltas: MigrationDelta[] = [CONFIG_DELTA];

    let guidancePath = currentConfig.harness.guidance_path;
    if (guidancePath === OLD_DEFAULT_GUIDANCE_PATH) {
      const oldDir = path.join(store.root, OLD_DEFAULT_GUIDANCE_PATH);
      const newDir = path.join(store.root, NEW_DEFAULT_GUIDANCE_PATH);
      // Absent when the store never carried any convention files — nothing
      // to move on disk, only the config value changes.
      if (existsSync(oldDir)) {
        await rename(oldDir, newDir);
      }
      guidancePath = NEW_DEFAULT_GUIDANCE_PATH;
      appliedDeltas.push(directoryDelta());
    }

    const nextConfig = {
      ...currentConfig,
      schema_version: 4,
      harness: { ...currentConfig.harness, guidance_path: guidancePath },
    };
    await writeFileAtomic(configPath, renderStoreConfig(nextConfig));

    return appliedDeltas;
  },
};
