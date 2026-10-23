import { existsSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from '../config/load.js';
import type { StoreConfig } from '../config/schema.js';
import { mainWorkingTreeRoot } from './git/repo.js';
import { buildGraphFromNotes, graphBuildOptions, type GraphBuildResult } from './graph/model.js';
import { listNotes, type Note } from './notes/list.js';
import { CONFIG_FILE_NAME } from './root.js';
import { declaresSharedStores, mountLocation, mountScopes, SHARED_STORES_DIR as SHARED_STORES_DIR_NAME } from './shared-stores-location.js';

export { mainWorkingTreeRoot } from './git/repo.js';
export { SHARED_STORES_DIR, declaresSharedStores, mountLocation, mountScopes } from './shared-stores-location.js';

export type MountState =
  | { name: string; url: string; location: string; root: string; state: 'present'; config: StoreConfig }
  | { name: string; url: string; location: string; root: string; state: 'absent' }
  | { name: string; url: string; location: string; root: string; state: 'not_store'; reason: string };

/** Every declared mount and whether it can join the read view, read from the main working tree. */
export async function resolveMounts(storeRoot: string, config: StoreConfig): Promise<MountState[]> {
  const mainRoot = mainWorkingTreeRoot(storeRoot);
  const states: MountState[] = [];
  for (const mount of config.shared_stores ?? []) {
    const location = mountLocation(mount.name);
    const root = path.join(mainRoot, ...location.split('/'));
    const base = { name: mount.name, url: mount.url, location, root };
    if (!existsSync(root)) {
      states.push({ ...base, state: 'absent' });
      continue;
    }
    if (!existsSync(path.join(root, CONFIG_FILE_NAME))) {
      states.push({ ...base, state: 'not_store', reason: `no ${CONFIG_FILE_NAME} at the mount's root` });
      continue;
    }
    try {
      states.push({ ...base, state: 'present', config: await readConfig(root) });
    } catch (err) {
      states.push({ ...base, state: 'not_store', reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return states;
}

export interface ReadView {
  /** The store's own notes, then each present mount's, every mounted path prefixed by its location. */
  notes: Note[];
  /** The location prefix of every mount that contributed notes; link resolution scopes by these. */
  scopes: string[];
  mounts: MountState[];
}

/**
 * context-retrieval (mount-shared-stores): the store's own notes plus each
 * present mount's, each admitted by the configuration of the store that owns
 * it (D5). A store with no mounts gets exactly its own notes and no scopes.
 */
export async function listReadView(storeRoot: string, config: StoreConfig): Promise<ReadView> {
  const own = await listNotes(storeRoot, config);
  if (!declaresSharedStores(config)) return { notes: own, scopes: [], mounts: [] };

  const mounts = await resolveMounts(storeRoot, config);
  const notes = [...own];
  const scopes: string[] = [];
  for (const mount of mounts) {
    if (mount.state !== 'present') continue;
    scopes.push(mount.location);
    for (const note of await listNotes(mount.root, mount.config)) {
      notes.push({ ...note, path: `${mount.location}/${note.path}` });
    }
  }
  return { notes, scopes, mounts };
}

/** The graph of a store's read view: the one build every caller that writes or compares the persisted graph uses. */
export async function buildReadViewGraph(storeRoot: string, config: StoreConfig): Promise<{ graph: GraphBuildResult; view: ReadView }> {
  const view = await listReadView(storeRoot, config);
  return { graph: buildGraphFromNotes(view.notes, { ...graphBuildOptions(config), scopes: mountScopes(config) }), view };
}

export interface UnavailableMount {
  name: string;
  location: string;
  state: 'absent' | 'not_store';
  reason?: string;
}

/** Mounts a read view could not include, as report lines. */
export function unavailableMounts(mounts: readonly MountState[]): UnavailableMount[] {
  const unavailable: UnavailableMount[] = [];
  for (const mount of mounts) {
    if (mount.state === 'absent') unavailable.push({ name: mount.name, location: mount.location, state: 'absent' });
    else if (mount.state === 'not_store') unavailable.push({ name: mount.name, location: mount.location, state: 'not_store', reason: mount.reason });
  }
  return unavailable;
}

export interface MountingStore {
  /** The main working tree of the store that declares this one as a mount. */
  root: string;
  config: StoreConfig;
  /** The name it declares this store under. */
  mountName: string;
}

/**
 * approve-sessions-across-stores: the store that mounts the store at
 * `storeRoot`, when `storeRoot` is (or is a worktree of) a clone at
 * `shared/<name>` of a store that declares a mount named `<name>`; null
 * otherwise. Decided from the filesystem and that store's configuration alone.
 */
export async function mountingStoreOf(storeRoot: string): Promise<MountingStore | null> {
  const clone = mainWorkingTreeRoot(storeRoot);
  const sharedDir = path.dirname(clone);
  if (path.basename(sharedDir) !== SHARED_STORES_DIR_NAME) return null;
  const root = path.dirname(sharedDir);
  if (!existsSync(path.join(root, CONFIG_FILE_NAME))) return null;
  let config: StoreConfig;
  try {
    config = await readConfig(root);
  } catch {
    return null;
  }
  const mountName = path.basename(clone);
  if (!(config.shared_stores ?? []).some((mount) => mount.name === mountName)) return null;
  return { root, config, mountName };
}
