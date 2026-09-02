import { cp, lstat, mkdir, readFile, readdir, realpath, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { configuredAdapters } from '../../adapters/registry.js';
import type { StoreConfig } from '../../config/schema.js';

export interface HarnessBridgeResult {
  /** The harness-generation adapter id this bridge is for. */
  harness: string;
  /** Store-relative harness skills directory that was bridged. */
  path: string;
  mode: 'symlink' | 'copy';
}

/** Resolves a path to its real path, or itself (as an absolute path) if it does not exist. */
async function realOrSelf(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Resolves a path's PARENT through symlinks, keeping the final path
 * component literal. Handles the case where a parent directory (e.g. the
 * store root itself) is reached through a link, so two paths that are
 * physically the same location but written with different parent spellings
 * still compare equal.
 */
async function realParentPlusBase(p: string): Promise<string> {
  const resolved = path.resolve(p);
  const dir = path.dirname(resolved);
  const base = path.basename(resolved);
  try {
    const realDir = await realpath(dir);
    return path.join(realDir, base);
  } catch {
    return resolved;
  }
}

/**
 * True when `harnessAbs` already resolves to the same real location as
 * `canonicalAbs` — directly, or through a symlinked parent directory.
 * Checked both ways so neither a symlinked store root nor a symlinked
 * canonical directory causes a bridge that is already correct to be
 * rewritten, or — worse — the canonical directory to be deleted out from
 * under itself.
 */
async function alreadyBridged(canonicalAbs: string, harnessAbs: string): Promise<boolean> {
  const [realCanonical, realHarness] = await Promise.all([realOrSelf(canonicalAbs), realOrSelf(harnessAbs)]);
  if (realCanonical === realHarness) return true;
  const [canonicalViaParent, harnessViaParent] = await Promise.all([realParentPlusBase(canonicalAbs), realParentPlusBase(harnessAbs)]);
  return canonicalViaParent === harnessViaParent;
}

/** True only for a real directory — false for a symlink (even one pointing at a directory), so a misdirected link is always repaired rather than judged by its target's contents. */
async function isPlainDirectory(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isDirectory();
  } catch {
    return false;
  }
}

async function readDirTree(root: string, sub = ''): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  let entries;
  try {
    entries = await readdir(path.join(root, sub), { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    const rel = sub ? `${sub}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of await readDirTree(root, rel)) result.set(k, v);
    } else if (entry.isFile()) {
      result.set(rel, await readFile(path.join(root, rel), 'utf8'));
    }
  }
  return result;
}

/** Whole-tree byte comparison — cheap at skill-directory scale, and simpler than tracking per-file mtimes. */
async function directoriesMatch(a: string, b: string): Promise<boolean> {
  const [treeA, treeB] = await Promise.all([readDirTree(a), readDirTree(b)]);
  if (treeA.size !== treeB.size) return false;
  for (const [rel, content] of treeA) {
    if (treeB.get(rel) !== content) return false;
  }
  return true;
}

async function createDirSymlink(canonicalAbs: string, harnessAbs: string): Promise<boolean> {
  await mkdir(path.dirname(harnessAbs), { recursive: true });
  // A relative target keeps the link correct across a clone at a different absolute path.
  const relativeTarget = path.relative(path.dirname(harnessAbs), canonicalAbs);
  try {
    await symlink(relativeTarget, harnessAbs, 'dir');
    return true;
  } catch {
    return false;
  }
}

async function copySkillsInto(canonicalAbs: string, harnessAbs: string): Promise<void> {
  await mkdir(harnessAbs, { recursive: true });
  await cp(canonicalAbs, harnessAbs, { recursive: true });
}

/**
 * harness-portability spec (vendored-craft-skills): makes `harnessAbs`
 * resolve to `canonicalAbs`, preferring a directory symlink and falling
 * back to a recursive copy when one cannot be created. Idempotent: a
 * directory that already resolves to canonical (directly, through a
 * symlinked parent, or as a copy whose content still matches) is left
 * untouched and reported as unchanged. A symlink that does not resolve to
 * canonical is always replaced regardless of what it currently points at —
 * never judged "close enough" by its target's contents — which is what
 * makes a misdirected or materialized-as-a-file bridge repairable rather
 * than silently tolerated.
 */
async function ensureBridge(canonicalAbs: string, harnessAbs: string): Promise<'symlink' | 'copy' | 'unchanged'> {
  if (await alreadyBridged(canonicalAbs, harnessAbs)) return 'unchanged';

  if ((await isPlainDirectory(harnessAbs)) && (await directoriesMatch(canonicalAbs, harnessAbs))) {
    return 'unchanged';
  }

  await rm(harnessAbs, { recursive: true, force: true });

  if (await createDirSymlink(canonicalAbs, harnessAbs)) return 'symlink';

  await copySkillsInto(canonicalAbs, harnessAbs);
  return 'copy';
}

/**
 * The effective skills directory for a configured harness-generation
 * adapter: a store's own override (`adapters[].skills_dir`) takes
 * precedence over the adapter's declared default.
 */
export function effectiveSkillsDir(config: StoreConfig, adapterId: string, adapterDefault: string): string {
  const declaration = config.adapters.find((d) => d.kind === 'harness-generation' && d.id === adapterId);
  return declaration?.skills_dir ?? adapterDefault;
}

/**
 * Bridges every declared harness-generation adapter's skills directory to
 * the store's configured (canonical) skills path — never derived by
 * inspecting the host machine, always from configuration. An adapter whose
 * effective directory already equals the canonical path needs no bridge and
 * is silently skipped. Returns only the harnesses that actually changed.
 */
export async function bridgeHarnessSkills(root: string, config: StoreConfig): Promise<HarnessBridgeResult[]> {
  const canonical = config.harness.skills_path;
  // path.resolve, not path.join: these configured paths conventionally end
  // in "/", and fs.symlink's destination argument treats a trailing slash
  // as "this must already be a directory" — failing with ENOENT on the
  // (correct) case where it doesn't exist yet because we're creating it.
  const canonicalAbs = path.resolve(root, canonical);
  const results: HarnessBridgeResult[] = [];

  for (const adapter of configuredAdapters(config, 'harness-generation')) {
    const harnessDir = effectiveSkillsDir(config, adapter.id, adapter.skillsDir);
    if (harnessDir === canonical) continue;

    const harnessAbs = path.resolve(root, harnessDir);
    const mode = await ensureBridge(canonicalAbs, harnessAbs);
    if (mode !== 'unchanged') results.push({ harness: adapter.id, path: harnessDir, mode });
  }

  return results;
}

/**
 * Read-only counterpart for `ctxr doctor`: true when a declared harness's
 * skills directory is broken — materialized as something other than a
 * bridge to canonical — without writing anything. Mirrors `ensureBridge`'s
 * detection exactly; only the repair action differs.
 */
export async function isBridgeBroken(root: string, canonicalPath: string, harnessDir: string): Promise<boolean> {
  const canonicalAbs = path.resolve(root, canonicalPath);
  const harnessAbs = path.resolve(root, harnessDir);
  if (await alreadyBridged(canonicalAbs, harnessAbs)) return false;
  if ((await isPlainDirectory(harnessAbs)) && (await directoriesMatch(canonicalAbs, harnessAbs))) return false;
  return true;
}
