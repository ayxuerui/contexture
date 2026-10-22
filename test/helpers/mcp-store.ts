import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { hermeticGitEnv } from './git-env.js';
import { runCli } from './run-cli.js';
import { makeTmpDir } from './tmp-store.js';

const execFileAsync = promisify(execFile);

export type GitEnv = Record<string, string | undefined>;

export async function git(cwd: string, env: GitEnv, ...args: string[]): Promise<string> {
  return (await execFileAsync('git', args, { cwd, env })).stdout;
}

export async function writeStoreFile(root: string, relPath: string, content: string): Promise<void> {
  const full = path.join(root, relPath);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content);
}

/**
 * The topology the MCP server runs in (serve-the-store-over-mcp design.md
 * D8): a bare remote, an author's working clone that pushes to it, and the
 * server's own dedicated clone. Setup commits skip the hooks — their behavior
 * is tested elsewhere.
 */
export interface ServedStore {
  remote: string;
  author: string;
  served: string;
  branch: string;
  stateDir: string;
  env: GitEnv;
  /** Commits everything in the author clone and pushes it. */
  publish(message: string): Promise<void>;
  /** Pushes a `capture/` branch carrying one inbox file, from a fresh clone, leaving the default branch alone. */
  pushCaptureBranch(branch: string, relPath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function makeServedStore(): Promise<ServedStore> {
  const tmp = await makeTmpDir('contexture-mcp-store-');
  const env = hermeticGitEnv();
  const remote = path.join(tmp.root, 'remote.git');
  const author = path.join(tmp.root, 'author');
  const served = path.join(tmp.root, 'served');
  await mkdir(author, { recursive: true });
  await git(tmp.root, env, 'init', '-q', '--bare', remote);
  const init = await runCli(['init'], { cwd: author, env });
  if (init.exitCode !== 0) throw new Error(`ctxr init failed: ${init.stderr}`);
  const branch = (await git(author, env, 'symbolic-ref', '--short', 'HEAD')).trim();
  await git(author, env, 'remote', 'add', 'origin', remote);
  await git(author, env, 'push', '-q', '--no-verify', 'origin', branch);
  await git(remote, env, 'symbolic-ref', 'HEAD', `refs/heads/${branch}`);
  await git(tmp.root, env, 'clone', '-q', '-b', branch, remote, served);

  const publish = async (message: string): Promise<void> => {
    await git(author, env, 'add', '-A');
    await git(author, env, 'commit', '-q', '--no-verify', '-m', message);
    await git(author, env, 'push', '-q', '--no-verify', 'origin', branch);
  };

  let scratch = 0;
  const pushCaptureBranch = async (captureBranch: string, relPath: string, content: string): Promise<void> => {
    scratch += 1;
    const dir = path.join(tmp.root, `scratch-${scratch}`);
    await git(tmp.root, env, 'clone', '-q', '-b', branch, remote, dir);
    await git(dir, env, 'checkout', '-q', '-b', captureBranch);
    await writeStoreFile(dir, relPath, content);
    await git(dir, env, 'add', '-A');
    await git(dir, env, 'commit', '-q', '--no-verify', '-m', `Capture ${relPath}`);
    await git(dir, env, 'push', '-q', '--no-verify', 'origin', captureBranch);
  };

  return { remote, author, served, branch, stateDir: path.join(tmp.root, 'state'), env, publish, pushCaptureBranch, cleanup: tmp.cleanup };
}
