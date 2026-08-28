import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * The ONLY module in this codebase that spawns `git`. Every git operation —
 * in Phase 0's `init`, and in every later phase's session/worktree/hook code
 * — goes through this interface, always as an argv array, never a shell
 * string (a store path or branch name containing a space or `;` must never
 * reach a shell).
 *
 * Deliberately not a library (simple-git, isomorphic-git): a library either
 * wraps errors in its own types we'd have to unwrap to produce our findings,
 * or (isomorphic-git) can't do `git worktree` — which Phase 2's session model
 * is built on — or `--follow` rename detection, which Phase 7's archive
 * verifies. Raw `git` via execFile is the boring choice that survives both.
 */
export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitRunOptions {
  cwd: string;
  /** When true, a non-zero exit resolves with the result instead of throwing. */
  allowFailure?: boolean;
}

export interface GitRunner {
  run(args: readonly string[], opts: GitRunOptions): Promise<GitResult>;
}

export function createExecFileGitRunner(): GitRunner {
  return {
    async run(args, opts) {
      try {
        const { stdout, stderr } = await execFileAsync('git', [...args], { cwd: opts.cwd });
        return { stdout, stderr, exitCode: 0 };
      } catch (err) {
        const e = err as { stdout?: string; stderr?: string; code?: number };
        if (opts.allowFailure) {
          return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exitCode: e.code ?? 1 };
        }
        throw err;
      }
    },
  };
}
