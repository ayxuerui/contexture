import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

const CONFIG_DELTA: MigrationDelta = {
  path: 'contexture.yaml',
  description: 'remove the visibility:, disclosure:, and fields: blocks, and set schema_version to 8',
};

/** The retired top-level keys, named here as fixed historical literals — no constant for them survives. */
const RETIRED_KEYS = ['visibility', 'disclosure', 'fields'] as const;

/**
 * retire-the-access-axes: the visibility and disclosure axes are removed, and
 * with them `fields.visibility` (the configurable name of the visibility
 * frontmatter key).
 *
 * Unlike 0005, this migration cannot lean on `readConfig` having already
 * stripped the legacy shape: all three keys are TOP-LEVEL, and
 * `StoreConfigSchema` is `.passthrough()`, so they survive parsing intact.
 * Deleting them explicitly is the whole job.
 *
 * No note is rewritten (design.md D3). A note's retired visibility-field key
 * stays in its frontmatter, unread — `parseNote` reads frontmatter into a
 * `Record<string, unknown>` and nothing consumes that key any more, so it
 * costs nothing at runtime and keeps the removal cheap to reverse. Stripping
 * it would make re-entry a hand re-labelling pass over every note.
 *
 * Pending-ness is `schema_version < 8`, not key presence — the rule every
 * migration from 0002 onward established. A store could have had its config
 * hand-edited to drop the keys while still sitting at an older version, and
 * it still needs the version bump.
 */
export const dropAccessAxesMigration: Migration = {
  id: '0008-drop-access-axes',
  fromVersion: 7,
  toVersion: 8,
  description:
    'Remove the visibility:, disclosure:, and fields: blocks from contexture.yaml, and bump schema_version to 8. No note is modified.',

  async plan(store) {
    if (store.config.schema_version >= 8) return [];
    return [CONFIG_DELTA];
  },

  async apply(store) {
    if (store.config.schema_version >= 8) return [];

    const configPath = path.join(store.root, 'contexture.yaml');
    const currentConfig = await readConfig(store.root);
    const nextConfig: Record<string, unknown> = { ...currentConfig, schema_version: 8 };
    for (const key of RETIRED_KEYS) delete nextConfig[key];
    await writeFileAtomic(configPath, renderStoreConfig(nextConfig as Parameters<typeof renderStoreConfig>[0]));

    return [CONFIG_DELTA];
  },
};
