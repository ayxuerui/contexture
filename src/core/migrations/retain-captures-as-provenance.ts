import { existsSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_CAPTURE_ROOT, DEFAULT_INBOX_PATH } from '../../config/defaults.js';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { CaptureRootUndeterminedError } from '../errors.js';
import { writeFileAtomic } from '../fs/atomic.js';
import type { Migration, MigrationDelta } from './types.js';

/**
 * The inbox default as it stood before this migration. Pinned locally, never
 * read from `defaults.ts`: a migration reasons about the value a store was
 * born with, which must not drift when the shipped default moves again.
 */
const PREVIOUS_DEFAULT_INBOX_PATH = 'inbox/';

function normalize(prefix: string): string {
  return prefix.replace(/\/+$/, '');
}

/** The directory one level above `inboxPath`, or null when the inbox is already top-level. */
function parentDirectoryOf(inboxPath: string): string | null {
  const segments = normalize(inboxPath).split('/').filter((segment) => segment !== '');
  if (segments.length < 2) return null;
  return `${segments.slice(0, -1).join('/')}/`;
}

interface CaptureTier {
  inboxPath: string;
  captureRoot: string;
  /** True only for a store still sitting on the previous shipped default, whose inbox this migration relocates. */
  adoptsShippedDefault: boolean;
}

/**
 * Where this store's capture tier lands. Two cases and one refusal:
 *
 * 1. The store never customized its inbox, so it is ours to move: adopt the
 *    shipped `raw/inbox/` under `raw/`.
 * 2. The store chose an inbox nested at least one level (`staging/inbox/`):
 *    the parent it already chose IS the capture root. The inbox is left
 *    exactly as the operator set it.
 * 3. The store chose a top-level inbox of its own (`incoming/`): there is no
 *    parent to promote short of the store root, and excluding the store root
 *    from retrieval would empty the note list. Refuse before writing
 *    anything and let the operator choose, the same way `source check`
 *    refuses to guess among multiple matches.
 */
function resolveCaptureTier(inboxPath: string): CaptureTier {
  if (normalize(inboxPath) === normalize(PREVIOUS_DEFAULT_INBOX_PATH)) {
    return { inboxPath: DEFAULT_INBOX_PATH, captureRoot: DEFAULT_CAPTURE_ROOT, adoptsShippedDefault: true };
  }
  const parent = parentDirectoryOf(inboxPath);
  if (parent === null) throw new CaptureRootUndeterminedError(inboxPath);
  return { inboxPath, captureRoot: parent, adoptsShippedDefault: false };
}

function alreadyExcluded(excludePaths: readonly string[], captureRoot: string): boolean {
  return excludePaths.some((excluded) => normalize(excluded) === normalize(captureRoot));
}

/**
 * retain-captures-as-provenance: captures stop being consumed by ingest and
 * start being retained as the store's provenance ledger, which means they
 * stop being notes. That needs three things on an existing store — a
 * declared capture root, an inbox inside it, and the root excluded from
 * retrieval — and this migration supplies all three.
 *
 * Modelled on 0006: adopt the new shipped default only where the value still
 * sat at the old one, preserve an operator-chosen value verbatim, and move
 * the directory when one exists. Pending-ness is `schema_version < 9`, not
 * key presence, for the reason 0002/0004/0005/0006 all record: the schema's
 * transform fills `capture_root` in on an unmigrated store too, so its
 * presence cannot distinguish migrated from not.
 *
 * The directory move runs before the config write, so an interruption
 * between them leaves the next run able to re-derive what is left: the
 * config still reads schema 8 with the old inbox, the old directory is
 * already gone, and the rename is skipped as done.
 */
export const retainCapturesAsProvenanceMigration: Migration = {
  id: '0009-retain-captures-as-provenance',
  fromVersion: 8,
  toVersion: 9,
  description:
    'Declare the capture tier: add ingest.capture_root, move a default-valued inbox inside it, exclude the capture root from retrieval, and bump schema_version to 9.',

  async plan(store) {
    if (store.config.schema_version >= 9) return [];
    const tier = resolveCaptureTier(store.config.ingest.inbox_path);
    const deltas: MigrationDelta[] = [
      {
        path: 'contexture.yaml',
        description: `add ingest.capture_root: ${tier.captureRoot} and set schema_version to 9`,
      },
    ];
    if (tier.adoptsShippedDefault) {
      deltas.push({
        path: 'contexture.yaml',
        description: `adopt the shipped inbox default, moving ingest.inbox_path from ${PREVIOUS_DEFAULT_INBOX_PATH} to ${tier.inboxPath}`,
      });
      if (existsSync(path.join(store.root, PREVIOUS_DEFAULT_INBOX_PATH))) {
        deltas.push({
          path: tier.inboxPath,
          description: `move the inbox directory from ${PREVIOUS_DEFAULT_INBOX_PATH} to ${tier.inboxPath}`,
        });
      }
    }
    if (!alreadyExcluded(store.config.retrieval.exclude_paths, tier.captureRoot)) {
      deltas.push({
        path: 'contexture.yaml',
        description: `add ${tier.captureRoot} to retrieval.exclude_paths, so retained captures are never notes`,
      });
    }
    return deltas;
  },

  async apply(store) {
    if (store.config.schema_version >= 9) return [];

    const currentConfig = await readConfig(store.root);
    const tier = resolveCaptureTier(currentConfig.ingest.inbox_path);
    const appliedDeltas = await this.plan({ ...store, config: currentConfig });

    if (tier.adoptsShippedDefault) {
      const oldDir = path.join(store.root, PREVIOUS_DEFAULT_INBOX_PATH);
      const newDir = path.join(store.root, tier.inboxPath);
      // Absent whenever nothing was ever captured — only the config changes.
      if (existsSync(oldDir) && !existsSync(newDir)) {
        await mkdir(path.dirname(newDir), { recursive: true });
        await rename(oldDir, newDir);
      }
    }

    const excludePaths = alreadyExcluded(currentConfig.retrieval.exclude_paths, tier.captureRoot)
      ? [...currentConfig.retrieval.exclude_paths]
      : [...currentConfig.retrieval.exclude_paths, tier.captureRoot];

    const nextConfig = {
      ...currentConfig,
      schema_version: 9,
      retrieval: { ...currentConfig.retrieval, exclude_paths: excludePaths },
      ingest: { ...currentConfig.ingest, inbox_path: tier.inboxPath, capture_root: tier.captureRoot },
    };
    await writeFileAtomic(path.join(store.root, 'contexture.yaml'), renderStoreConfig(nextConfig));

    return appliedDeltas;
  },
};
