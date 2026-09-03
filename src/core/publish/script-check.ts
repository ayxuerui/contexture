import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ScriptSyntaxError {
  index: number;
  message: string;
}

/**
 * publish spec: the sole spawn site for `node --check` (single-source-
 * literals guard), the same discipline core/git/exec.ts applies to git and
 * core/harness/isolated-run.ts applies to re-executing this CLI — one
 * dedicated module per external process, never ad hoc subprocess spawning
 * scattered across commands. (The former gh spawn site went with the forge
 * adapter; nothing in src/ spawns gh, and the portability test only resolves
 * it on PATH.)
 */
export async function checkScriptSyntax(scripts: readonly string[]): Promise<ScriptSyntaxError[]> {
  if (scripts.length === 0) return [];

  const dir = await mkdtemp(path.join(tmpdir(), 'ctxr-publish-check-'));
  try {
    const errors: ScriptSyntaxError[] = [];
    for (const [index, script] of scripts.entries()) {
      const file = path.join(dir, `block-${index}.js`);
      await writeFile(file, script, 'utf8');
      try {
        await execFileAsync(process.execPath, ['--check', file]);
      } catch (err) {
        const stderr = err instanceof Error && 'stderr' in err ? String((err as { stderr?: unknown }).stderr) : String(err);
        const lines = stderr.trim().split('\n');
        const location = lines[0] ?? '';
        const errorLine = lines.find((line) => /Error:/.test(line)) ?? lines[lines.length - 1] ?? '';
        errors.push({ index, message: `${location} — ${errorLine}`.trim() });
      }
    }
    return errors;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
