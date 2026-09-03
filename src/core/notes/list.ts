import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { configuredAdapters } from '../../adapters/registry.js';
import type { StoreConfig } from '../../config/schema.js';
import { isUnderAnyPrefix } from '../fs/prefix.js';
import { parseNote } from './parse.js';

/** The note-enumeration seam every retrieval leg builds on. */
export interface NoteQuery {
  underPrefix?: string;
}

export interface Note {
  /** Path relative to the store root, forward-slash separated. */
  path: string;
  frontmatter: Record<string, unknown> | undefined;
  body: string;
}

/** Infrastructure directories intrinsic to contexture itself — never configurable content locations. */
const ALWAYS_SKIP_DIRS = new Set(['.git', '.githooks', '.queue']);

/**
 * Filenames intrinsic to contexture itself, never user content — same
 * status as ALWAYS_SKIP_DIRS. AGENTS.md is a CLI-generated document
 * (task 4.5), not a note, but only the one `agentsMdPath` ever
 * generates: the store root's own `AGENTS.md` (`agents-doc.ts` hardcodes
 * `path.join(root, 'AGENTS.md')`, never a nested path). A same-named file
 * anywhere else is ordinary content an operator happened to name AGENTS.md
 * — the walk below applies this root-only, the same way it treats a
 * harness's own entry filename (`skipRootFiles`, right below).
 */
const ALWAYS_SKIP_FILES = new Set(['AGENTS.md']);

/**
 * Root-level files owned by configured harness-generation adapters (e.g.
 * CLAUDE.md) are tool-owned pointers, never notes. A misconfigured adapter
 * is doctor's problem to report (adapters.compatibility) — enumeration
 * must not fail because of it, so resolution errors just skip nothing extra.
 */
function harnessEntryFiles(config: StoreConfig): Set<string> {
  try {
    return new Set(
      configuredAdapters(config, 'harness-generation')
        .map((a) => a.entryFileName)
        .filter((name): name is string => name !== undefined),
    );
  } catch {
    return new Set();
  }
}

/**
 * The one prefix rule every path-prefix declaration reads — exclusions,
 * `--under`, the pass's demotion tier, and the write-path gate. Re-exported
 * rather than defined here: it now lives in `core/fs/prefix.ts` so the gate
 * can read the same implementation without importing note enumeration.
 */
export { isUnderAnyPrefix } from '../fs/prefix.js';

export function excludedPrefixesFor(config: StoreConfig): string[] {
  return [
    ...config.retrieval.exclude_paths,
    ...config.derived.paths,
    config.session.worktrees_path,
    config.catalog.path,
    // Published pages are authored-but-tool-owned output, never a note (context-store spec).
    config.publish.path,
    // Tool-owned instruction docs (skills, guidance) are never notes, wherever they live.
    config.harness.skills_path,
    config.harness.guidance_path,
  ];
}

async function walk(
  dir: string,
  root: string,
  excludePrefixes: readonly string[],
  skipRootFiles: ReadonlySet<string>,
  results: string[],
): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name)) continue;
      if (isUnderAnyPrefix(relativePath, excludePrefixes)) continue;
      await walk(fullPath, root, excludePrefixes, skipRootFiles, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (relativePath === entry.name && ALWAYS_SKIP_FILES.has(entry.name)) continue;
      if (relativePath === entry.name && skipRootFiles.has(entry.name)) continue;
      if (isUnderAnyPrefix(relativePath, excludePrefixes)) continue;
      results.push(relativePath);
    }
  }
}

/**
 * retain-captures-as-provenance: every markdown capture in the tier, which is
 * exactly the set `listNotes` refuses to return — the capture root is a
 * declared retrieval exclusion, so the same walk that hides captures from
 * retrieval is what enumerates them here. Dedupe needs this list and
 * retrieval must never see it, so the two callers share the walker and
 * differ only in which side of the exclusion they ask for.
 *
 * Non-markdown captures are skipped for the same reason `listNotes` skips
 * them: only markdown can carry the frontmatter an identity lives in. A
 * binary capture is represented here by its sidecar.
 */
export async function listCaptures(storeRoot: string, config: StoreConfig): Promise<Note[]> {
  const captureRoot = path.join(storeRoot, config.ingest.capture_root);
  const relativePaths: string[] = [];
  await walk(captureRoot, storeRoot, [], new Set(), relativePaths);
  relativePaths.sort();
  return Promise.all(relativePaths.map((relativePath) => parseNote(path.join(storeRoot, relativePath), relativePath)));
}

/** Every retrievable note in the store: everything under a .md path, minus every declared exclusion. */
export async function listNotes(storeRoot: string, config: StoreConfig, query: NoteQuery = {}): Promise<Note[]> {
  const relativePaths: string[] = [];
  await walk(storeRoot, storeRoot, excludedPrefixesFor(config), harnessEntryFiles(config), relativePaths);
  relativePaths.sort();

  const scoped = query.underPrefix ? relativePaths.filter((p) => isUnderAnyPrefix(p, [query.underPrefix!])) : relativePaths;
  return Promise.all(scoped.map((relativePath) => parseNote(path.join(storeRoot, relativePath), relativePath)));
}
