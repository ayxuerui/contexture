import type { Prompter } from '../prompt/prompter.js';
import type { GitRunner } from './git/exec.js';
import { createExecFileGitRunner } from './git/exec.js';
import type { RegistryClient } from './registry.js';
import { createFetchRegistryClient } from './registry.js';
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
  /** The running Node binary, used to tell a global install from a working copy. */
  execPath: string;
  env: Readonly<Record<string, string | undefined>>;
  io: Io;
  /** Set by program.ts before a command runs: the --no-input flag, or implied by --json. */
  noInput: boolean;
  prompter: Prompter;
  git: GitRunner;
  /** The release registry. The only network-capable port; see core/registry.ts. */
  registry: RegistryClient;
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
    execPath: process.execPath,
    env: process.env,
    io: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr },
    noInput: false,
    prompter: createInquirerPrompter(),
    git: createExecFileGitRunner(),
    registry: createFetchRegistryClient(),
    now: () => new Date(),
  };
}
