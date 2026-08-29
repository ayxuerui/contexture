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
  const [statusResult, numstatResult] = await Promise.all([
    git.run(['diff', '--cached', '--name-status'], { cwd }),
    git.run(['diff', '--cached', '--numstat'], { cwd }),
  ]);

  const statusByPath = new Map<string, StagedFile['status']>();
  for (const line of statusResult.stdout.split('\n').filter(Boolean)) {
    const fields = line.split('\t');
    const code = fields[0]!;
    const targetPath = fields[fields.length - 1]!; // renames: "R100\told\tnew" — last field is the new path
    statusByPath.set(targetPath, parseStatusLetter(code));
  }

  const files: StagedFile[] = [];
  for (const line of numstatResult.stdout.split('\n').filter(Boolean)) {
    const fields = line.split('\t');
    const added = fields[0]!;
    const removed = fields[1]!;
    const targetPath = fields.slice(2).join('\t');
    files.push({
      path: targetPath,
      status: statusByPath.get(targetPath) ?? '?',
      addedLines: added === '-' ? null : Number(added),
      removedLines: removed === '-' ? null : Number(removed),
    });
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
