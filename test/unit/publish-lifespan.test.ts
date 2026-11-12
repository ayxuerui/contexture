import { describe, expect, it } from 'vitest';
import { DISPOSABLE_REVIEW_DAYS, DISPOSABLE_SEGMENT, daysBetween, lifespanOf, parseLeadingDate } from '../../src/core/publish/lifespan.js';

/** two-kinds-of-published-page: a page's lifespan is read from where it is filed, and from nothing else. */
describe('lifespanOf', () => {
  const cases: Array<[string, string, ReturnType<typeof lifespanOf>]> = [
    ['segment first', 'publish/disposable/2026-10-13-agent-week/index.html', 'disposable'],
    ['segment first, nested deeper', 'publish/disposable/folder-a/2026-10-13-agent-week/index.html', 'disposable'],
    ['segment elsewhere in the path', 'publish/ctx-a/disposable/page/index.html', 'permanent'],
    ['a folder merely beginning with the word', 'publish/disposable-notes/page/index.html', 'permanent'],
    ['an ordinary page', 'publish/ctx-a/work/example-page/index.html', 'permanent'],
    ['outside the publish path', 'notes/disposable/page/index.html', null],
    ['the publish path itself', 'publish', null],
  ];
  for (const [label, file, expected] of cases) {
    it(`${label} → ${String(expected)}`, () => {
      expect(lifespanOf(file, 'publish/')).toBe(expected);
    });
  }

  it('reads the default dot-folder publish path the same way', () => {
    expect(lifespanOf('.contexture/publish/disposable/2026-10-13-x/index.html', '.contexture/publish/')).toBe('disposable');
  });

  it('fixes the segment and the window as code constants', () => {
    expect(DISPOSABLE_SEGMENT).toBe('disposable');
    expect(DISPOSABLE_REVIEW_DAYS).toBe(30);
  });
});

describe('parseLeadingDate', () => {
  it('reads a valid leading date', () => {
    expect(parseLeadingDate('2026-10-13-agent-week')).toBe('2026-10-13');
  });

  it('rejects an invalid month or day', () => {
    expect(parseLeadingDate('2026-13-45-agent-week')).toBeNull();
    expect(parseLeadingDate('2026-02-30-agent-week')).toBeNull();
  });

  it('rejects a name with no date, or a date with no name after it', () => {
    expect(parseLeadingDate('agent-week')).toBeNull();
    expect(parseLeadingDate('2026-10-13')).toBeNull();
    expect(parseLeadingDate('2026-10-agent-week')).toBeNull();
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-29', '2026-10-13')).toBe(45);
    expect(daysBetween('2026-10-03', '2026-10-13')).toBe(10);
  });
});
