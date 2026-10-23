import { describe, expect, it } from 'vitest';
import { decisionBody, parseDecision, recordPartOf } from '../../src/core/approval/decision.js';
import {
  findSessionMarker,
  forgeSlugOf,
  joinedBranchName,
  joinedWorktreeName,
  parseSessionMarker,
  sessionIdentityFor,
  sessionMarker,
} from '../../src/core/approval/session-marker.js';

const HOME = { home: 'example/ctx-a', branch: 'session/20261023-070000-ctx-move' };
const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);

describe('session marker', () => {
  it('round-trips the session it names', () => {
    const body = `Why: move a note.\n\n${sessionMarker(HOME)}`;
    expect(parseSessionMarker(body)).toEqual(HOME);
    expect(findSessionMarker(body)).toBe(sessionMarker(HOME));
  });

  it('reads a missing or malformed marker as no session, so the pull request is a session of one', () => {
    expect(parseSessionMarker('Why: nothing.')).toBeNull();
    expect(parseSessionMarker('<!-- ctxr-session v1 home=ctx-a branch=session/x -->')).toBeNull();
    expect(parseSessionMarker('<!-- ctxr-session v1 home=example/ctx-a -->')).toBeNull();
    // Only a marker that ends the body counts.
    expect(parseSessionMarker(`${sessionMarker(HOME)}\n\nmore text`)).toBeNull();
    // Any marker at all is what submit refuses in an agent's body.
    expect(findSessionMarker('<!-- ctxr-session v1 home=ctx-a -->')).not.toBeNull();
  });

  it('derives a forge slug from github and other remote URLs', () => {
    expect(forgeSlugOf('git@github.com:example/ctx-a.git')).toBe('example/ctx-a');
    expect(forgeSlugOf('https://github.com/example/ctx-a')).toBe('example/ctx-a');
    expect(forgeSlugOf('/tmp/x/example/ctx-b.git')).toBe('example/ctx-b');
    expect(forgeSlugOf('ctx-a')).toBeNull();
  });
});

describe('session identity', () => {
  const prefix = 'session/';

  it('is the home slug and branch for a session in its home store, kept by the worktree name after a rename', () => {
    const name = 'session-20261023-070000-ctx-move';
    expect(sessionIdentityFor({ prefix, homePrefix: prefix, ownSlug: 'example/ctx-a', worktreeName: name, branch: HOME.branch })).toEqual(HOME);
    expect(sessionIdentityFor({ prefix, homePrefix: prefix, ownSlug: 'example/ctx-a', worktreeName: name, branch: 'notes/move' })).toEqual(HOME);
    expect(sessionIdentityFor({ prefix, homePrefix: prefix, ownSlug: null, worktreeName: name, branch: HOME.branch })).toBeNull();
  });

  it('names the home for a joined session, from its branch and from its worktree name', () => {
    const branch = joinedBranchName(prefix, HOME, prefix);
    expect(branch).toBe('session/example/ctx-a/20261023-070000-ctx-move');
    const name = joinedWorktreeName(prefix, HOME, prefix);
    expect(sessionIdentityFor({ prefix, homePrefix: prefix, ownSlug: 'example/ctx-b', worktreeName: name, branch })).toEqual(HOME);
    // After `ctxr session submit --branch` renames the branch, the worktree name still carries the home.
    expect(sessionIdentityFor({ prefix, homePrefix: prefix, ownSlug: 'example/ctx-b', worktreeName: name, branch: 'notes/move' })).toEqual(HOME);
  });
});

describe('session decision marker', () => {
  const session = { id: 'd-1', session: HOME, parts: [{ store: 'example/ctx-b', number: 5, head: H1 }, { store: 'example/ctx-a', number: 7, head: H2 }] };

  it('round-trips the decision id, the session and every part, and stays a decision older readers parse', () => {
    const body = decisionBody({ decision: 'approve', head: H2, by: 'a@example.com', at: '2026-10-23T07:00:00Z', carriedFrom: null, comment: null, session });
    const parsed = parseDecision(body);
    expect(parsed).toMatchObject({ decision: 'approve', head: H2, by: 'a@example.com', session });
    expect(recordPartOf(parsed!.session!)).toEqual(session.parts[1]);
    // An older reader's parse: the session fields are extra key=value tokens it does not ask for.
    expect(body).toMatch(/<!-- ctxr-decision v1 decision=approve head=2{40} by=a@example\.com at=\S+ id=d-1 session=example\/ctx-a:session\/20261023-070000-ctx-move parts=example\/ctx-b#5@1{40},example\/ctx-a#7@2{40} -->$/);
  });

  it('records on the first part in landing order when the home store has none', () => {
    expect(recordPartOf({ ...session, parts: [session.parts[0]!] })).toEqual(session.parts[0]);
  });

  it('refuses a decision whose session fields are malformed', () => {
    const body = decisionBody({ decision: 'approve', head: H2, by: 'a@example.com', at: 'now', carriedFrom: null, comment: null, session });
    expect(parseDecision(body.replace('parts=', 'parts=junk,'))).toBeNull();
  });
});
