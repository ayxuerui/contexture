import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RunEnv } from './env.js';
import { NoStoreRootError, SupersededStoreRootEnvVarError } from './errors.js';

/** The one config filename every root-resolution function looks for. */
export const CONFIG_FILE_NAME = 'contexture.yaml';

export interface RootFlags {
  root?: string;
}

/**
 * Root resolution for every command except `init` (harness-portability spec):
 * an explicit --root argument beats an inherited CONTEXTURE_STORE_ROOT env
 * var, which beats walking up from cwd looking for contexture.yaml. If none
 * resolves, throws NoStoreRootError rather than guessing a fallback.
 *
 * Exactly one env var (CONTEXTURE_STORE_ROOT) and one flag (--root) are
 * recognized — no aliases are checked here, ever, by construction. The
 * superseded CONTEXTURE_ROOT name (rename-store-root-env-var) is recognized
 * only to refuse: if it is set and CONTEXTURE_STORE_ROOT is not, and no
 * --root was given, resolution throws rather than silently falling through
 * to walking up and resolving a different store.
 */
export function resolveExistingRoot(env: RunEnv, flags: RootFlags): string {
  if (flags.root) {
    return path.resolve(env.cwd, flags.root);
  }
  const fromEnv = env.env.CONTEXTURE_STORE_ROOT;
  if (fromEnv) {
    return path.resolve(env.cwd, fromEnv);
  }
  if (env.env.CONTEXTURE_ROOT) {
    throw new SupersededStoreRootEnvVarError();
  }

  let dir = path.resolve(env.cwd);
  for (;;) {
    if (existsSync(path.join(dir, CONFIG_FILE_NAME))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new NoStoreRootError({ flag: Boolean(flags.root), env: Boolean(fromEnv), cwd: env.cwd });
}

/**
 * Root resolution for `init` only: --root -> CONTEXTURE_STORE_ROOT -> cwd.
 * Deliberately never walks up — unlike every other command, init CREATES a
 * store rather than finding one, and walking up would let `ctxr init`
 * run in a subdirectory silently re-target and reinitialize a parent store.
 * The superseded CONTEXTURE_ROOT name is refused here too, on the same terms
 * as resolveExistingRoot — see its doc comment.
 */
export function resolveRootForInit(env: RunEnv, flags: RootFlags): string {
  if (flags.root) {
    return path.resolve(env.cwd, flags.root);
  }
  const fromEnv = env.env.CONTEXTURE_STORE_ROOT;
  if (fromEnv) {
    return path.resolve(env.cwd, fromEnv);
  }
  if (env.env.CONTEXTURE_ROOT) {
    throw new SupersededStoreRootEnvVarError();
  }
  return path.resolve(env.cwd);
}
