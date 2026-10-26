import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * serve-the-session-lifecycle-to-chat-apps D4: the one module that spawns the
 * server's own CLI for the `ctxr` and `ctxr_write` tools. Always
 * `process.execPath` plus this package's own entry script, never a `PATH`
 * lookup — a resolved `ctxr` could be another installation — and always an
 * argument vector, never a shell. The run is killed at the time bound and
 * each stream is kept to the output bound; whatever is cut is said to be.
 */

/**
 * D4, task 4.2: the time bound. Measured on generated stores of 2,539 and
 * 5,039 linked notes (11 and 21 MB) on a 4-core host: `ctxr doctor` took
 * 0.9 s and 1.2 s, `ctxr lint` — the slowest allowlisted command there —
 * 1.2 s and 1.7 s, `graph build` 0.8 s and 1.0 s. 30 s leaves more than an
 * order of magnitude for a busier server, a slower disk and a larger store,
 * while still stopping a run that has hung. Task 9.1 times it on pkm itself.
 */
export const CLI_TIMEOUT_MS = 30_000;
/** D4: each output stream is bounded to this many bytes. */
export const CLI_MAX_OUTPUT_BYTES = 256 * 1024;

/** This package's own CLI entry, beside the module that asks — the built `bin.js` in a release. */
export function packagedCliEntry(): string {
  return fileURLToPath(new URL('../../bin.js', import.meta.url));
}

export interface CliRunResult {
  /** Null when the run was killed. */
  exit_code: number | null;
  stdout: string;
  stderr: string;
  stdout_truncated: boolean;
  stderr_truncated: boolean;
  timed_out: boolean;
  duration_ms: number;
}

export interface CliRunOptions {
  entry: string;
  argv: readonly string[];
  cwd: string;
  env: Record<string, string>;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

class Bounded {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  truncated = false;

  constructor(private readonly limit: number) {}

  push(chunk: Buffer): void {
    if (this.size >= this.limit) {
      this.truncated = true;
      return;
    }
    const room = this.limit - this.size;
    const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
    if (kept.length < chunk.length) this.truncated = true;
    this.chunks.push(kept);
    this.size += kept.length;
  }

  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

export function runServerCli(opts: CliRunOptions): Promise<CliRunResult> {
  const timeoutMs = opts.timeoutMs ?? CLI_TIMEOUT_MS;
  const limit = opts.maxOutputBytes ?? CLI_MAX_OUTPUT_BYTES;
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [opts.entry, ...opts.argv], { cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    const out = new Bounded(limit);
    const err = new Bounded(limit);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    const finish = (code: number | null, error?: Error): void => {
      clearTimeout(timer);
      resolve({
        exit_code: timedOut ? null : code,
        stdout: out.text(),
        stderr: error === undefined ? err.text() : `${err.text()}${error.message}\n`,
        stdout_truncated: out.truncated,
        stderr_truncated: err.truncated,
        timed_out: timedOut,
        duration_ms: Date.now() - started,
      });
    };
    child.on('error', (error) => finish(null, error));
    child.on('close', (code) => finish(code));
  });
}
