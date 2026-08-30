import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForgeAdapter, PullRequestLifecycleState, PullRequestMergeability, PullRequestState } from './types.js';

const execFileAsync = promisify(execFile);

const PR_NUMBER_RE = /\/pull\/(\d+)/;

/** GitHub's own vocabulary, normalized to the adapter interface's small unions — kept pure and exported so tests exercise the mapping without a subprocess. */
export function mapPullRequestState(ghState: string): PullRequestLifecycleState {
  switch (ghState) {
    case 'OPEN':
      return 'open';
    case 'MERGED':
      return 'merged';
    case 'CLOSED':
      return 'closed';
    default:
      throw new Error(`Internal error: unrecognized GitHub pull request state "${ghState}".`);
  }
}

export function mapMergeability(ghMergeable: string): PullRequestMergeability {
  switch (ghMergeable) {
    case 'MERGEABLE':
      return 'mergeable';
    case 'CONFLICTING':
      return 'conflicting';
    case 'UNKNOWN':
      return 'unknown';
    default:
      throw new Error(`Internal error: unrecognized GitHub mergeable status "${ghMergeable}".`);
  }
}

interface GhPullRequestView {
  number: number;
  url: string;
  title: string;
  state: string;
  mergeable: string;
  headRefName: string;
}

/**
 * The reference forge adapter, shelling out to `gh` (same tool, same
 * pattern as `git` itself) rather than a token-based REST client — simpler
 * to implement correctly, and consistent with how every other git-adjacent
 * operation in this codebase is invoked.
 */
export const githubForgeAdapter: ForgeAdapter = {
  id: 'github',
  kind: 'forge',
  interfaceVersion: 2,

  async isAvailable(cwd) {
    try {
      // `gh auth status` alone only proves SOME host has stored credentials —
      // it says nothing about whether THIS repo's remote is even a GitHub
      // remote. `gh repo view` fails unless the current repo's remote
      // resolves to a real, reachable GitHub repository, which is the
      // actual question `session submit` needs answered.
      await execFileAsync('gh', ['repo', 'view'], { cwd });
      return true;
    } catch {
      return false;
    }
  },

  async openPullRequest(input) {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'create', '--head', input.branch, '--base', input.baseBranch, '--title', input.title, '--body', input.body],
      { cwd: input.cwd },
    );
    const url = stdout.trim();
    const match = PR_NUMBER_RE.exec(url);
    return { url, number: match?.[1] ? Number(match[1]) : null };
  },

  async pullRequest(cwd, ref) {
    const { stdout } = await execFileAsync(
      'gh',
      ['pr', 'view', ref, '--json', 'number,url,title,state,mergeable,headRefName'],
      { cwd },
    );
    const data = JSON.parse(stdout) as GhPullRequestView;
    return {
      number: data.number,
      url: data.url,
      title: data.title,
      state: mapPullRequestState(data.state),
      mergeable: mapMergeability(data.mergeable),
      headBranch: data.headRefName,
    } satisfies PullRequestState;
  },

  async mergePullRequest(cwd, number, method) {
    await execFileAsync('gh', ['pr', 'merge', String(number), `--${method}`], { cwd });
  },
};
