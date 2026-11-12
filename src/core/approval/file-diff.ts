import type { GitRunner } from '../git/exec.js';
import { escapeHtml } from '../browse/render.js';

/**
 * change-approval spec ("The approval page shows the change itself"): every
 * file under the store root that differs between the base and the pull
 * request's head, as removed and added lines. Read from git's object store
 * with a three-dot range, so the base is the merge base and the worktree's
 * uncommitted work never enters it; derived cache paths are excluded.
 */
export interface DiffLine {
  kind: 'add' | 'del' | 'ctx';
  text: string;
}

export interface FileDiff {
  path: string;
  /** Set when git detected a rename. */
  oldPath: string | null;
  status: 'added' | 'removed' | 'modified' | 'moved';
  binary: boolean;
  hunks: { header: string; lines: DiffLine[] }[];
}

export async function readFileDiffs(git: GitRunner, storeRoot: string, base: string, head: string, derivedPaths: readonly string[]): Promise<FileDiff[]> {
  const excludes = derivedPaths.map((p) => `:(exclude)${p.replace(/\/+$/, '')}`);
  const { stdout } = await git.run(
    ['diff', '--no-color', '--no-ext-diff', '-M', '--relative', `${base}...${head}`, '--', '.', ...excludes],
    { cwd: storeRoot },
  );
  return parseUnifiedDiff(stdout);
}

function unquote(raw: string): string {
  if (!raw.startsWith('"')) return raw;
  return JSON.parse(raw.replace(/\\([0-7]{3})/g, (_m, oct: string) => `\\u00${Number.parseInt(oct, 8).toString(16).padStart(2, '0')}`)) as string;
}

/** Parses `git diff` output. Exported for tests. */
export function parseUnifiedDiff(text: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | null = null;
  let hunk: FileDiff['hunks'][number] | null = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const match = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
      current = { path: unquote(match?.[2] ?? line), oldPath: null, status: 'modified', binary: false, hunks: [] };
      hunk = null;
      files.push(current);
      continue;
    }
    if (current === null) continue;
    if (hunk === null) {
      if (line.startsWith('new file mode')) current.status = 'added';
      else if (line.startsWith('deleted file mode')) current.status = 'removed';
      else if (line.startsWith('rename from ')) {
        current.oldPath = unquote(line.slice('rename from '.length));
        current.status = 'moved';
      } else if (line.startsWith('rename to ')) current.path = unquote(line.slice('rename to '.length));
      else if (line.startsWith('Binary files ')) current.binary = true;
      else if (line.startsWith('@@')) {
        hunk = { header: line, lines: [] };
        current.hunks.push(hunk);
      }
      continue;
    }
    if (line.startsWith('@@')) {
      hunk = { header: line, lines: [] };
      current.hunks.push(hunk);
    } else if (line.startsWith('+')) hunk.lines.push({ kind: 'add', text: line.slice(1) });
    else if (line.startsWith('-')) hunk.lines.push({ kind: 'del', text: line.slice(1) });
    else if (line.startsWith(' ')) hunk.lines.push({ kind: 'ctx', text: line.slice(1) });
    // "\ No newline at end of file" and the trailing empty line carry nothing to show.
  }
  return files;
}

const MARK: Readonly<Record<DiffLine['kind'], string>> = { add: '+', del: '−', ctx: ' ' };
const LABEL: Readonly<Record<DiffLine['kind'], string>> = { add: 'added', del: 'removed', ctx: 'unchanged' };

/** Each file as a heading and a block of marked lines — readable with no script and no colour. */
export function renderFileDiffs(files: readonly FileDiff[], labels: { binary: string; noFiles: string }): string {
  if (files.length === 0) return `<p class="ctxr-empty">${escapeHtml(labels.noFiles)}</p>`;
  return files
    .map((file) => {
      const title = file.oldPath === null ? file.path : `${file.oldPath} → ${file.path}`;
      const body = file.binary
        ? `<p class="ctxr-empty">${escapeHtml(labels.binary)}</p>`
        : file.hunks
            .map((h) => {
              const rows = h.lines
                .map((l) => `<span class="ctxr-diff-${l.kind}" title="${LABEL[l.kind]}">${MARK[l.kind]} ${escapeHtml(l.text)}</span>`)
                .join('\n');
              return `<pre class="ctxr-diff"><span class="ctxr-diff-hunk">${escapeHtml(h.header)}</span>\n${rows}</pre>`;
            })
            .join('\n');
      return `<section class="ctxr-diff-file"><h3><code>${escapeHtml(title)}</code> <span class="ctxr-diff-status">${escapeHtml(file.status)}</span></h3>\n${body}</section>`;
    })
    .join('\n');
}
