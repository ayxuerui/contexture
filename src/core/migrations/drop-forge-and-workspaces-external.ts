import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

const CONFIG_DELTA: MigrationDelta = {
  path: 'contexture.yaml',
  description: 'strip any legacy kind: forge adapter declarations and the session.workspaces_external key, and set schema_version to 5',
};

/**
 * session-keeps-only-what-git-cannot-do (design D2): `ctxr session
 * submit`/`land`/`abandon`/`reap` and the `forge` adapter kind are removed;
 * `session.workspaces_external` goes with them, its skill-rendering half
 * never having worked as shipped. Both legacy shapes are ALREADY stripped
 * by the time `readConfig` returns — the adapters field's lenient schema
 * transform drops a `kind: forge` entry (session-keeps-only-what-git-cannot-do
 * D2), and `SessionSchema`'s default strip-unknown-keys behavior drops
 * `workspaces_external` — so this migration's only real work is bumping
 * `schema_version` and writing the already-clean config back to disk.
 *
 * Pending-ness is `schema_version < 5`, not key presence — the same rule
 * 0002 and 0004 established, for the same reason: an unmigrated store
 * already parses as though the legacy shape were gone, so its presence in
 * the parsed config can't distinguish migrated from not.
 */
export const dropForgeAndWorkspacesExternalMigration: Migration = {
  id: '0005-drop-forge-and-workspaces-external',
  fromVersion: 4,
  toVersion: 5,
  description:
    'Strip any legacy kind: forge adapter declarations and the session.workspaces_external key from contexture.yaml, and bump schema_version to 5.',

  async plan(store) {
    if (store.config.schema_version >= 5) return [];
    return [CONFIG_DELTA];
  },

  async apply(store) {
    if (store.config.schema_version >= 5) return [];

    const configPath = path.join(store.root, 'contexture.yaml');
    // readConfig() already applies the lenient schema — a raw `kind: forge`
    // entry and a raw `session.workspaces_external` key are both gone from
    // this object before this line runs; writing it back is what removes
    // them from disk.
    const currentConfig = await readConfig(store.root);
    const nextConfig = { ...currentConfig, schema_version: 5 };
    await writeFileAtomic(configPath, renderStoreConfig(nextConfig));

    return [CONFIG_DELTA];
  },
};
