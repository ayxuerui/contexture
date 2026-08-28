import { readConfig } from '../config/load.js';
import type { StoreConfig } from '../config/schema.js';
import type { RunEnv } from './env.js';
import { NotAGitRepositoryError } from './errors.js';
import { isInsideGitRepo } from './git/repo.js';
import { resolveExistingRoot, type RootFlags } from './root.js';

export interface Store {
  root: string;
  config: StoreConfig;
}

/**
 * The choke point every non-`init` command goes through: root resolution,
 * then the git-repository check (context-store spec), then config load
 * (which itself gates schema_version — store-lifecycle spec). Done once,
 * structurally, here — so no command can skip either check by omission.
 */
export async function openStore(env: RunEnv, flags: RootFlags): Promise<Store> {
  const root = resolveExistingRoot(env, flags);
  if (!(await isInsideGitRepo(env.git, root))) {
    throw new NotAGitRepositoryError(root);
  }
  const config = await readConfig(root);
  return { root, config };
}
