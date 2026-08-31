import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Store } from '../store.js';
import type { Migration, MigrationDelta } from './types.js';

const CONFIG_DELTA: MigrationDelta = {
  path: 'contexture.yaml',
  description: 'rename harness.procedures_path to harness.skills_path and set schema_version to 3',
};

/**
 * rename-procedures-to-skills (design.md D2): a single-delta migration —
 * unlike the visibility-field rename, no note frontmatter is touched, since
 * only the config key's spelling changes, never any store file's location
 * (DEFAULT_SKILLS_PATH is already DEFAULT_PROCEDURES_PATH's old value).
 *
 * Pending-ness is `store.config.schema_version < 3`, NOT the presence or
 * absence of `store.config.harness.skills_path` — that field is populated
 * by HarnessSchema's fallback transform even on an unmigrated v2 store (so
 * every command keeps working before `ctxr migrate` runs), which means its
 * presence can never distinguish "already migrated" from "not yet
 * migrated." `schema_version` is the one signal the fallback doesn't mask,
 * and this migration is the only thing that ever sets it to 3.
 */
export const renameProceduresPathMigration: Migration = {
  id: '0003-rename-procedures-path-to-skills-path',
  fromVersion: 2,
  toVersion: 3,
  description: 'Rename the harness.procedures_path config key to harness.skills_path, and bump schema_version to 3.',

  async plan(store) {
    return store.config.schema_version < 3 ? [CONFIG_DELTA] : [];
  },

  async apply(store) {
    if (store.config.schema_version >= 3) return [];

    const configPath = path.join(store.root, 'contexture.yaml');
    // readConfig() already resolves harness.skills_path via HarnessSchema's
    // fallback (from procedures_path if that's all the file has), so
    // currentConfig.harness carries no procedures_path key at all —
    // rendering it below writes only skills_path to disk.
    const currentConfig = await readConfig(store.root);
    const nextConfig = { ...currentConfig, schema_version: 3 };
    await writeFileAtomic(configPath, renderStoreConfig(nextConfig));

    return [CONFIG_DELTA];
  },
};
