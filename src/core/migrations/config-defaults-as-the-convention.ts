import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { redundantKeyPaths, renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

const CONFIG_PATH = 'contexture.yaml';

/**
 * config-defaults-as-the-convention: every store written before this change
 * restates the whole convention verbatim, because `init` wrote every resolved
 * value. That is what made a changed shipped default reach existing stores
 * only through a migration rewriting files whose operators never chose those
 * values.
 *
 * This removes the restatements. It cannot tell an echo `init` wrote from a
 * value an operator typed that happens to equal the default — and treats them
 * the same deliberately: agreeing with the convention is not a decision that
 * needs recording, and after pruning the store resolves the identical value.
 * An operator who wants to pin a value against a future default change
 * re-declares it, which is now a meaningful act rather than one line among
 * forty identical ones.
 *
 * The pruning itself lives in `renderStoreConfig`, not here — every writer
 * goes through it, so this migration only has to trigger a write.
 */
export const configDefaultsAsTheConventionMigration: Migration = {
  id: '0010-config-defaults-as-the-convention',
  fromVersion: 9,
  toVersion: 10,
  description:
    'Remove configuration keys whose value already equals contexture\'s shipped default, so the file records only what the store chose, and bump schema_version to 10.',

  async plan(store) {
    if (store.config.schema_version >= 10) return [];
    const deltas: MigrationDelta[] = [
      { path: CONFIG_PATH, description: 'set schema_version to 10' },
    ];
    for (const key of redundantKeyPaths(store.config)) {
      deltas.push({
        path: CONFIG_PATH,
        description: `remove ${key}, which already holds contexture's shipped default`,
      });
    }
    return deltas;
  },

  async apply(store) {
    if (store.config.schema_version >= 10) return [];

    const currentConfig = await readConfig(store.root);
    const appliedDeltas = await this.plan({ ...store, config: currentConfig });
    // renderStoreConfig drops every redundant key on the way out, and its
    // round-trip re-parse proves the pruned file still resolves to this.
    await writeFileAtomic(path.join(store.root, CONFIG_PATH), renderStoreConfig({ ...currentConfig, schema_version: 10 }));
    return appliedDeltas;
  },
};
