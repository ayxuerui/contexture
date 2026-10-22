import type { StagedFile } from '../checks/types.js';
import type { GitRunner } from './exec.js';

const MAX_CONTENT_BYTES = 2 * 1024 * 1024; // 2MB — large staged files aren't scanned, not silently skipped-and-passed

function parseStatusLetter(code: string): StagedFile['status'] {
  const letter = code.charAt(0);
  if (letter === 'A' || letter === 'M' || letter === 'D' || letter === 'R') return letter;
  return '?';
}

/**
 * Gathers every staged (index) change: path, status, added/removed line
 * counts, and (for non-deleted files under a size cap) the staged content
 * itself — computed once, up front, so each staged-scope check is a pure
 * function of the CheckContext rather than re-invoking git per check.
 */
export async function getStagedFiles(git: GitRunner, cwd: string): Promise<StagedFile[]> {
  // `-z` keeps every path exact. Without it, `--numstat` prints a rename as
  // "dir/{old => new}/file", which names no file and loses the rename's status.
  const [statusResult, numstatResult] = await Promise.all([
    git.run(['diff', '--cached', '--name-status', '-z'], { cwd }),
    git.run(['diff', '--cached', '--numstat', '-z'], { cwd }),
  ]);

  // "<code>\0<path>\0", or for a rename or copy "<code>\0<old>\0<new>\0".
  const statusByPath = new Map<string, { status: StagedFile['status']; renameScore?: number }>();
  const statusFields = statusResult.stdout.split('\0');
  for (let i = 0; i < statusFields.length && statusFields[i]; ) {
    const code = statusFields[i]!;
    const twoPaths = code.startsWith('R') || code.startsWith('C');
    const targetPath = statusFields[i + (twoPaths ? 2 : 1)]!;
    const entry: { status: StagedFile['status']; renameScore?: number } = { status: parseStatusLetter(code) };
    // send-copies-gated-at-commit D2: "R100" is a pure move; a lower score changed bytes.
    if (code.startsWith('R') && /^R\d+$/.test(code)) entry.renameScore = Number(code.slice(1));
    statusByPath.set(targetPath, entry);
    i += twoPaths ? 3 : 2;
  }

  // "<added>\t<removed>\t<path>\0", or for a rename "<added>\t<removed>\t\0<old>\0<new>\0".
  const files: StagedFile[] = [];
  const numstatFields = numstatResult.stdout.split('\0');
  for (let i = 0; i < numstatFields.length && numstatFields[i]; ) {
    const [added, removed, inlinePath] = numstatFields[i]!.split('\t');
    const targetPath = inlinePath ? inlinePath : numstatFields[i + 2]!;
    i += inlinePath ? 1 : 3;
    const entry = statusByPath.get(targetPath);
    const file: StagedFile = {
      path: targetPath,
      status: entry?.status ?? '?',
      addedLines: added === '-' ? null : Number(added),
      removedLines: removed === '-' ? null : Number(removed),
    };
    if (entry?.renameScore !== undefined) file.renameScore = entry.renameScore;
    files.push(file);
  }

  await Promise.all(
    files.map(async (file) => {
      if (file.status === 'D') return;
      const result = await git.run(['show', `:${file.path}`], { cwd, allowFailure: true });
      if (result.exitCode === 0 && Buffer.byteLength(result.stdout, 'utf8') <= MAX_CONTENT_BYTES) {
        file.content = result.stdout;
      }
    }),
  );

  return files;
}
