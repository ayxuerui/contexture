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
  /**
   * github-app-recording-identity (D4): the whole environment for this one git
   * process, in place of this process's own — how `ctxr land` hands a token to
   * a credential helper without writing it anywhere.
   */
  env?: Readonly<Record<string, string | undefined>>;
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
        const { stdout, stderr } = await execFileAsync('git', [...args], {
          cwd: opts.cwd,
          maxBuffer: MAX_OUTPUT_BYTES,
          ...(opts.env === undefined ? {} : { env: opts.env as NodeJS.ProcessEnv }),
        });
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

/**
 * approve-from-the-review-page (design.md D5): the stable patch identity of
 * every commit in `range` (`<base>..<head>`), oldest first — `git log -p`
 * piped into `git patch-id --stable`, two processes and no shell. Two ranges
 * with equal lists carry the same changes commit for commit, whatever base
 * each was applied to. Rejects when either process fails, as for an unknown
 * commit; the caller treats that as "not the same".
 */
export async function patchIds(cwd: string, range: string): Promise<string[]> {
  const order = await new Promise<string>((resolve, reject) => {
    execFile('git', ['rev-list', '--reverse', '--no-merges', range], { cwd, maxBuffer: MAX_OUTPUT_BYTES }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    );
  });
  const commits = order.split('\n').filter(Boolean);
  if (commits.length === 0) return [];

  const byCommit = await new Promise<Map<string, string>>((resolve, reject) => {
    const log = spawn('git', ['log', '-p', '--no-merges', '--no-color', '--format=commit %H', range], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const patchId = spawn('git', ['patch-id', '--stable'], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    log.stdout.pipe(patchId.stdin);
    const chunks: Buffer[] = [];
    patchId.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    let logCode: number | null = null;
    log.on('error', reject);
    patchId.on('error', reject);
    log.on('close', (code) => {
      logCode = code;
    });
    patchId.on('close', (code) => {
      if (code !== 0 || logCode !== 0) {
        reject(new Error(`git patch-id over ${range} failed`));
        return;
      }
      const map = new Map<string, string>();
      for (const line of Buffer.concat(chunks).toString('utf8').split('\n')) {
        const [id, commit] = line.trim().split(' ');
        if (id && commit) map.set(commit, id);
      }
      resolve(map);
    });
  });
  // A commit with an empty patch has no patch id; it still counts, as an empty one.
  return commits.map((commit) => byCommit.get(commit) ?? '');
}
