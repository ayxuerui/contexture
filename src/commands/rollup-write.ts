import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import { htmlCommentFence } from '../core/markers.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export const ROLLUP_FENCE = htmlCommentFence('rollup');

export interface RollupWriteFlags {
  entity: string;
  contentFile: string;
}

export interface RollupWriteData {
  path: string;
  changed: boolean;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-organize spec (task 7.3): an idempotent fenced write via the
 * Phase 1 marker-fence primitive — identical content on a second run is a
 * true no-op (byte-identical file, no write at all), and a pre-existing
 * mismatched marker pair in the entity note aborts with zero bytes
 * written, exactly like every other generated-region writer in this
 * codebase. The rollup text itself is supplied by the caller (an agent
 * that already did the reading and synthesis via `rollup gather`'s
 * candidates) — this command's only job is the deterministic write.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: RollupWriteFlags,
): Promise<CommandOutcome<RollupWriteData>> {
  const relativePath = toStoreRelativePath(env, store, flags.entity);
  const absolutePath = path.join(store.root, relativePath);
  if (!existsSync(absolutePath)) throw new NoteNotFoundError(relativePath);

  const contentText = await readFile(flags.contentFile, 'utf8');
  const bodyLines = contentText.split('\n');
  if (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === '') bodyLines.pop();

  const { changed } = await upsertFencedRegionInFile(absolutePath, ROLLUP_FENCE, bodyLines);

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, changed },
    findings: [],
    humanSummary: changed ? `Rollup written into "${relativePath}".` : `Rollup in "${relativePath}" already up to date.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
