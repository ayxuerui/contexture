import { describe, expect, it } from 'vitest';
import { buildGraphFromNotes, clusterOf, extractLinkTargets, LINK_EDGE_TYPE, ROOT_CLUSTER } from '../../src/core/graph/model.js';
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

describe('graph-context-document: positional clusters (D2)', () => {
  it('a layered note clusters on its first two directory segments', () => {
    const graph = buildGraphFromNotes([note('alpha/topic-x/deep/n.md', '')]);
    expect(graph.nodes[0]!.cluster).toBe('alpha/topic-x');
  });

  it('a shallower note uses the segments it has; a root note joins the root cluster', () => {
    const graph = buildGraphFromNotes([note('alpha/n.md', ''), note('root-note.md', '')]);
    expect(graph.nodes.map((n) => n.cluster)).toEqual(['alpha', ROOT_CLUSTER]);
  });

  it('honors a configured depth', () => {
    expect(clusterOf('a/b/c/n.md', 1)).toBe('a');
    expect(clusterOf('a/b/c/n.md', 3)).toBe('a/b/c');
  });
});

describe('graph-context-document: typed edges from relation sections (D3)', () => {
  const body = ['# Title', 'Intro [[intro-target]].', '', '## Supports:', '- [[supported]]', '', '### Detail', '- [[still-supported]]', '', '## Notes', '- [[plain]]'].join('\n');
  const targets = ['intro-target', 'supported', 'still-supported', 'plain'].map((stem) => note(`alpha/${stem}.md`, ''));

  it('types a link under a vocabulary heading (case-insensitive, trailing colon ignored), including deeper sub-headings', () => {
    const graph = buildGraphFromNotes([note('alpha/src.md', body), ...targets], { relations: ['supports'] });
    const types = Object.fromEntries(graph.edges.map((e) => [e.dst, e.type]));
    expect(types['alpha/supported.md']).toBe('supports');
    expect(types['alpha/still-supported.md']).toBe('supports');
  });

  it('a link before any section or after the section closes is an ordinary link', () => {
    const graph = buildGraphFromNotes([note('alpha/src.md', body), ...targets], { relations: ['supports'] });
    const types = Object.fromEntries(graph.edges.map((e) => [e.dst, e.type]));
    expect(types['alpha/intro-target.md']).toBe(LINK_EDGE_TYPE);
    expect(types['alpha/plain.md']).toBe(LINK_EDGE_TYPE);
  });

  it('a heading outside the vocabulary never types anything', () => {
    const graph = buildGraphFromNotes([note('alpha/src.md', body), ...targets], { relations: ['contradicts'] });
    expect(graph.edges.every((e) => e.type === LINK_EDGE_TYPE)).toBe(true);
  });

  it('an empty vocabulary records zero typed edges and the same edges as before', () => {
    const before = buildGraphFromNotes([note('alpha/src.md', body), ...targets]);
    const explicit = buildGraphFromNotes([note('alpha/src.md', body), ...targets], { relations: [] });
    expect(before.edges.every((e) => e.type === LINK_EDGE_TYPE)).toBe(true);
    expect(explicit.edges).toEqual(before.edges);
    expect(before.edges).toHaveLength(4);
  });

  it('extractLinkTargets still returns every target regardless of section', () => {
    expect(extractLinkTargets(body)).toEqual(['intro-target', 'supported', 'still-supported', 'plain']);
  });
});
