import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { hermeticGitEnv } from './git-env.js';

const execFileAsync = promisify(execFile);

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
}

/**
 * Spawns the real built binary. Integration tests exist to prove real exit
 * codes and real stdout/stderr, so this never mocks anything — a plain pipe
 * for stdin/stdout is not a TTY, so isInteractive() correctly takes the
 * non-interactive branch without needing to explicitly close stdin.
 */
export async function runCli(args: readonly string[], opts: RunCliOptions): Promise<RunCliResult> {
  try {
    const { stdout, stderr } = await execFileAsync('node', [BIN_PATH, ...args], {
      cwd: opts.cwd,
      env: opts.env ?? hermeticGitEnv(),
      timeout: opts.timeoutMs ?? 10_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
  }
}
