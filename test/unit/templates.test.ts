import { describe, expect, it } from 'vitest';
import { packagedTemplate, substituteBlock } from '../../src/core/templates.js';

describe('substituteBlock', () => {
  const text = 'before\n\n__BLOCK__\n\nafter';

  it('removes the placeholder line entirely when the list is empty', () => {
    // A plain `.replace(token, '')` would leave a blank line here, which is
    // exactly the byte-identity break this helper exists to prevent.
    expect(substituteBlock(text, '__BLOCK__', [])).toBe('before\n\n\nafter');
  });

  it('substitutes a single line in place', () => {
    expect(substituteBlock(text, '__BLOCK__', ['- one'])).toBe('before\n\n- one\n\nafter');
  });

  it('splices multiple lines in place', () => {
    expect(substituteBlock(text, '__BLOCK__', ['- one', '- two'])).toBe('before\n\n- one\n- two\n\nafter');
  });

  it('fills every occurrence when the token appears more than once', () => {
    expect(substituteBlock('__BLOCK__\nmiddle\n__BLOCK__', '__BLOCK__', ['x'])).toBe('x\nmiddle\nx');
  });

  it('removes a placeholder that is the final line, leaving no trailing blank', () => {
    expect(substituteBlock('a\nb\n__BLOCK__', '__BLOCK__', [])).toBe('a\nb');
  });

  it('ignores a token that is not alone on its line, and throws for it', () => {
    expect(() => substituteBlock('prefix __BLOCK__ suffix', '__BLOCK__', ['x'])).toThrow(/not found on a line of its own/);
  });

  it('throws when the placeholder is absent, so a typo fails at render time', () => {
    expect(() => substituteBlock('no placeholder here', '__MISSING__', ['x'])).toThrow(/__MISSING__/);
  });
});

describe('packagedTemplate', () => {
  it('reads a shipped template and strips exactly one trailing newline', () => {
    const text = packagedTemplate('skills', 'ctxr-rollup');
    expect(text.length).toBeGreaterThan(0);
    expect(text.endsWith('\n')).toBe(false);
  });

  it('returns the identical cached string on a second read', () => {
    expect(packagedTemplate('skills', 'ctxr-rollup')).toBe(packagedTemplate('skills', 'ctxr-rollup'));
  });
});
