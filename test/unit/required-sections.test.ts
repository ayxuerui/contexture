import { describe, expect, it } from 'vitest';
import { missingRequiredSection } from '../../src/core/ingest/required-sections.js';

/**
 * harden-the-required-capture-section D1: a declared section counts only when
 * it has something under it, and a heading inside a fenced code block is not a
 * heading. One test per edge, because a guard whose edges nobody has pinned is
 * not a guard.
 */
type Config = Parameters<typeof missingRequiredSection>[0];
// The check reads only `ingest.required_capture_sections`, so the rest of a store config is beside the point here.
const config = { ingest: { required_capture_sections: { 'ctx-a': 'Transcript' } } } as unknown as Config;
const missing = (body: string, ...type: [string | undefined] | []) => missingRequiredSection(config, type.length === 0 ? 'ctx-a' : type[0], body);
const FENCE = '```';

describe('missingRequiredSection: what counts as a section', () => {
  it('accepts a heading with text under it', () => {
    expect(missing('# Meeting\n\n## Transcript\n\nAlice: hello.\n')).toBeUndefined();
  });

  it('refuses no heading at all, naming the declared section', () => {
    expect(missing('# Meeting\n\n## Summary\n\nOnly the derivation.\n')).toBe('Transcript');
  });

  it('refuses a heading that ends the file with nothing under it', () => {
    expect(missing('# Meeting\n\n## Transcript\n')).toBe('Transcript');
    expect(missing('# Meeting\n\n## Transcript')).toBe('Transcript');
  });

  it('refuses a heading followed only by blank lines before the next heading of the same level', () => {
    expect(missing('## Transcript\n\n   \n\n## Notes\n\nThis text belongs to Notes.\n')).toBe('Transcript');
  });

  it('refuses a heading followed only by a shallower heading, whatever follows it', () => {
    expect(missing('### Transcript\n\n# Top\n\nBelongs to Top.\n')).toBe('Transcript');
  });

  it('refuses a heading followed only by an empty deeper heading', () => {
    expect(missing('## Transcript\n\n### Part one\n\n### Part two\n')).toBe('Transcript');
  });

  it('accepts a heading whose only text sits under a deeper heading, which is part of the section', () => {
    expect(missing('## Transcript\n\n### Part one\n\nAlice: hello.\n')).toBeUndefined();
  });

  it('stays level-agnostic about the declared heading', () => {
    for (const level of ['#', '##', '###', '######']) expect(missing(`${level} Transcript\n\ntext\n`)).toBeUndefined();
  });

  it('stays case-sensitive about the name', () => {
    expect(missing('## transcript\n\ntext\n')).toBe('Transcript');
  });

  it('accepts up to three spaces of indent on the heading, and not four, which is a code block', () => {
    expect(missing('   ## Transcript\n\ntext\n')).toBeUndefined();
    expect(missing('    ## Transcript\n\ntext\n')).toBe('Transcript');
  });

  it('reads CRLF line endings the same way', () => {
    expect(missing('## Transcript\r\n\r\nAlice: hello.\r\n')).toBeUndefined();
    expect(missing('## Transcript\r\n\r\n## Next\r\n')).toBe('Transcript');
  });
});

describe('missingRequiredSection: fenced code blocks', () => {
  it('does not take a heading inside a backtick fence for a section', () => {
    expect(missing(`# Meeting\n\n${FENCE}\n## Transcript\nexample markup, not a section\n${FENCE}\n`)).toBe('Transcript');
  });

  it('does not take a heading inside a tilde fence for a section', () => {
    expect(missing('# Meeting\n\n~~~\n## Transcript\nexample\n~~~\n')).toBe('Transcript');
  });

  it('still accepts a real heading when a fenced copy of it sits elsewhere in the same capture', () => {
    expect(missing(`${FENCE}\n## Transcript\n${FENCE}\n\n## Transcript\n\nAlice: hello.\n`)).toBeUndefined();
  });

  it('counts text inside a code block under a real heading: a pasted transcript is still a transcript', () => {
    expect(missing(`## Transcript\n\n${FENCE}\nAlice: hello.\n${FENCE}\n`)).toBeUndefined();
  });

  it('does not count a code block with nothing in it', () => {
    expect(missing(`## Transcript\n\n${FENCE}\n${FENCE}\n`)).toBe('Transcript');
    expect(missing(`## Transcript\n\n${FENCE}text\n\n${FENCE}\n`)).toBe('Transcript'); // an info string is not content either
    expect(missing(`## Transcript\n\n${FENCE}text\nAlice: hello.\n${FENCE}\n`)).toBeUndefined(); // a line inside is
  });

  it('lets an unclosed fence run to the end of the file, as markdown does', () => {
    expect(missing(`${FENCE}\nnever closed\n\n## Transcript\n\ntext\n`)).toBe('Transcript');
  });

  it('does not let a shorter fence close a longer one', () => {
    expect(missing(`${FENCE}${'`'}\n${FENCE}\n## Transcript\n\ntext\n${FENCE}${'`'}\n`)).toBe('Transcript');
  });

  it('lets a longer fence close a shorter one', () => {
    expect(missing(`${FENCE}\ncode\n${FENCE}${'`'}\n\n## Transcript\n\ntext\n`)).toBeUndefined();
  });

  it('does not let a tilde fence be closed by backticks', () => {
    expect(missing(`~~~\n${FENCE}\n## Transcript\n\ntext\n`)).toBe('Transcript');
  });

  it('does not take a line of inline code with backticks in its info string for a fence', () => {
    expect(missing('```not a fence```\n\n## Transcript\n\ntext\n')).toBeUndefined();
  });
});

describe('missingRequiredSection: when nothing is owed', () => {
  it('owes nothing for a source type the store declared nothing for', () => {
    expect(missing('# No section at all\n', 'ctx-b')).toBeUndefined();
  });

  it('owes nothing when the capture names no source type', () => {
    expect(missing('# No section at all\n', undefined)).toBeUndefined();
  });

  it('owes nothing when the store declares no sections at all', () => {
    const none = { ingest: {} } as unknown as Config;
    expect(missingRequiredSection(none, 'ctx-a', '# nothing\n')).toBeUndefined();
  });
});
