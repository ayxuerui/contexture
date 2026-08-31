import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { contentHash } from '../core/content/canonicalize.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SourceHashFlags {
  path: string;
}

export interface SourceHashData {
  path: string;
  hash: string;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/** context-ingest spec: the canonicalized-content hash, via the one shared primitive — never reimplemented per caller. */
export async function execute(env: RunEnv, store: Store, flags: SourceHashFlags): Promise<CommandOutcome<SourceHashData>> {
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
  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, hash },
    findings: [],
    humanSummary: `${relativePath}: ${hash}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
