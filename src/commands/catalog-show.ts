import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { readCatalogSection } from '../core/catalog/build.js';
import { CatalogSectionNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { resolveMounts } from '../core/shared-stores.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface CatalogShowFlags {
  section: string;
}

export interface MountedCatalogSection {
  name: string;
  location: string;
  /** The mounted store's entries for the section, each path prefixed by the mount's location. */
  entries: string[];
}

export interface CatalogShowData {
  section: string;
  content: string;
  /** mount-shared-stores: the same section from each mounted store that has entries in it. Absent without mounts. */
  mounts?: MountedCatalogSection[];
}

/** A catalog entry's path, inside its `(`…`)` code span — the one part of an entry that names where the note lives. */
const ENTRY_PATH_RE = /^(- \[\[.*?\]\] \(`)([^`]+)(`\))/;

/**
 * context-catalog (mount-shared-stores): the same section read from a mounted
 * store's own tracked catalog, entries only, with each path carrying the
 * mount's location. Nothing is built, written or copied into this store.
 */
async function mountedSection(store: Store, sectionId: string): Promise<MountedCatalogSection[]> {
  const sections: MountedCatalogSection[] = [];
  for (const mount of await resolveMounts(store.root, store.config)) {
    if (mount.state !== 'present') continue;
    const content = await readCatalogSection({ root: mount.root, config: mount.config }, sectionId);
    if (content === null) continue;
    const entries = content
      .split('\n')
      .filter((line) => ENTRY_PATH_RE.test(line))
      .map((line) => line.replace(ENTRY_PATH_RE, (_all, open: string, notePath: string, close: string) => `${open}${mount.location}/${notePath}${close}`));
    if (entries.length > 0) sections.push({ name: mount.name, location: mount.location, entries });
  }
  return sections;
}

export async function execute(store: Store, flags: CatalogShowFlags): Promise<CommandOutcome<CatalogShowData>> {
  const content = await readCatalogSection(store, flags.section);
  if (content === null) {
    throw new CatalogSectionNotFoundError(flags.section);
  }
  const mounts = (store.config.shared_stores ?? []).length > 0 ? await mountedSection(store, flags.section) : undefined;
  const mountedText = (mounts ?? []).map((m) => [`## ${m.location}/ (mounted store "${m.name}")`, '', ...m.entries].join('\n'));
  return {
    exitCode: ExitCode.Ok,
    data: { section: flags.section, content, ...(mounts !== undefined ? { mounts } : {}) },
    findings: [],
    humanSummary: mountedText.length === 0 ? content : [content.replace(/\n+$/, ''), ...mountedText].join('\n\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
