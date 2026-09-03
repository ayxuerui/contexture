import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { hashOfCapture } from '../core/ingest/capture-hash.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { evaluateSourceCheck, type IdentityRecord, type SourceCheckResult } from '../core/ingest/model.js';
import { listCaptures, listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SourceCheckFlags {
  path: string;
  sourceId: string;
}

export type SourceCheckData = SourceCheckResult & { path: string };

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * retain-captures-as-provenance: the index is the union of the capture tier
 * and the notes still carrying identity from before it existed. `listNotes`
 * alone would return nothing at all, since the capture root is a declared
 * retrieval exclusion — the candidate itself is read straight off disk, so
 * only the comparison set is affected.
 */
async function identityRecords(store: Store): Promise<IdentityRecord[]> {
  const [captures, notes] = await Promise.all([
    listCaptures(store.root, store.config),
    listNotes(store.root, store.config),
  ]);
  // One file is one record. A store that has not (yet) excluded its capture
  // root would otherwise have every capture enumerated twice, and two records
  // sharing a source-id is exactly the `multiple_matches` refusal — a config
  // gap must not read as an ambiguity in the material.
  const byPath = new Map<string, IdentityRecord>();
  for (const record of [...captures, ...notes]) byPath.set(record.path, record);
  return [...byPath.values()];
}

/**
 * context-ingest spec: evaluate, in order, source-id match then content-
 * hash match, never proceeding past a stage with more than one match. Only
 * `multiple_matches` is a failure (CheckFailed) — `already_ingested`,
 * `alternate_source_match`, and `new` are all legitimate, non-error
 * verdicts the caller decides what to do with.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: SourceCheckFlags,
): Promise<CommandOutcome<SourceCheckData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);

  let hash: string;
  try {
    ({ hash } = await hashOfCapture(store.root, relativePath));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  const records = await identityRecords(store);
  const result = evaluateSourceCheck(records, hash, flags.sourceId, store.config.ingest.tracking_params);

  const findings: Finding[] =
    result.verdict === 'multiple_matches'
      ? [
          {
            code: 'ingest.source_check.multiple_matches',
            severity: 'error',
            message: `More than one existing note matches at the ${result.stage} stage: ${result.matches.join(', ')}.`,
            details: { stage: result.stage, matches: result.matches },
          },
        ]
      : [];

  return {
    exitCode: result.verdict === 'multiple_matches' ? ExitCode.CheckFailed : ExitCode.Ok,
    data: { path: relativePath, ...result },
    findings,
    humanSummary: `${relativePath}: ${result.verdict}${result.matches.length > 0 ? ` (${result.matches.join(', ')})` : ''}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
