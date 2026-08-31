import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { readFencedRegionFromFile, upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import { htmlCommentFence } from '../core/markers.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface EntryAppendFlags {
  path: string;
  region: string;
  text: string;
}

export interface EntryAppendData {
  path: string;
  region: string;
  lines: number;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * context-store spec (D1): the one structured-write primitive many audited
 * procedures reduce to — "append a line into a known block and keep
 * everything else intact." Uses the same `contexture:<region>` marker-fence
 * primitive every other generated region uses, so a mismatched marker pair
 * aborts with zero bytes written, exactly like everywhere else, and
 * `ctxr-derived-artifacts`'s "never hand-edit inside a fence" rule applies
 * to this region too.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: EntryAppendFlags,
): Promise<CommandOutcome<EntryAppendData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);
  if (!existsSync(absolutePath)) throw new NoteNotFoundError(relativePath);

  const fence = htmlCommentFence(flags.region);
  const existingLines = await readFencedRegionFromFile(absolutePath, fence);
  const newLines = [...existingLines, flags.text];

  await upsertFencedRegionInFile(absolutePath, fence, newLines);

  return {
    exitCode: ExitCode.Ok,
    data: { path: relativePath, region: flags.region, lines: newLines.length },
    findings: [],
    humanSummary: `Appended to region "${flags.region}" in "${relativePath}" (${newLines.length} line(s)).`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
