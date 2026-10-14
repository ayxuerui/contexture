import type { StoreConfig } from '../../config/schema.js';
import { readBlobs, type GitRunner } from '../git/exec.js';
import { noteAdmission, type Note } from '../notes/list.js';
import { parseNoteText } from '../notes/parse.js';

/** A note read from a commit, with the blob it was read from, so two sides compare by object id rather than by text. */
export interface CommitNote extends Note {
  blob: string;
}

/** A regular-file or executable blob; a symlink (`120000`) is skipped, as the filesystem walk's `isFile()` skips one. */
const FILE_MODES = new Set(['100644', '100755']);

/**
 * The store root's path below the repository's top level, "/"-terminated, or
 * "" when the store is the top level — the prefix every tree path carries and
 * every reported path drops.
 */
export async function storePrefix(git: GitRunner, storeRoot: string): Promise<string> {
  const { stdout } = await git.run(['rev-parse', '--show-prefix'], { cwd: storeRoot });
  return stdout.replace(/\n$/, '');
}

/**
 * review-the-knowledge-diff (D2): the notes a commit holds, enumerated by the
 * same admission rule `listNotes` applies to the filesystem and read through
 * git's object store, so neither side of a graph diff needs a checkout, and
 * the working tree's uncommitted or untracked files never enter it.
 *
 * Paths are relative to the store root and sorted, matching `listNotes`.
 * Writes nothing.
 */
export async function listNotesAtCommit(git: GitRunner, storeRoot: string, commit: string, config: StoreConfig): Promise<CommitNote[]> {
  const prefix = await storePrefix(git, storeRoot);
  const pathspec = prefix === '' ? [] : ['--', prefix];
  const { stdout } = await git.run(['ls-tree', '-r', '-z', '--full-tree', commit, ...pathspec], { cwd: storeRoot });

  const admits = noteAdmission(config);
  const admitted: { path: string; blob: string }[] = [];
  for (const record of stdout.split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const [mode, type, blob] = record.slice(0, tab).split(' ');
    if (type !== 'blob' || !FILE_MODES.has(mode!)) continue;
    const relativePath = record.slice(tab + 1).slice(prefix.length);
    if (admits(relativePath)) admitted.push({ path: relativePath, blob: blob! });
  }
  admitted.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const texts = await readBlobs(storeRoot, admitted.map((entry) => entry.blob));
  return admitted.map((entry) => ({ ...parseNoteText(texts.get(entry.blob)!, entry.path), blob: entry.blob }));
}
