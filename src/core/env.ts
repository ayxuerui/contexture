import type { Prompter } from '../prompt/prompter.js';
import type { GitRunner } from './git/exec.js';
import { createExecFileGitRunner } from './git/exec.js';
import { createInquirerPrompter } from '../prompt/inquirer-prompter.js';

/**
 * The injected environment every command runs against. `run(argv, env)` is
 * the one testable seam in the whole CLI: tests build a fake RunEnv (piped
 * streams, a spy Prompter, a fake GitRunner) and get real command behavior
 * with no process-global mutation and no real subprocess needed for unit
 * tests. Only src/bin.ts constructs `realEnv()`.
 */
export interface Io {
  stdin: NodeJS.ReadableStream & { isTTY?: boolean };
  stdout: NodeJS.WritableStream & { isTTY?: boolean };
  stderr: NodeJS.WritableStream & { isTTY?: boolean };
}

export interface RunEnv {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  io: Io;
  /** Set by program.ts before a command runs: the --no-input flag, or implied by --json. */
  noInput: boolean;
  prompter: Prompter;
  git: GitRunner;
  now(): Date;
}

/**
 * interactive ⇔ stdin.isTTY && stdout.isTTY && !noInput.
 *
 * Deliberately no `CI` env-var sniffing: inferring intent from an env var is
 * exactly the guessed fallback the fail-loud contract forbids. `--json`
 * setting `noInput` is enforced by program.ts, not here.
 */
export function isInteractive(env: RunEnv): boolean {
  return Boolean(env.io.stdin.isTTY) && Boolean(env.io.stdout.isTTY) && !env.noInput;
}

export function realEnv(): RunEnv {
  return {
    cwd: process.cwd(),
    env: process.env,
    io: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
    noInput: false,
    prompter: createInquirerPrompter(),
    git: createExecFileGitRunner(),
    now: () => new Date(),
  };
}
