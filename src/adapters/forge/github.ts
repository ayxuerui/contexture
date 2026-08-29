import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ForgeAdapter } from './types.js';

const execFileAsync = promisify(execFile);

const PR_NUMBER_RE = /\/pull\/(\d+)/;

/**
 * The reference forge adapter, shelling out to `gh` (same tool, same
 * pattern as `git` itself) rather than a token-based REST client — simpler
 * to implement correctly, and consistent with how every other git-adjacent
 * operation in this codebase is invoked.
 */
export const githubForgeAdapter: ForgeAdapter = {
  id: 'github',
  kind: 'forge',
  interfaceVersion: 1,

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
};
