import { describe, expect, it } from 'vitest';
import { compareRelease, parseVersion } from '../../src/core/version-check.js';

/** cli-contract: an explicit release check reports its answer through the exit code. */
describe('cli-contract: the release comparison', () => {
  it('reports current when the installed version equals the published one', () => {
    expect(compareRelease('0.8.0', '0.8.0')).toEqual({ kind: 'current' });
  });

  it('reports a newer release when the published version is ahead', () => {
    expect(compareRelease('0.8.0', '0.9.1')).toEqual({
      kind: 'newer-available',
      installed: '0.8.0',
      latest: '0.9.1',
    });
  });

  it('reports current when the installed version is ahead of the registry', () => {
    // A maintainer on an unreleased build is not stale, and must not be nagged.
    expect(compareRelease('0.9.0', '0.8.0')).toEqual({ kind: 'current' });
  });

  it('compares components numerically, not as strings', () => {
    // The case plain string comparison gets wrong: '0.10.0' < '0.9.0' lexically.
    expect(compareRelease('0.9.0', '0.10.0').kind).toBe('newer-available');
    expect(compareRelease('0.10.0', '0.9.0').kind).toBe('current');
    expect(compareRelease('1.2.9', '1.2.10').kind).toBe('newer-available');
    expect(compareRelease('2.0.0', '10.0.0').kind).toBe('newer-available');
  });

  it.each([
    ['v0.8.0', '0.9.0', 'installed'],
    ['0.8.0', 'v0.9.0', 'published'],
    ['0.8', '0.9.0', 'installed'],
    ['0.8.0-rc.1', '0.9.0', 'installed'],
    ['0.8.0', '0.9.0+build.7', 'published'],
    ['0.8.0 ', '0.9.0', 'installed'],
    ['', '0.9.0', 'installed'],
    ['0.8.0', 'latest', 'published'],
  ])('treats %o vs %o as undetermined, naming the %s version', (installed, latest, which) => {
    const result = compareRelease(installed, latest);
    expect(result.kind).toBe('undetermined');
    if (result.kind !== 'undetermined') throw new Error('unreachable');
    expect(result.reason).toContain(which === 'installed' ? 'installed' : 'published');
  });

  it('never reports an unparseable version as current', () => {
    // The failure that would matter most: silently deciding a version we cannot
    // read is up to date, and never telling anyone.
    expect(compareRelease('not-a-version', '0.9.0').kind).not.toBe('current');
    expect(compareRelease('0.8.0', 'not-a-version').kind).not.toBe('current');
  });

  it('parses only the plain three-part shape', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('0.0.0')).toEqual([0, 0, 0]);
    expect(parseVersion('1.2.3.4')).toBeUndefined();
    expect(parseVersion('1.2')).toBeUndefined();
    expect(parseVersion('a.b.c')).toBeUndefined();
  });
});
