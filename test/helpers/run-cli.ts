import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hermeticGitEnv } from './git-env.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BIN_PATH = path.resolve(HERE, '../../dist/bin.js');

export interface RunCliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface RunCliOptions {
  cwd: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  /** Piped to the child's stdin, then closed — for hook-protocol commands that read stdin (e.g. `adapters write-gate`). */
  stdin?: string;
}

/**
 * Spawns the real built binary. Integration tests exist to prove real exit
 * codes and real stdout/stderr, so this never mocks anything — a plain pipe
 * for stdin/stdout is not a TTY, so isInteractive() correctly takes the
 * non-interactive branch without needing to explicitly close stdin.
 *
 * Uses the callback form of `execFile` directly (not its promisified
 * wrapper) because only the callback form returns the `ChildProcess`
 * synchronously — the one way to write to and close its stdin. The
 * promisified wrapper's nonexistent `input` option would silently do
 * nothing, leaving a stdin-reading child (like the write-gate hook) blocked
 * forever waiting for an EOF that never comes.
 */
export async function runCli(args: readonly string[], opts: RunCliOptions): Promise<RunCliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'node',
      [BIN_PATH, ...args],
      { cwd: opts.cwd, env: opts.env ?? hermeticGitEnv(), timeout: opts.timeoutMs ?? 10_000 },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as NodeJS.ErrnoException & { code?: number | string };
          const exitCode = typeof e.code === 'number' ? e.code : 1;
          resolve({ stdout, stderr, exitCode });
        } else {
          resolve({ stdout, stderr, exitCode: 0 });
        }
      },
    );
    child.stdin?.end(opts.stdin ?? '');
  });
}
