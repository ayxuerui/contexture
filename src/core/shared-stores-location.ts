import type { StoreConfig } from '../config/schema.js';

/**
 * mount-shared-stores: the fixed directory every mount sits under (D3, and the
 * critique's first revision). Fixed rather than configurable because path links
 * written into notes carry it, so it has to mean the same thing in every store.
 *
 * Kept apart from `shared-stores.ts` because note enumeration needs it, and
 * `shared-stores.ts` itself enumerates notes.
 */
export const SHARED_STORES_DIR = 'shared';

/** A mount's store-relative location, `shared/<name>`. */
export function mountLocation(name: string): string {
  return `${SHARED_STORES_DIR}/${name}`;
}

/** Whether the store declares any mounts. A store with no `shared_stores` key behaves exactly as before. */
export function declaresSharedStores(config: StoreConfig): boolean {
  return (config.shared_stores ?? []).length > 0;
}

/** Every declared mount's location: the owning-store scopes link resolution splits a read view by. */
export function mountScopes(config: StoreConfig): string[] {
  return (config.shared_stores ?? []).map((mount) => mountLocation(mount.name));
}
