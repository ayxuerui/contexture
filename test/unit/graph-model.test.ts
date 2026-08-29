import { describe, expect, it } from 'vitest';
import { buildGraphFromNotes } from '../../src/core/graph/model.js';
import { GraphIdentityCollisionError } from '../../src/core/errors.js';
import type { Note } from '../../src/core/notes/list.js';

function note(path: string, body: string): Note {
  return { path, frontmatter: undefined, body };
}

describe('buildGraphFromNotes', () => {
  it('produces one node per note, identified by full path, never by filename stem', () => {
    const graph = buildGraphFromNotes([note('projects/beta.md', ''), note('areas/beta.md', '')]);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['areas/beta.md', 'projects/beta.md']);
  });

  it('resolves an unambiguous wikilink target to an edge', () => {
    const graph = buildGraphFromNotes([note('projects/a.md', 'See [[b]].'), note('projects/b.md', '')]);
    expect(graph.edges).toEqual([{ src: 'projects/a.md', dst: 'projects/b.md', type: 'link' }]);
    expect(graph.dangling).toEqual([]);
  });

  it('reports a link to a nonexistent stem as dangling with reason not_found, and still exits (returns) successfully', () => {
    const graph = buildGraphFromNotes([note('projects/a.md', 'See [[nowhere]].')]);
    expect(graph.edges).toEqual([]);
    expect(graph.dangling).toEqual([{ from: 'projects/a.md', target: 'nowhere', reason: 'not_found' }]);
  });

  it('degrades an ambiguous stem (two notes sharing a filename) to a non-fatal dangling link, not a fatal collision', () => {
    const graph = buildGraphFromNotes([
      note('projects/beta.md', ''),
      note('areas/beta.md', ''),
      note('projects/a.md', 'See [[beta]].'),
    ]);
    expect(graph.dangling).toEqual([{ from: 'projects/a.md', target: 'beta', reason: 'ambiguous' }]);
    expect(graph.edges).toEqual([]);
    // The two same-named notes are still both valid, distinct nodes.
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['areas/beta.md', 'projects/a.md', 'projects/beta.md']);
  });

  it('throws GraphIdentityCollisionError on a genuine identity collision (defensive: unreachable via a real note listing, only via direct injection)', () => {
    const duplicated = [note('projects/a.md', ''), note('projects/a.md', '')];
    expect(() => buildGraphFromNotes(duplicated)).toThrow(GraphIdentityCollisionError);
  });

  it('ignores link syntax variants outside a plain [[target]] (piped display text, section anchors) by extracting only the target', () => {
    const graph = buildGraphFromNotes([note('a.md', 'See [[b|Display Text]] and [[b#Section]].'), note('b.md', '')]);
    expect(graph.edges).toEqual([
      { src: 'a.md', dst: 'b.md', type: 'link' },
      { src: 'a.md', dst: 'b.md', type: 'link' },
    ]);
    expect(graph.dangling).toEqual([]);
  });
});
