import { describe, expect, it } from 'vitest';
import { canonicalizeBody, canonicalizeText, contentHash, contentHashOfBody } from '../../src/core/content/canonicalize.js';

describe('canonicalizeText', () => {
  it('normalizes CRLF and lone CR to LF', () => {
    expect(canonicalizeText('a\r\nb\rc\n')).toBe('a\nb\nc');
  });

  it('strips a leading BOM', () => {
    expect(canonicalizeText('﻿hello')).toBe('hello');
  });

  it('rstrips trailing whitespace on each line', () => {
    expect(canonicalizeText('a  \nb\t\n')).toBe('a\nb');
  });

  it('collapses trailing blank lines', () => {
    expect(canonicalizeText('a\nb\n\n\n\n')).toBe('a\nb');
  });

  it('is idempotent', () => {
    const once = canonicalizeText('a\r\n \nb  \n\n\n');
    expect(canonicalizeText(once)).toBe(once);
  });
});

describe('canonicalizeBody', () => {
  it('strips frontmatter before canonicalizing', () => {
    expect(canonicalizeBody('---\ntitle: X\n---\n# Body  \n\n\n')).toBe('# Body');
  });

  it('canonicalizes a note with no frontmatter as-is', () => {
    expect(canonicalizeBody('# Body  \n')).toBe('# Body');
  });
});

describe('contentHash / contentHashOfBody', () => {
  it('is a 16-character lowercase hex string', () => {
    const hash = contentHash('# Hi\n');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is stable across trivially different but canonically-equal input', () => {
    const a = contentHash('# Hi\r\n\r\n\r\n');
    const b = contentHash('# Hi\n');
    expect(a).toBe(b);
  });

  it('changes when the meaningful content changes', () => {
    expect(contentHash('# Hi\n')).not.toBe(contentHash('# Bye\n'));
  });

  it('ignores frontmatter changes (hash is of the body only)', () => {
    const a = contentHash('---\ntitle: A\n---\n# Body\n');
    const b = contentHash('---\ntitle: B\n---\n# Body\n');
    expect(a).toBe(b);
  });

  it('contentHashOfBody matches contentHash for an already-stripped body', () => {
    const raw = '---\ntitle: A\n---\n# Body\n';
    expect(contentHashOfBody('# Body\n')).toBe(contentHash(raw));
  });
});
