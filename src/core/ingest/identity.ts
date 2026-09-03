import type { Note } from '../notes/list.js';

/**
 * context-ingest spec: "source type, source id, source hash, ingested
 * date" — assigned once, at ingest, never before. Nothing asks these keys
 * to be configurable, so they live here as the one set of literals every
 * ingest-related module reads from, rather than each spelling out its own
 * string.
 */
export const SOURCE_TYPE_FIELD = 'source_type';
export const SOURCE_ID_FIELD = 'source_id';
export const SOURCE_HASH_FIELD = 'source_hash';
export const INGESTED_FIELD = 'ingested';
/** store-primitives-from-migration-audit spec (D2): alternative source identities `source add-alt` appends — a later check against any of them reports `duplicate`. */
export const SOURCE_ALT_IDS_FIELD = 'source_alt_ids';
/** retain-captures-as-provenance: the capture paths a note was synthesized from — a list, because a note may cite many. */
export const SOURCES_FIELD = 'sources';
/** retain-captures-as-provenance: on a sidecar, the non-markdown capture beside it whose bytes the hash is taken over. */
export const CAPTURE_FILE_FIELD = 'capture_file';

const IDENTITY_FIELDS = [SOURCE_TYPE_FIELD, SOURCE_ID_FIELD, SOURCE_HASH_FIELD, INGESTED_FIELD] as const;

/**
 * retain-captures-as-provenance: the two fields ingest itself assigns, as
 * opposed to the two a capture pipeline commonly already knows when it writes
 * the file. Splitting them is what lets a fetcher record where something came
 * from without pretending it has been ingested.
 */
const ASSIGNED_AT_INGEST_FIELDS = [SOURCE_HASH_FIELD, INGESTED_FIELD] as const;

/** Whether a record carries any source-identity field at all — what makes it a dedupe record. */
export function hasSourceIdentity(note: Pick<Note, 'frontmatter'>): boolean {
  return IDENTITY_FIELDS.some((field) => note.frontmatter?.[field] !== undefined);
}

/** Whether ingest has already run against this capture — the re-ingest guard. */
export function hasAssignedIdentity(note: Pick<Note, 'frontmatter'>): boolean {
  return ASSIGNED_AT_INGEST_FIELDS.some((field) => note.frontmatter?.[field] !== undefined);
}
