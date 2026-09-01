import { existsSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { configuredAdapters } from '../../adapters/registry.js';
import type { StoreConfig } from '../../config/schema.js';
import { isLinkedWorktreeRoot } from '../git/repo.js';

export interface PathGateResult {
  ok: boolean;
  reason?: string;
}

function normalizePrefix(prefix: string): string {
  return prefix.replace(/\/+$/, '');
}

/**
 * The resolution+symlink-escape logic every path gate in this store shares:
 * lexically outside the root, escapes the root through a symlink on an
 * existing ancestor, or genuinely inside (with the store-relative,
 * forward-slash path a caller can then apply its own rule to).
 */
type StoreResolution =
  | { kind: 'outside_store' }
  | { kind: 'symlink_escape' }
  | { kind: 'inside'; rel: string };

async function resolveStorePath(root: string, relativePath: string): Promise<StoreResolution> {
  const normalizedRoot = path.resolve(root);
  const target = path.resolve(root, relativePath);
  const rel = path.relative(normalizedRoot, target).split(path.sep).join('/');
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { kind: 'outside_store' };
  }

  // Walk up to the deepest EXISTING ancestor, but never past the store root itself: a root (or a
  // whole store) that doesn't exist yet on disk has no symlink to escape through, and the lexical
  // check above already confirmed the path is nominally inside it.
  let ancestor = target;
  while (ancestor !== normalizedRoot && !existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }
  if (existsSync(ancestor)) {
    const realRoot = await realpath(normalizedRoot).catch(() => normalizedRoot);
    const realAncestor = await realpath(ancestor).catch(() => ancestor);
    const insideRoot = realAncestor === realRoot || realAncestor.startsWith(`${realRoot}${path.sep}`);
    if (!insideRoot) {
      return { kind: 'symlink_escape' };
    }
  }

  return { kind: 'inside', rel };
}

function isUnderAnyPrefix(relativePath: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    const trimmed = normalizePrefix(prefix);
    return relativePath === trimmed || relativePath.startsWith(`${trimmed}/`);
  });
}

/**
 * session-capture-command spec (D5): locations contexture itself owns are
 * always sanctioned, regardless of writable_paths.
 *
 * remove-agent-identity: this list no longer includes an identity path —
 * ownership of any leftover `.contexture/identity/*.md` files from before
 * that removal reverts fully to the operator, the same as any other
 * operator-owned content. A store with `write_lifecycle.writable_paths`
 * configured (the opt-in strict allowlist) needs those paths added to
 * `writable_paths` explicitly to keep editing them; this is intentional,
 * not a gap — see `sanctionedPath`'s test for the refusal this now produces.
 */
function contextureOwnedPrefixes(config: StoreConfig): string[] {
  const prefixes = [config.catalog.path, config.harness.skills_path, config.harness.conventions_path];
  try {
    for (const adapter of configuredAdapters(config, 'harness-generation')) prefixes.push(adapter.entryFileName);
  } catch {
    // an adapter that fails to resolve is doctor's problem (adapters.compatibility) — never this gate's.
  }
  return prefixes;
}

function sanctionedPrefixesFor(config: StoreConfig): string[] {
  return [
    ...config.taxonomy.layers.map((layer) => layer.path),
    config.ingest.inbox_path,
    ...config.write_lifecycle.writable_paths,
    ...contextureOwnedPrefixes(config),
  ];
}

/**
 * session-capture-command spec (D5): one path gate, used at commit time
 * (`staged.path_allowlist`, via the pre-commit hook) and at capture time
 * (`session capture`), so the two can never disagree.
 *
 * The symlink-escape rule is absolute and always enforced: `relativePath`
 * must resolve inside the store even after every existing ancestor
 * directory's symlinks are followed. The sanctioned-location rule is
 * opt-in — with `write_lifecycle.writable_paths` empty (the default),
 * every in-store path is accepted; once any path is declared, only a
 * configured taxonomy layer, the inbox, a declared writable path, or a
 * contexture-owned location passes.
 */
export async function sanctionedPath(config: StoreConfig, root: string, relativePath: string): Promise<PathGateResult> {
  const resolution = await resolveStorePath(root, relativePath);
  if (resolution.kind === 'outside_store') {
    return { ok: false, reason: 'resolves outside the store' };
  }
  if (resolution.kind === 'symlink_escape') {
    return { ok: false, reason: 'escapes the store through a symbolic link' };
  }
  const { rel } = resolution;

  if (config.write_lifecycle.writable_paths.length === 0) {
    return { ok: true };
  }

  if (!isUnderAnyPrefix(rel, sanctionedPrefixesFor(config))) {
    return {
      ok: false,
      reason: 'is not under a configured taxonomy layer, the inbox, a declared writable path, or a contexture-owned location',
    };
  }
  return { ok: true };
}

export interface WriteScopeResult {
  inScope: boolean;
  reason?: string;
}

/**
 * The Claude Code write-gate hook's question: is `relativePath` safe for a
 * session opened at the store root to edit directly? In scope when it
 * resolves outside the store entirely (not this gate's concern — the
 * store's canonical checkout is what it protects) or inside the configured
 * session-worktree tree; out of scope, and denied, when it resolves inside
 * the store root's own content, including when a symlink disguises the
 * escape in either direction (reuses `resolveStorePath`'s escape check,
 * same as `sanctionedPath`, so the two can never disagree on what counts as
 * an escape).
 *
 * A `root` that is itself a linked worktree checkout is always in scope,
 * regardless of `relativePath`: `openStore` resolves the store root by
 * walking up from cwd for the nearest `contexture.yaml`, and every session
 * worktree carries its own copy of that file — so a session whose cwd is
 * already inside the worktree resolves the worktree itself as `root`, and
 * without this carve-out every edit in it would read as "in the store root,
 * outside the worktree" and be denied. The gate's actual job is protecting
 * the canonical checkout; a linked worktree IS the sanctioned workspace,
 * whichever directory a session happens to be driven from — this also
 * covers `session.workspaces_external: true` stores, whose worktrees an
 * external process may place outside `session.worktrees_path` entirely.
 */
export async function isWriteInScope(config: StoreConfig, root: string, relativePath: string): Promise<WriteScopeResult> {
  const resolution = await resolveStorePath(root, relativePath);
  if (resolution.kind === 'outside_store') {
    return { inScope: true };
  }
  if (resolution.kind === 'symlink_escape') {
    return { inScope: false, reason: 'escapes the store through a symbolic link' };
  }

  const worktreesPrefix = normalizePrefix(config.session.worktrees_path);
  const { rel } = resolution;
  if (rel === worktreesPrefix || rel.startsWith(`${worktreesPrefix}/`)) {
    return { inScope: true };
  }
  if (isLinkedWorktreeRoot(root)) {
    return { inScope: true };
  }
  return {
    inScope: false,
    reason: `is in the store root at "${rel}", outside the active session worktree ("${config.session.worktrees_path}")`,
  };
}
