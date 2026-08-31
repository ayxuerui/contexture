import { describe, expect, it } from 'vitest';
import { githubForgeAdapter, mapMergeability, mapPullRequestState } from '../../src/adapters/forge/github.js';

describe('mapPullRequestState (session-submit-and-land D5)', () => {
  it("maps GitHub's OPEN/MERGED/CLOSED to the adapter's lowercase union", () => {
    expect(mapPullRequestState('OPEN')).toBe('open');
    expect(mapPullRequestState('MERGED')).toBe('merged');
    expect(mapPullRequestState('CLOSED')).toBe('closed');
  });

  it('throws on an unrecognized value rather than silently defaulting', () => {
    expect(() => mapPullRequestState('DRAFT')).toThrow(/unrecognized/);
  });
});

describe('mapMergeability (session-submit-and-land D5)', () => {
  it("maps GitHub's MERGEABLE/CONFLICTING/UNKNOWN to the adapter's lowercase union", () => {
    expect(mapMergeability('MERGEABLE')).toBe('mergeable');
    expect(mapMergeability('CONFLICTING')).toBe('conflicting');
    expect(mapMergeability('UNKNOWN')).toBe('unknown');
  });

  it('throws on an unrecognized value rather than silently defaulting', () => {
    expect(() => mapMergeability('BEHIND')).toThrow(/unrecognized/);
  });
});

describe('githubForgeAdapter (session-submit-and-land D5)', () => {
  it('declares interface version 2 and both new operations', () => {
    expect(githubForgeAdapter.interfaceVersion).toBe(2);
    expect(typeof githubForgeAdapter.pullRequest).toBe('function');
    expect(typeof githubForgeAdapter.mergePullRequest).toBe('function');
  });
});
