import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { DIST_BIN as BIN_PATH } from './dist-bin.js';
import { hermeticGitEnv } from './git-env.js';

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

export interface RunCliBackgroundResult {
  child: ChildProcess;
  /** The first stdout line — a long-running command's one `--json` envelope, emitted before it starts serving. */
  firstLine: string;
}

/**
 * For a command that never exits on its own (`ctxr serve`): spawns the real
 * built binary and resolves as soon as its first stdout line arrives,
 * leaving the process running so the test can act on it (e.g. issue HTTP
 * requests) before calling `stopCliBackground`. `runCli` above cannot be
 * reused for this — it only resolves once the child has already exited.
 */
export async function runCliBackground(args: readonly string[], opts: RunCliOptions): Promise<RunCliBackgroundResult> {
  const child = spawn('node', [BIN_PATH, ...args], { cwd: opts.cwd, env: opts.env ?? hermeticGitEnv() });
  child.stdin.end();

  const firstLine = await new Promise<string>((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex !== -1) {
        child.stdout.off('data', onData);
        resolve(buffer.slice(0, newlineIndex));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`process exited before printing its envelope (code ${code})`)));
  });

  return { child, firstLine };
}

/** Sends SIGTERM and waits for the process to actually exit, so a test can assert clean shutdown. */
export async function stopCliBackground(child: ChildProcess): Promise<void> {
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => child.once('exit', () => resolve()));
}
