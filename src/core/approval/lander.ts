import { spawn } from 'node:child_process';

/**
 * change-approval spec ("The server lands what was approved";
 * serve-lands-approved-changes D2, D3): `ctxr serve` lands approved changes by
 * running `ctxr land --pending` — the same command a person runs — as a child
 * process, so a resolver that runs for minutes, a hang or a crash stays out of
 * the request loop. The one place serve spawns it.
 *
 * Three states: idle, running, running with one more run pending. Any number of
 * triggers during a run produce exactly one further run. A sweep triggers every
 * `sweepMs`, and once shortly after start, so approvals recorded while the
 * server was down land promptly.
 */
export interface Lander {
  trigger(): void;
  stop(): Promise<void>;
}

export interface ChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  once(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnLike = (command: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildLike;

export interface LanderOptions {
  /** The executable and its leading arguments, e.g. [node, bin.js]. */
  command: readonly string[];
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  output: NodeJS.WritableStream;
  sweepMs?: number;
  firstSweepMs?: number;
  spawn?: SpawnLike;
}

const DEFAULT_SWEEP_MS = 5 * 60 * 1000;
const DEFAULT_FIRST_SWEEP_MS = 10 * 1000;

const realSpawn: SpawnLike = (command, args, opts) => spawn(command, args, { cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });

/** Each line of a stream to `output`, prefixed, so the run reads apart from serve's own log. */
function prefixLines(stream: NodeJS.ReadableStream | null, output: NodeJS.WritableStream): void {
  if (stream === null) return;
  let partial = '';
  stream.on('data', (chunk: Buffer | string) => {
    const lines = (partial + chunk.toString()).split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) output.write(`land: ${line}\n`);
  });
  stream.on('end', () => {
    if (partial !== '') output.write(`land: ${partial}\n`);
    partial = '';
  });
}

export function createLander(opts: LanderOptions): Lander {
  const [command, ...leading] = opts.command;
  const spawnChild = opts.spawn ?? realSpawn;
  let child: ChildLike | null = null;
  let closed: Promise<void> | null = null;
  let pending = false;
  let stopped = false;

  function start(): void {
    const run = spawnChild(command!, [...leading, 'land', '--pending', '--root', opts.root], {
      cwd: opts.root,
      env: opts.env as NodeJS.ProcessEnv,
    });
    child = run;
    prefixLines(run.stdout, opts.output);
    prefixLines(run.stderr, opts.output);
    closed = new Promise((resolve) => {
      run.once('close', (code) => {
        if (code !== 0) opts.output.write(`land: the landing run exited ${code ?? 'on a signal'}\n`);
        child = null;
        closed = null;
        resolve();
        if (pending && !stopped) {
          pending = false;
          start();
        }
      });
    });
  }

  function trigger(): void {
    if (stopped) return;
    if (child !== null) {
      pending = true;
      return;
    }
    start();
  }

  let timer: NodeJS.Timeout = setTimeout(function sweep() {
    trigger();
    timer = setTimeout(sweep, opts.sweepMs ?? DEFAULT_SWEEP_MS);
    timer.unref();
  }, opts.firstSweepMs ?? DEFAULT_FIRST_SWEEP_MS);
  timer.unref();

  return {
    trigger,
    async stop() {
      stopped = true;
      pending = false;
      clearTimeout(timer);
      if (child !== null) {
        const waiting = closed;
        child.kill('SIGTERM');
        await waiting;
      }
    },
  };
}
