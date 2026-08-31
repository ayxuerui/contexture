import { describe, expect, it } from 'vitest';
import { evaluateSourceCheck } from '../../src/core/ingest/model.js';
import type { Note } from '../../src/core/notes/list.js';

function note(path: string, frontmatter: Record<string, unknown> | undefined = undefined): Note {
  return { path, frontmatter, body: '' };
}

describe('evaluateSourceCheck', () => {
  it('reports "new" when no note matches by source-id or content hash', () => {
    const result = evaluateSourceCheck([], 'hash-1', 'src-1');
    expect(result).toEqual({ verdict: 'new', matches: [], hash: 'hash-1' });
  });

  it('reports "already_ingested" when exactly one note matches by source-id', () => {
    const notes = [note('a.md', { source_id: 'src-1' })];
    const result = evaluateSourceCheck(notes, 'hash-1', 'src-1');
    expect(result).toEqual({ verdict: 'already_ingested', stage: 'source_id', matches: ['a.md'], hash: 'hash-1' });
  });

  it('reports "multiple_matches" when more than one note matches by source-id, without consulting content hash', () => {
    const notes = [note('a.md', { source_id: 'src-1' }), note('b.md', { source_id: 'src-1' })];
    const result = evaluateSourceCheck(notes, 'hash-1', 'src-1');
    expect(result).toEqual({
      verdict: 'multiple_matches',
      stage: 'source_id',
      matches: ['a.md', 'b.md'],
      hash: 'hash-1',
    });
  });

  it('reports "alternate_source_match" when no source-id match exists but exactly one content-hash match does', () => {
    const notes = [note('a.md', { source_id: 'other-src', source_hash: 'hash-1' })];
    const result = evaluateSourceCheck(notes, 'hash-1', 'src-1');
    expect(result).toEqual({
      verdict: 'alternate_source_match',
      stage: 'content_hash',
      matches: ['a.md'],
      hash: 'hash-1',
    });
  });

  it('reports "multiple_matches" when more than one note shares the content hash under different source-ids', () => {
    const notes = [
      note('a.md', { source_id: 'src-a', source_hash: 'hash-1' }),
      note('b.md', { source_id: 'src-b', source_hash: 'hash-1' }),
    ];
    const result = evaluateSourceCheck(notes, 'hash-1', 'src-1');
    expect(result).toEqual({
      verdict: 'multiple_matches',
      stage: 'content_hash',
      matches: ['a.md', 'b.md'],
      hash: 'hash-1',
    });
  });

  it('a source-id match takes priority over a content-hash match, even for a different note', () => {
    const notes = [
      note('a.md', { source_id: 'src-1', source_hash: 'hash-1' }),
      note('b.md', { source_hash: 'hash-1' }),
    ];
    const result = evaluateSourceCheck(notes, 'hash-1', 'src-1');
    expect(result.verdict).toBe('already_ingested');
    expect(result.matches).toEqual(['a.md']);
  });

  it('store-primitives-from-migration-audit D2: a source-id match whose recorded hash differs from the candidate is drift, not already_ingested', () => {
    const notes = [note('a.md', { source_id: 'src-1', source_hash: 'h1' })];
    const result = evaluateSourceCheck(notes, 'h2', 'src-1');
    expect(result).toEqual({ verdict: 'drift', stage: 'source_id', matches: ['a.md'], hash: 'h2' });
  });

  it('does not match a note whose source-hash was frozen at ingest but whose current body has since changed (never recomputes live)', () => {
    // evaluateSourceCheck only ever reads the frozen frontmatter field, never the note body.
    const notes = [note('a.md', { source_id: 'src-1', source_hash: 'frozen-hash' })];
    const result = evaluateSourceCheck(notes, 'frozen-hash', 'src-1');
    expect(result.verdict).toBe('already_ingested');
  });

  it('store-primitives-from-migration-audit D2: an alternate source id (source add-alt) matches as duplicate', () => {
    const notes = [note('a.md', { source_id: 'src-1', source_hash: 'h1', source_alt_ids: ['src-2'] })];
    const result = evaluateSourceCheck(notes, 'h1', 'src-2');
    expect(result).toEqual({ verdict: 'already_ingested', stage: 'source_id', matches: ['a.md'], hash: 'h1' });
  });

  it('canonicalizes URL source ids before comparing: case, tracking parameters, fragment, and trailing slash are ignored', () => {
    const notes = [note('a.md', { source_id: 'https://Example.com/a/', source_hash: 'h1' })];
    const trackingParams = ['utm_source'];
    const result = evaluateSourceCheck(notes, 'h1', 'https://example.com/a?utm_source=x#top', trackingParams);
    expect(result.verdict).toBe('already_ingested');
    expect(result.matches).toEqual(['a.md']);
  });

  it('a non-URL source id is compared unchanged, canonicalization or not', () => {
    const notes = [note('a.md', { source_id: 'granola/abc123', source_hash: 'h1' })];
    const result = evaluateSourceCheck(notes, 'h1', 'granola/abc123', ['utm_source']);
    expect(result.verdict).toBe('already_ingested');
  });
});
