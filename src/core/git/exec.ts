import { execFile, spawn } from 'node:child_process';
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

/**
 * review-the-knowledge-diff: `git ls-tree -r` over a whole store prints one
 * line per tracked file, which passes execFile's 1 MiB default on a store of
 * a few thousand notes. Raised for every call rather than per call, since no
 * caller wants a truncated listing.
 */
const MAX_OUTPUT_BYTES = 256 * 1024 * 1024;

export function createExecFileGitRunner(): GitRunner {
  return {
    async run(args, opts) {
      try {
        const { stdout, stderr } = await execFileAsync('git', [...args], { cwd: opts.cwd, maxBuffer: MAX_OUTPUT_BYTES });
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

/**
 * review-the-knowledge-diff (D2): the contents of many blobs through ONE
 * `git cat-file --batch` process, keyed by object id, decoded as UTF-8. A
 * process per blob would put a fork behind every note on both sides of a
 * graph diff, and `ctxr serve` runs that diff on a request path.
 *
 * Reads git's object store only: nothing is checked out, and nothing is
 * written. An id the object store does not hold rejects, naming it.
 */
export async function readBlobs(cwd: string, objectIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(objectIds)];
  const blobs = new Map<string, string>();
  if (unique.length === 0) return blobs;

  const output = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn('git', ['cat-file', '--batch'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`git cat-file --batch exited ${code}: ${Buffer.concat(errors).toString('utf8').trim()}`));
    });
    child.stdin.end(`${unique.join('\n')}\n`);
  });

  // Each record is "<id> <type> <size>\n<content>\n", or "<id> missing\n".
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, headerEnd).toString('utf8').split(' ');
    if (header[1] === 'missing') throw new Error(`git object ${header[0]} is missing`);
    const size = Number.parseInt(header[2]!, 10);
    const start = headerEnd + 1;
    blobs.set(header[0]!, output.subarray(start, start + size).toString('utf8'));
    offset = start + size + 1;
  }
  return blobs;
}
