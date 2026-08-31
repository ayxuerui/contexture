import type { Adapter } from '../types.js';

/**
 * write-lifecycle/adapters spec: the forge adapter interface — one of the
 * three v1 adapter kinds. `isAvailable` is what lets `session submit`
 * degrade to manual-PR instructions rather than failing when no forge is
 * configured or reachable.
 */
export interface OpenPullRequestInput {
  cwd: string;
  branch: string;
  baseBranch: string;
  title: string;
  body: string;
}

export interface OpenPullRequestResult {
  url: string;
  number: number | null;
}

/** session-submit-and-land spec (D5): the forge's own vocabulary, normalized to one small union per axis. */
export type PullRequestLifecycleState = 'open' | 'merged' | 'closed';
export type PullRequestMergeability = 'mergeable' | 'conflicting' | 'unknown';

export type MergeMethod = 'squash' | 'merge' | 'rebase';

export interface PullRequestState {
  number: number;
  url: string;
  title: string;
  state: PullRequestLifecycleState;
  mergeable: PullRequestMergeability;
  headBranch: string;
}

/**
 * session-submit-and-land spec (D5): interface version 2 — `pullRequest`
 * and `mergePullRequest` join availability and pull-request opening, so
 * `ctxr session land` can read a pull request's state and merge it. A v1
 * forge adapter (this interface's prior shape) cannot land; the adapters
 * capability's compatibility check reports that mismatch before any session
 * command relies on it.
 */
export interface ForgeAdapter extends Adapter<'forge'> {
  isAvailable(cwd: string): Promise<boolean>;
  openPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult>;
  /** `ref` is a branch name or a pull-request number as a string; either resolves the same pull request. */
  pullRequest(cwd: string, ref: string): Promise<PullRequestState>;
  mergePullRequest(cwd: string, number: number, method: MergeMethod): Promise<void>;
}
