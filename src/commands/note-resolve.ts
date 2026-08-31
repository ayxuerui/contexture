import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ExitCode } from '../core/exit-codes.js';
import { parseNote } from '../core/notes/parse.js';
import { resolveVisibility } from '../core/notes/visibility.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface NoteResolveFlags {
  path: string;
}

export interface NoteResolveData {
  path: string;
  visibility: string;
  reason: string;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

export async function execute(
  env: RunEnv,
  store: Store,
  flags: NoteResolveFlags,
): Promise<CommandOutcome<NoteResolveData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);
  const note = await parseNote(absolutePath, relativePath);
  const resolution = resolveVisibility(store.config, note);

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, visibility: resolution.value, reason: resolution.reason },
    findings: [],
    humanSummary: `${relativePath}: ${resolution.value} (${resolution.reason})`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
