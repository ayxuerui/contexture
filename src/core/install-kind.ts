import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { askNpmForPrefix, type NpmPrefixRunner } from './npm-prefix.js';

/**
 * How this executable got onto the path — a FACT the CLI computes, so the
 * upgrade skill can branch on it instead of shelling around to work it out in
 * markdown, where it could not be tested (design.md D12).
 *
 * `undetermined` is a real third answer, never a synonym for `global`: a local
 * dependency install is inside node_modules exactly like a global one, and
 * telling its operator to run a global install would upgrade something other
 * than the executable they are running. The skill stops on both non-global
 * answers.
 */
export type InstallKind = 'global' | 'linked' | 'undetermined';

const NODE_MODULES = 'node_modules';

/** A global package root, and the directory `npm install -g` writes launchers into beside it. */
interface GlobalRoot {
  modules: string;
  bin: string;
}

/**
 * Global installs under the running Node's own prefix:
 * POSIX `<prefix>/lib/node_modules`, where execPath is `<prefix>/bin/node`;
 * Windows `<dir of node.exe>/node_modules`. Launchers go beside node.
 */
function nodePrefixRoots(execPath: string): GlobalRoot[] {
  const binDir = path.dirname(execPath);
  const prefix = path.dirname(binDir);
  return [
    { modules: path.join(prefix, 'lib', NODE_MODULES), bin: binDir },
    { modules: path.join(prefix, NODE_MODULES), bin: binDir },
    { modules: path.join(binDir, NODE_MODULES), bin: binDir },
  ];
}

/**
 * Global installs under npm's configured prefix -- where `npm install -g` writes, which is the
 * question the classification answers (install-tools-in-the-home D4): POSIX
 * `<prefix>/lib/node_modules` with launchers in `<prefix>/bin`, Windows `<prefix>/node_modules`
 * with launchers in `<prefix>` itself.
 */
function npmPrefixRoots(prefix: string): GlobalRoot[] {
  return [
    { modules: path.join(prefix, 'lib', NODE_MODULES), bin: path.join(prefix, 'bin') },
    { modules: path.join(prefix, NODE_MODULES), bin: prefix },
  ];
}

/**
 * The roots a global install may live under. With npm's prefix known, only those: an install
 * under Node's own prefix that npm would not write to is not one `npm install -g` replaces. Node's
 * prefix stands in only when npm could not be asked (`npmPrefix` null).
 */
function globalRoots(execPath: string, npmPrefix: string | null): GlobalRoot[] {
  return npmPrefix === null ? nodePrefixRoots(execPath) : npmPrefixRoots(path.resolve(npmPrefix));
}

function rootOf(resolved: string, execPath: string, npmPrefix: string | null): GlobalRoot | undefined {
  return globalRoots(path.resolve(execPath), npmPrefix).find((root) => isUnder(resolved, root.modules));
}

function isUnder(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Pure so every layout is testable without installing anything. A path with no
 * node_modules segment at all is a working copy — which is what `npm link` and
 * a dev checkout both resolve to, because Node resolves the symlink before
 * import.meta.url is derived.
 */
export function classifyInstallPath(binPath: string, execPath: string, npmPrefix: string | null = null): InstallKind {
  const resolved = path.resolve(binPath);
  const segments = resolved.split(path.sep);
  if (!segments.includes(NODE_MODULES)) return 'linked';
  if (rootOf(resolved, execPath, npmPrefix) !== undefined) return 'global';
  return 'undetermined';
}


/**
 * Where `npm install -g` writes: NPM_CONFIG_PREFIX / npm_config_prefix when set (npm reads those
 * before any npmrc, so they are its answer), otherwise npm's own answer. Null when neither can be
 * had, and the classification falls back to the running Node's prefix.
 */
export async function npmGlobalPrefix(
  env: Readonly<Record<string, string | undefined>>,
  ask: NpmPrefixRunner = askNpmForPrefix,
): Promise<string | null> {
  const configured = (env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix ?? '').trim();
  if (configured !== '' && path.isAbsolute(configured)) return configured;
  return ask();
}

export interface InstallLocation {
  path: string;
  kind: InstallKind;
}

/**
 * The entrypoint of the process running right now.
 *
 * Deliberately NOT the thing resolve-hook-cli-at-runtime removed. That change
 * deleted a baked path from *generated hook scripts*, which are written to disk
 * and committed — so a path resolved when the file was generated is wrong on
 * every other machine that later checks the store out. This resolves at the
 * moment it is asked, is never written anywhere, and describes only the
 * process asking. Reintroducing a persisted path here would be the antipattern;
 * reporting the live one is what lets the upgrade skill tell whether
 * `npm install -g` would affect the executable actually in use.
 */
function runningEntrypoint(): string {
  return fileURLToPath(new URL('../bin.js', import.meta.url));
}

export function resolveInstallLocation(execPath: string, npmPrefix: string | null = null): InstallLocation {
  const binPath = runningEntrypoint();
  return { path: binPath, kind: classifyInstallPath(binPath, execPath, npmPrefix) };
}

/**
 * migrate-stores-on-update (design D5): can the running user upgrade this
 * global install in place? `npm install -g` writes the package into the global
 * `node_modules` root the entrypoint resolves under, and its launcher into the
 * prefix's `bin` — both must be writable, or the install is refused.
 *
 * A global install the user cannot write is one something else manages: a
 * container image, a system package, an administrator. Reporting it lets the
 * upgrade skill stop before asking the operator to approve an install that
 * could never succeed. Only meaningful for a `global` classification; callers
 * do not ask for the other two.
 */
export async function isGlobalInstallWritable(binPath: string, execPath: string, npmPrefix: string | null = null): Promise<boolean> {
  const root = rootOf(path.resolve(binPath), execPath, npmPrefix);
  if (root === undefined) return false;
  const targets = [root.modules, root.bin];
  for (const target of targets) {
    try {
      await access(target, constants.W_OK);
    } catch {
      return false;
    }
  }
  return true;
}
