import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { listNotes } from '../core/notes/list.js';
import { findStaleRollups, type StaleRollupEntry } from '../core/rollup.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface RollupStaleFlags {
  for?: string;
}

export interface RollupStaleData {
  stale: StaleRollupEntry[];
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-organize spec (D4): staleness is computed on demand, never
 * cached — this command and the `organize.rollup_stale` lint check share
 * the exact same computation, bounded by the same `organize.rollup_stale_days`.
 */
export async function execute(env: RunEnv, store: Store, flags: RollupStaleFlags): Promise<CommandOutcome<RollupStaleData>> {
  let entity: string | undefined;
  if (flags.for) {
    entity = toStoreRelativePath(env, store, flags.for);
    if (!existsSync(path.join(store.root, entity))) throw new NoteNotFoundError(entity);
  }

  const notes = await listNotes(store.root, store.config);
  const stale = await findStaleRollups(
    env.git,
    store.root,
    notes,
    { entity, missionPath: store.config.organize.mission_path },
    store.config.organize.rollup_stale_days,
    env.now(),
  );

  return {
    exitCode: ExitCode.Ok,
    data: { stale },
    findings: [],
    humanSummary: `${stale.length} stale rollup(s).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
