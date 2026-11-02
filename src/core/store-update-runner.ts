import { spawn } from 'node:child_process';

/**
 * context-browsing spec ("The server keeps its clone of the store current";
 * "Store-update runs never overlap and never change how requests are
 * answered"), change-approval spec ("The server lands what was approved"):
 * `ctxr serve`'s one timer. Each store-update run is a child process running
 * the same command a person runs — `ctxr land --pending` while the loaded
 * configuration turns landing on, `ctxr sync` otherwise — so a resolver that
 * runs for minutes, a hung fetch or a crash stays out of the request loop
 * (serve-lands-approved-changes D2; serve-keeps-its-clone-current D1, D2).
 * The one place serve spawns either.
 *
 * Three states: idle, running, running with one more run pending. Any number
 * of triggers during a run produce exactly one further run. A run starts once
 * shortly after start (D5), then every `intervalMs`, so a change merged on the
 * forge, or an approval recorded while the server was down, is picked up
 * promptly. The runner itself runs no git: each child's git is hardened by the
 * command it runs (D12).
 */
export type StoreUpdateKind = 'land' | 'sync';

export interface StoreUpdateSettings {
  kind: StoreUpdateKind;
  intervalMs: number;
}

export interface StoreUpdateRunner {
  /** Starts a run now, or one more after the run in progress. */
  trigger(): void;
  /** The kind the next run starts as. */
  kind(): StoreUpdateKind;
  /**
   * Follows a configuration reload: the next run starts as `kind`, and a new
   * interval reschedules the next timed run `intervalMs` from now. A run in
   * progress is left to finish.
   */
  configure(settings: StoreUpdateSettings): void;
  stop(): Promise<void>;
}

export interface ChildLike {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  once(event: 'close', listener: (code: number | null) => void): unknown;
  kill(signal?: NodeJS.Signals): boolean;
}

export type SpawnLike = (command: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }) => ChildLike;

export interface StoreUpdateRunnerOptions extends StoreUpdateSettings {
  /** The executable and its leading arguments, e.g. [node, bin.js]. */
  command: readonly string[];
  root: string;
  env: Readonly<Record<string, string | undefined>>;
  output: NodeJS.WritableStream;
  firstRunMs?: number;
  spawn?: SpawnLike;
}

const DEFAULT_FIRST_RUN_MS = 10 * 1000;

const ARGS: Readonly<Record<StoreUpdateKind, readonly string[]>> = {
  land: ['land', '--pending'],
  sync: ['sync'],
};

const FAILED: Readonly<Record<StoreUpdateKind, string>> = {
  land: 'the landing run',
  sync: 'the sync run',
};

const realSpawn: SpawnLike = (command, args, opts) => spawn(command, args, { cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });

/** Each line of a stream to `output`, prefixed by the run's kind, so the run reads apart from serve's own log. */
function prefixLines(stream: NodeJS.ReadableStream | null, output: NodeJS.WritableStream, prefix: string): void {
  if (stream === null) return;
  let partial = '';
  stream.on('data', (chunk: Buffer | string) => {
    const lines = (partial + chunk.toString()).split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) output.write(`${prefix}: ${line}\n`);
  });
  stream.on('end', () => {
    if (partial !== '') output.write(`${prefix}: ${partial}\n`);
    partial = '';
  });
}

export function createStoreUpdateRunner(opts: StoreUpdateRunnerOptions): StoreUpdateRunner {
  const [command, ...leading] = opts.command;
  const spawnChild = opts.spawn ?? realSpawn;
  let settings: StoreUpdateSettings = { kind: opts.kind, intervalMs: opts.intervalMs };
  let child: ChildLike | null = null;
  let closed: Promise<void> | null = null;
  let pending = false;
  let stopped = false;
  let firstDone = false;

  function start(): void {
    const kind = settings.kind;
    const run = spawnChild(command!, [...leading, ...ARGS[kind], '--root', opts.root], {
      cwd: opts.root,
      env: opts.env as NodeJS.ProcessEnv,
    });
    child = run;
    prefixLines(run.stdout, opts.output, kind);
    prefixLines(run.stderr, opts.output, kind);
    closed = new Promise((resolve) => {
      run.once('close', (code) => {
        if (code !== 0) opts.output.write(`${kind}: ${FAILED[kind]} exited ${code ?? 'on a signal'}\n`);
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

  let timer: NodeJS.Timeout;
  function schedule(delay: number): void {
    timer = setTimeout(() => {
      firstDone = true;
      trigger();
      schedule(settings.intervalMs);
    }, delay);
    timer.unref();
  }
  schedule(opts.firstRunMs ?? DEFAULT_FIRST_RUN_MS);

  return {
    trigger,
    kind: () => settings.kind,
    configure(next) {
      const intervalChanged = next.intervalMs !== settings.intervalMs;
      settings = { ...next };
      // Before the first run, its timer stands; after it, a new interval counts from now.
      if (intervalChanged && firstDone && !stopped) {
        clearTimeout(timer);
        schedule(settings.intervalMs);
      }
    },
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
