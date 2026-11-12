import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { RunEnv } from './env.js';
import { NoStoreRootError, SupersededStoreRootEnvVarError } from './errors.js';
import { parse as parseYaml } from 'yaml';
import { isWorktreeOf, mainWorkingTreeRoot } from './git/repo.js';
import { mountLocation } from './shared-stores-location.js';

/** The one config filename every root-resolution function looks for. */
export const CONFIG_FILE_NAME = 'contexture.yaml';

export interface RootFlags {
  root?: string;
}

/**
 * Root resolution for every command except `init` (harness-portability spec):
 * an explicit --root argument beats the worktree the caller is standing in,
 * which beats an inherited CONTEXTURE_STORE_ROOT env var, which beats walking
 * up from cwd looking for contexture.yaml. If none resolves, throws
 * NoStoreRootError rather than guessing a fallback.
 *
 * The worktree step (resolve-the-worktree-you-are-in) exists because the env
 * var answers WHICH STORE, while a session worktree raises WHICH CHECKOUT of
 * that store — an orthogonal question the var cannot answer. Contexture cuts
 * those worktrees itself and tells agents to work in them, so without this
 * step every command run from one silently audits the canonical clone
 * instead. It is consulted only when the var would otherwise resolve: with
 * the var unset the walk below already reaches the same directory, so there
 * is nothing to redirect. Cross-store pinning is untouched by construction —
 * the redirect requires the cwd store to be a worktree of the very store the
 * var names.
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
    const named = path.resolve(env.cwd, fromEnv);
    const here = findRootFromCwd(env.cwd);
    if (here !== null && here !== named && isWorktreeOf(here, named)) {
      return here;
    }
    if (here !== null && here !== named && isDeclaredMountOf(here, named)) {
      return here;
    }
    return named;
  }
  if (env.env.CONTEXTURE_ROOT) {
    throw new SupersededStoreRootEnvVarError();
  }

  const walked = findRootFromCwd(env.cwd);
  if (walked !== null) {
    return walked;
  }

  throw new NoStoreRootError({ flag: Boolean(flags.root), env: Boolean(fromEnv), cwd: env.cwd });
}

/** The nearest ancestor of `cwd` (inclusive) holding contexture.yaml, or null. */
function findRootFromCwd(cwd: string): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    if (existsSync(path.join(dir, CONFIG_FILE_NAME))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
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

/**
 * harness-portability spec, root resolution's mount step (mount-shared-stores
 * D5): whether `candidate` is a mount the store at `named` declares, or a
 * linked worktree of one. Synchronous and filesystem-only, like the worktree
 * step: it reads the named store's `contexture.yaml` for mount names alone,
 * and answers false — so the variable resolves unchanged — whenever that
 * cannot be read. Mounts sit in the named store's main working tree.
 */
function isDeclaredMountOf(candidate: string, named: string): boolean {
  let names: string[];
  try {
    const raw = parseYaml(readFileSync(path.join(named, CONFIG_FILE_NAME), 'utf8')) as { shared_stores?: unknown } | null;
    const declared = raw?.shared_stores;
    if (!Array.isArray(declared)) return false;
    names = declared.flatMap((entry) => (entry !== null && typeof entry === 'object' && typeof (entry as { name?: unknown }).name === 'string' ? [(entry as { name: string }).name] : []));
  } catch {
    return false;
  }
  const mainRoot = mainWorkingTreeRoot(named);
  return names.some((name) => {
    const mountRoot = path.join(mainRoot, ...mountLocation(name).split('/'));
    return path.resolve(candidate) === path.resolve(mountRoot) || isWorktreeOf(candidate, mountRoot);
  });
}
