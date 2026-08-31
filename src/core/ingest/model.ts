import type { Note } from '../notes/list.js';
import { canonicalizeSourceId } from './canonical-url.js';
import { SOURCE_ALT_IDS_FIELD, SOURCE_HASH_FIELD, SOURCE_ID_FIELD } from './identity.js';

export type SourceCheckVerdict = 'new' | 'already_ingested' | 'drift' | 'alternate_source_match' | 'multiple_matches';

export interface SourceCheckResult {
  verdict: SourceCheckVerdict;
  /** The stage that produced the verdict, when a match stage was reached at all. */
  stage?: 'source_id' | 'content_hash';
  /** Paths of every matching note, in the stage that decided the verdict. */
  matches: string[];
  hash: string;
}

function recordedIds(note: Note): string[] {
  const ids: string[] = [];
  const primary = note.frontmatter?.[SOURCE_ID_FIELD];
  if (typeof primary === 'string') ids.push(primary);
  const alts = note.frontmatter?.[SOURCE_ALT_IDS_FIELD];
  if (Array.isArray(alts)) {
    for (const alt of alts) if (typeof alt === 'string') ids.push(alt);
  }
  return ids;
}

/**
 * context-ingest spec: two-stage content-addressed dedupe, evaluated in
 * order, stopping (and reporting `multiple_matches` rather than guessing)
 * the moment either stage finds more than one match.
 *
 * store-primitives-from-migration-audit spec (D2): a source-id match
 * (primary OR an alternate `source add-alt` recorded) whose recorded hash
 * differs from the candidate's is `drift`, not `already_ingested` — the
 * identity is the same, the content moved. Every id is compared in its
 * canonicalized form (D2), so a URL varying only in case, tracking
 * parameters, or a trailing slash still matches.
 */
export function evaluateSourceCheck(
  notes: readonly Note[],
  candidateHash: string,
  sourceId: string,
  trackingParams: readonly string[] = [],
): SourceCheckResult {
  const canonicalCandidate = canonicalizeSourceId(sourceId, trackingParams);
  const idMatches = notes
    .filter((n) => recordedIds(n).some((id) => canonicalizeSourceId(id, trackingParams) === canonicalCandidate))
    .map((n) => n.path);

  if (idMatches.length > 1) {
    return { verdict: 'multiple_matches', stage: 'source_id', matches: idMatches, hash: candidateHash };
  }
  if (idMatches.length === 1) {
    const matched = notes.find((n) => n.path === idMatches[0]);
    const recordedHash = matched?.frontmatter?.[SOURCE_HASH_FIELD];
    if (typeof recordedHash === 'string' && recordedHash !== candidateHash) {
      return { verdict: 'drift', stage: 'source_id', matches: idMatches, hash: candidateHash };
    }
    return { verdict: 'already_ingested', stage: 'source_id', matches: idMatches, hash: candidateHash };
  }

  const hashMatches = notes.filter((n) => n.frontmatter?.[SOURCE_HASH_FIELD] === candidateHash).map((n) => n.path);
  if (hashMatches.length > 1) {
    return { verdict: 'multiple_matches', stage: 'content_hash', matches: hashMatches, hash: candidateHash };
  }
  if (hashMatches.length === 1) {
    return { verdict: 'alternate_source_match', stage: 'content_hash', matches: hashMatches, hash: candidateHash };
  }

  return { verdict: 'new', matches: [], hash: candidateHash };
}
