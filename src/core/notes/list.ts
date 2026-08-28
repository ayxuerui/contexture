/**
 * The note-enumeration seam every later retrieval leg builds on. This
 * mitigates a real finding: openspec/config.yaml's own authoring rule says
 * "sequence visibility enforcement before retrieval — a pre-filter cannot be
 * safely retrofitted from a post-filter," but tasks.md's phase order puts
 * retrieval (Phase 4) before visibility enforcement (Phase 5). Rather than
 * reopening the merged spec, `as` is accepted (and ignored) here from
 * Phase 0, so Phase 4's graph/catalog build on an already-filterable
 * signature and Phase 5 wires a real filter into it, instead of Phase 5
 * needing to audit every Phase 3/4 traversal for safety.
 */
export interface NoteQuery {
  /** The requesting context, for visibility filtering. Unused until Phase 5. */
  as?: string;
  underPrefix?: string;
  includeExcluded?: boolean;
}

export interface Note {
  path: string;
}

/** Phase 0: no note parsing exists yet. Always returns []. */
export async function listNotes(_storeRoot: string, _query?: NoteQuery): Promise<Note[]> {
  return [];
}
