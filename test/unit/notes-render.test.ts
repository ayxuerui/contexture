import { describe, expect, it } from 'vitest';
import { parseNoteText } from '../../src/core/notes/parse.js';
import { renderNoteText } from '../../src/core/notes/render.js';

describe('renderNoteText', () => {
  it('renders no frontmatter block at all when frontmatter is undefined', () => {
    expect(renderNoteText(undefined, 'Just a body.\n')).toBe('Just a body.\n');
  });

  it('renders no frontmatter block when frontmatter is an empty object', () => {
    expect(renderNoteText({}, 'Just a body.\n')).toBe('Just a body.\n');
  });

  it('round-trips through parseNoteText', () => {
    const rendered = renderNoteText({ title: 'A', scope: 'shared' }, '# A\n\nBody text.\n');
    const parsed = parseNoteText(rendered, 'a.md');
    expect(parsed.frontmatter).toEqual({ title: 'A', scope: 'shared' });
    expect(parsed.body).toBe('# A\n\nBody text.\n');
  });

  it('preserves the body exactly, including its own leading/trailing whitespace', () => {
    const rendered = renderNoteText({ x: 1 }, '\nLeading blank line.\n\n');
    const parsed = parseNoteText(rendered, 'a.md');
    expect(parsed.body).toBe('\nLeading blank line.\n\n');
  });
});
