import path from 'node:path';
import { DEFAULT_VENDORED_SKILLS } from '../../config/defaults.js';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

/**
 * The shipped set as it stood before this change — a fixed historical literal,
 * never derived from `DEFAULT_VENDORED_SKILLS`. Deriving it would make the
 * "was this list ever customized?" test drift every time the shipped set grows
 * again, silently re-adding to lists a later operator had curated.
 */
const PREVIOUS_SHIPPED_SET = ['frontend-design'];

const SCHEMA_VERSION = 7;

function configDelta(next: readonly string[]): MigrationDelta {
  return {
    path: 'contexture.yaml',
    description: `set skills.vendored to [${next.join(', ')}] and schema_version to ${SCHEMA_VERSION}`,
  };
}

function versionOnlyDelta(): MigrationDelta {
  return {
    path: 'contexture.yaml',
    description: `set schema_version to ${SCHEMA_VERSION}, leaving this store's own skills.vendored list untouched`,
  };
}

/**
 * The list to write, or undefined when this store's is not ours to rewrite.
 *
 * The heuristic 0004 and 0006 both used: a list still sitting exactly on the
 * previous shipped default was never curated, so growing it matches what the
 * operator already accepted. A list that was reordered, added to, or emptied to
 * opt out is a decision, and re-adding to it would overwrite that decision —
 * such a store gets the version bump alone.
 */
function nextVendoredList(current: readonly string[]): string[] | undefined {
  const unchanged =
    current.length === PREVIOUS_SHIPPED_SET.length && current.every((name, i) => name === PREVIOUS_SHIPPED_SET[i]);
  if (!unchanged) return undefined;

  const shipped = [...DEFAULT_VENDORED_SKILLS];
  const added = shipped.filter((name) => !current.includes(name));
  return added.length > 0 ? shipped : undefined;
}

/**
 * vendor-explanation-craft-skill: the shipped vendored set grew a second craft
 * skill, and `init` writes the RESOLVED list into `contexture.yaml` while
 * `reconcileStore` never rewrites configuration. So a change to the shipped
 * default reaches new stores only; without this migration every store already
 * on disk would keep a one-entry list and silently never receive the skill the
 * publish skill now tells it to load.
 *
 * The uncomfortable part, stated rather than implied: `config/schema.ts` says
 * the schema version bumps "only on a genuinely incompatible change, never on
 * an additive one," and adding a skill is additive. This bumps it anyway, which
 * means every existing store reports as needing `ctxr migrate` because a skill
 * was added. That was the accepted price of guaranteed propagation — the
 * alternatives were leaving the shipped default a lie for every store predating
 * it, or an update-time nag that would never stop firing in a store that
 * deliberately opted out. Do not read this as license to bump the version for
 * the next additive change; weigh that one on its own.
 *
 * Pending-ness is the recorded schema version, never the list's contents — the
 * rule 0002, 0004, 0005, and 0006 all follow, because the config schema fills
 * `skills.vendored` from the shipped default when the key is absent, so an
 * unmigrated store already reads as though it declared the new set.
 */
export const addExplanationCraftSkillMigration: Migration = {
  id: '0007-add-explanation-craft-skill',
  fromVersion: 6,
  toVersion: SCHEMA_VERSION,
  description: `Add the explanation craft skill to a store whose skills.vendored list still sits at the previous shipped default, and bump schema_version to ${SCHEMA_VERSION}.`,

  async plan(store) {
    if (store.config.schema_version >= SCHEMA_VERSION) return [];
    const next = nextVendoredList(store.config.skills.vendored);
    return [next ? configDelta(next) : versionOnlyDelta()];
  },

  async apply(store) {
    if (store.config.schema_version >= SCHEMA_VERSION) return [];

    // Re-read from disk rather than trusting the store snapshot: an interrupted
    // run may have written the config already, and resumability means deciding
    // from current state.
    const currentConfig = await readConfig(store.root);
    const next = nextVendoredList(currentConfig.skills.vendored);

    const nextConfig = {
      ...currentConfig,
      schema_version: SCHEMA_VERSION,
      skills: { ...currentConfig.skills, vendored: next ?? currentConfig.skills.vendored },
    };
    await writeFileAtomic(path.join(store.root, 'contexture.yaml'), renderStoreConfig(nextConfig));

    return [next ? configDelta(next) : versionOnlyDelta()];
  },
};
