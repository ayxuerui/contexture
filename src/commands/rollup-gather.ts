import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { extractLinkTargets } from '../core/graph/model.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface RollupGatherFlags {
  entity: string;
}

export interface RollupGatherData {
  entity: string;
  candidates: string[];
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-organize spec (task 7.3): agent-facing enumeration only — this
 * command finds candidate source notes (every note linking to the entity
 * by wikilink), it does not read or synthesize them. The actual judgment
 * of what belongs in a rollup, and the prose itself, stays with the agent;
 * `rollup write` is the separate, deterministic step that commits that
 * agent-authored prose to disk.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: RollupGatherFlags,
): Promise<CommandOutcome<RollupGatherData>> {
  const relativePath = toStoreRelativePath(env, store, flags.entity);
  if (!existsSync(path.join(store.root, relativePath))) throw new NoteNotFoundError(relativePath);

  const stem = path.basename(relativePath, '.md');
  const notes = await listNotes(store.root, store.config);
  const candidates = notes
    .filter((note) => note.path !== relativePath)
    .filter((note) => extractLinkTargets(note.body).includes(stem))
    .map((note) => note.path)
    .sort();

  return {
    exitCode: ExitCode.Ok,
    data: { entity: relativePath, candidates },
    findings: [],
    humanSummary: `${candidates.length} candidate source note(s) for "${relativePath}".`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
