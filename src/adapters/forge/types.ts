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

export interface ForgeAdapter extends Adapter<'forge'> {
  isAvailable(cwd: string): Promise<boolean>;
  openPullRequest(input: OpenPullRequestInput): Promise<OpenPullRequestResult>;
}
