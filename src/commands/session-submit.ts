import { githubForgeAdapter } from '../adapters/forge/github.js';
import type { OpenPullRequestResult } from '../adapters/forge/types.js';
import { CHECKS } from '../core/checks/manifest.js';
import { overallStatus, runChecks } from '../core/checks/registry.js';
import type { CheckContext } from '../core/checks/types.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoRemoteConfiguredError, SessionValidationFailedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { commitIfStaged, currentBranch, pushBranch } from '../core/git/repo.js';
import { hasRemote } from '../core/git/worktree.js';
import { listNotes } from '../core/notes/list.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionSubmitFlags {
  message?: string;
  title?: string;
  body?: string;
}

export interface SessionSubmitData {
  branch: string;
  commit: string | null;
  pushed: boolean;
  pr: OpenPullRequestResult | null;
  manualPrInstructions: string | null;
}

/**
 * write-lifecycle spec: "runs full validation, commits, pushes the branch,
 * opens a PR via the configured forge adapter (or degrades per 2.5);
 * refuses to run if validation fails." Full validation here means the same
 * store-scope invariant set doctor runs — not just what's currently staged
 * — because a session's job is to leave the store healthy as a whole, not
 * merely to pass each individual commit's pre-commit gate.
 */
export async function execute(
  env: RunEnv,
  store: Store,
  flags: SessionSubmitFlags,
): Promise<CommandOutcome<SessionSubmitData>> {
  const branch = await currentBranch(env.git, store.root);

  const ctx: CheckContext = {
    storeRoot: store.root,
    config: store.config,
    scope: 'store',
    git: env.git,
    notes: () => listNotes(store.root, store.config),
    graph: async () => undefined,
    catalog: async () => undefined,
  };
  const reports = await runChecks(CHECKS, ctx, { scope: 'store', severity: 'invariant' });
  if (overallStatus(reports) === 'fail') {
    throw new SessionValidationFailedError(reports.flatMap((r) => r.result.findings));
  }

  if (!(await hasRemote(env.git, store.root))) {
    throw new NoRemoteConfiguredError();
  }

  const commitSha = await commitIfStaged(
    env.git,
    store.root,
    { kind: 'session', worktree: store.root, branch },
    flags.message ?? `chore: submit session ${branch}`,
  );

  await pushBranch(env.git, store.root, branch);

  let pr: OpenPullRequestResult | null = null;
  let manualPrInstructions: string | null = null;
  const forgeAvailable = await githubForgeAdapter.isAvailable(store.root);
  if (forgeAvailable) {
    pr = await githubForgeAdapter.openPullRequest({
      cwd: store.root,
      branch,
      baseBranch: store.config.git.default_branch,
      title: flags.title ?? `Session: ${branch}`,
      body: flags.body ?? '',
    });
  } else {
    manualPrInstructions =
      `No forge adapter is configured or reachable. The branch "${branch}" was pushed successfully — ` +
      `open a pull request manually, comparing it against "${store.config.git.default_branch}".`;
  }

  return {
    exitCode: ExitCode.Ok,
    data: { branch, commit: commitSha, pushed: true, pr, manualPrInstructions },
    findings: [],
    humanSummary: pr ? `Opened PR #${pr.number ?? '?'}: ${pr.url}` : (manualPrInstructions ?? ''),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

