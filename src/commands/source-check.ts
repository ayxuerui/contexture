import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { contentHash } from '../core/content/canonicalize.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { evaluateSourceCheck, type SourceCheckResult } from '../core/ingest/model.js';
import { listNotes } from '../core/notes/list.js';
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
  const absolutePath = path.join(store.root, relativePath);

  let raw: string;
  try {
    raw = await readFile(absolutePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  const hash = contentHash(raw, relativePath);
  const notes = await listNotes(store.root, store.config);
  const result = evaluateSourceCheck(notes, hash, flags.sourceId);

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
