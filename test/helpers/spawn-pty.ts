import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export interface SpawnPtyHandle {
  child: ChildProcessWithoutNullStreams;
  output: string[];
  capturedText(): string;
  waitForOutput(predicate: (text: string) => boolean, timeoutMs?: number): Promise<void>;
}

/**
 * Runs `command` inside a real pseudo-terminal via the system `script`
 * utility, rather than a native addon (node-pty) whose prebuild story is a
 * recurring CI liability for a single test. Linux only — callers should
 * skip on win32.
 */
export function spawnPty(
  command: string,
  opts: { cwd: string; env?: Record<string, string | undefined> },
): SpawnPtyHandle {
  const child = spawn('script', ['-qfec', command, '/dev/null'], {
    cwd: opts.cwd,
    env: opts.env,
  }) as ChildProcessWithoutNullStreams;

  const output: string[] = [];
  child.stdout.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));
  child.stderr.on('data', (chunk: Buffer) => output.push(chunk.toString('utf8')));

  return {
    child,
    output,
    capturedText: () => output.join(''),
    async waitForOutput(predicate, timeoutMs = 5000) {
      const start = Date.now();
      for (;;) {
        if (predicate(output.join(''))) return;
        if (Date.now() - start > timeoutMs) {
          throw new Error(`Timed out waiting for expected pty output. Captured so far:\n${output.join('')}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
  };
}
