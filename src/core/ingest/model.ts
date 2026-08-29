import type { Note } from '../notes/list.js';
import { SOURCE_HASH_FIELD, SOURCE_ID_FIELD } from './identity.js';

export type SourceCheckVerdict = 'new' | 'already_ingested' | 'alternate_source_match' | 'multiple_matches';

export interface SourceCheckResult {
  verdict: SourceCheckVerdict;
  /** The stage that produced the verdict, when a match stage was reached at all. */
  stage?: 'source_id' | 'content_hash';
  /** Paths of every matching note, in the stage that decided the verdict. */
  matches: string[];
  hash: string;
}

/**
 * context-ingest spec: two-stage content-addressed dedupe, evaluated in
 * order, stopping (and reporting `multiple_matches` rather than guessing)
 * the moment either stage finds more than one match.
 */
export function evaluateSourceCheck(notes: readonly Note[], candidateHash: string, sourceId: string): SourceCheckResult {
  const idMatches = notes.filter((n) => n.frontmatter?.[SOURCE_ID_FIELD] === sourceId).map((n) => n.path);
  if (idMatches.length > 1) {
    return { verdict: 'multiple_matches', stage: 'source_id', matches: idMatches, hash: candidateHash };
  }
  if (idMatches.length === 1) {
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
