import type { Note } from '../notes/list.js';

/**
 * context-ingest spec: "source type, source id, source hash, ingested
 * date" — assigned once, at ingest, never before. Like disclosure's
 * `audience` field, nothing asks these keys to be configurable, so they
 * live here as the one set of literals every ingest-related module reads
 * from, rather than each spelling out its own string.
 */
export const SOURCE_TYPE_FIELD = 'source_type';
export const SOURCE_ID_FIELD = 'source_id';
export const SOURCE_HASH_FIELD = 'source_hash';
export const INGESTED_FIELD = 'ingested';
/** store-primitives-from-migration-audit spec (D2): alternative source identities `source add-alt` appends — a later check against any of them reports `duplicate`. */
export const SOURCE_ALT_IDS_FIELD = 'source_alt_ids';

const IDENTITY_FIELDS = [SOURCE_TYPE_FIELD, SOURCE_ID_FIELD, SOURCE_HASH_FIELD, INGESTED_FIELD] as const;

/** Whether a note already carries any source-identity field — a re-ingest guard, and capture's own invariant. */
export function hasSourceIdentity(note: Pick<Note, 'frontmatter'>): boolean {
  return IDENTITY_FIELDS.some((field) => note.frontmatter?.[field] !== undefined);
}
