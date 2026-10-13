import { describe, expect, it } from 'vitest';
import { contentHashOfBody } from '../../src/core/content/canonicalize.js';
import type { Note } from '../../src/core/notes/list.js';
import {
  appendHashMarker,
  assessRepresentation,
  readHashMarker,
  readLeadLink,
  resolveRepresented,
} from '../../src/core/publish/represents.js';

function note(path: string, body = `# ${path}\n`): Note {
  return { path, frontmatter: undefined, body };
}

/** two-kinds-of-published-page D4/D5: the one reading of a README's lead link, and its hash marker. */
describe('readLeadLink', () => {
  it('returns the first wikilink of many, with its raw line', () => {
    expect(readLeadLink('# page\n\n- [[first]] — lead\n- [[second]]\n', 'README.md')).toEqual({ target: 'first', line: 2 });
  });

  it('excludes frontmatter, but counts its lines toward the raw line index', () => {
    const raw = '---\nsource: "[[in-frontmatter]]"\n---\n# page\n\n- [[body-link]]\n';
    expect(readLeadLink(raw, 'README.md')).toEqual({ target: 'body-link', line: 5 });
  });

  it('strips an alias and a heading anchor', () => {
    expect(readLeadLink('- [[ctx-note|Shown]]\n', 'README.md')?.target).toBe('ctx-note');
    expect(readLeadLink('- [[ctx-note#Part]]\n', 'README.md')?.target).toBe('ctx-note');
  });

  it('returns null when the body links nothing', () => {
    expect(readLeadLink('# page\n\nNo links.\n', 'README.md')).toBeNull();
  });
});

describe('resolveRepresented', () => {
  const notes = [note('a/one.md'), note('a/twin.md'), note('b/twin.md')];

  it('resolves a stem one note carries', () => {
    expect(resolveRepresented(notes, 'one')).toEqual({ note: notes[0] });
  });

  it('reports none for a stem no note carries', () => {
    expect(resolveRepresented(notes, 'nowhere')).toEqual({ none: true });
  });

  it('names every note sharing a stem', () => {
    expect(resolveRepresented(notes, 'twin')).toEqual({ ambiguous: ['a/twin.md', 'b/twin.md'] });
  });
});

describe('hash markers', () => {
  const hash = '0123456789abcdef';

  it('round-trips through append and read', () => {
    const line = appendHashMarker('- [[ctx-note]] — the note', hash);
    expect(line).toBe('- [[ctx-note]] — the note <!-- hash:0123456789abcdef -->');
    expect(readHashMarker(line)).toBe(hash);
  });

  it('never appends a second marker, and never overwrites the first', () => {
    const once = appendHashMarker('- [[ctx-note]]', hash);
    expect(appendHashMarker(once, 'fedcba9876543210')).toBe(once);
  });

  it('keeps a CRLF line ending', () => {
    expect(appendHashMarker('- [[ctx-note]]\r', hash)).toBe('- [[ctx-note]] <!-- hash:0123456789abcdef -->\r');
  });

  it('reads nothing from a line with no marker', () => {
    expect(readHashMarker('- [[ctx-note]]')).toBeNull();
  });
});

describe('assessRepresentation', () => {
  const body = '# Ctx note\n\nFacts.\n';
  const notes = [note('a/ctx-note.md', body)];
  const hash = contentHashOfBody(body);

  it('is current when the marker matches the note', () => {
    expect(assessRepresentation(`- [[ctx-note]] <!-- hash:${hash} -->\n`, 'README.md', notes).status).toBe('current');
  });

  it('is not stamped when the lead line has no marker, even if a later line has one', () => {
    expect(assessRepresentation(`- [[ctx-note]]\n- [[other]] <!-- hash:${hash} -->\n`, 'README.md', notes).status).toBe('not-stamped');
  });

  it('is stale when the marker differs', () => {
    expect(assessRepresentation('- [[ctx-note]] <!-- hash:0000000000000000 -->\n', 'README.md', notes).status).toBe('stale');
  });

  it('distinguishes no link, not found and ambiguous', () => {
    expect(assessRepresentation('# none\n', 'README.md', notes).status).toBe('no-link');
    expect(assessRepresentation('- [[nowhere]]\n', 'README.md', notes).status).toBe('not-found');
    expect(assessRepresentation('- [[twin]]\n', 'README.md', [note('a/twin.md'), note('b/twin.md')]).status).toBe('ambiguous');
  });
});
