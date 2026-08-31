import { describe, expect, it } from 'vitest';
import { InvalidNoteFrontmatterError } from '../../src/core/errors.js';
import { parseNoteText } from '../../src/core/notes/parse.js';

describe('parseNoteText', () => {
  it('treats a note with no frontmatter as valid, with frontmatter undefined', () => {
    const note = parseNoteText('# Hello\n\nNo frontmatter.\n', 'a.md');
    expect(note.frontmatter).toBeUndefined();
    expect(note.body).toBe('# Hello\n\nNo frontmatter.\n');
    expect(note.path).toBe('a.md');
  });

  it('parses a frontmatter block into an object and strips it from the body', () => {
    const raw = '---\ntitle: Hi\nscope: shared\n---\n# Hi\n';
    const note = parseNoteText(raw, 'b.md');
    expect(note.frontmatter).toEqual({ title: 'Hi', scope: 'shared' });
    expect(note.body).toBe('# Hi\n');
  });

  it('handles CRLF line endings in the frontmatter delimiter', () => {
    const raw = '---\r\ntitle: Hi\r\n---\r\n# Hi\r\n';
    const note = parseNoteText(raw, 'c.md');
    expect(note.frontmatter).toEqual({ title: 'Hi' });
  });

  it('throws InvalidNoteFrontmatterError on unparseable YAML', () => {
    const raw = '---\ntitle: "unterminated\n---\n# Hi\n';
    expect(() => parseNoteText(raw, 'd.md')).toThrow(InvalidNoteFrontmatterError);
  });

  it('throws InvalidNoteFrontmatterError when frontmatter parses to a non-mapping', () => {
    const raw = '---\n- one\n- two\n---\n# Hi\n';
    expect(() => parseNoteText(raw, 'e.md')).toThrow(InvalidNoteFrontmatterError);
  });

  it('does not treat a bare leading "---" with no closing delimiter as frontmatter', () => {
    const raw = '---\nthis just looks like a horizontal rule\n';
    const note = parseNoteText(raw, 'f.md');
    expect(note.frontmatter).toBeUndefined();
    expect(note.body).toBe(raw);
  });
});
