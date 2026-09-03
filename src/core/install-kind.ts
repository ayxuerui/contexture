import path from 'node:path';
import { resolveOwnBinPath } from './hooks.js';

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

/**
 * Global installs live under the Node prefix's node_modules:
 * POSIX `<prefix>/lib/node_modules`, where execPath is `<prefix>/bin/node`;
 * Windows `<dir of node.exe>/node_modules`.
 */
function globalRootsFor(execPath: string): string[] {
  const binDir = path.dirname(execPath);
  const prefix = path.dirname(binDir);
  return [
    path.join(prefix, 'lib', NODE_MODULES),
    path.join(prefix, NODE_MODULES),
    path.join(binDir, NODE_MODULES),
  ];
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
export function classifyInstallPath(binPath: string, execPath: string): InstallKind {
  const resolved = path.resolve(binPath);
  const segments = resolved.split(path.sep);
  if (!segments.includes(NODE_MODULES)) return 'linked';
  if (globalRootsFor(path.resolve(execPath)).some((root) => isUnder(resolved, root))) return 'global';
  return 'undetermined';
}

export interface InstallLocation {
  path: string;
  kind: InstallKind;
}

export function resolveInstallLocation(execPath: string): InstallLocation {
  const binPath = resolveOwnBinPath();
  return { path: binPath, kind: classifyInstallPath(binPath, execPath) };
}
