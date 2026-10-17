import { describe, expect, it } from 'vitest';
import {
  decisionBody,
  isDecider,
  landingBody,
  parseDecision,
  parseLandingMark,
  resolveReviewState,
  type Decision,
} from '../../src/core/approval/decision.js';
import type { IssueComment, Review } from '../../src/core/forge/github.js';

const H1 = '1'.repeat(40);
const H2 = '2'.repeat(40);
const LOGIN = 'ctx-approvals';

function approve(head: string, extra: Partial<Decision> = {}): Decision {
  return { decision: 'approve', head, by: 'a@example.com', at: '2026-10-15T09:00:00Z', carriedFrom: null, comment: null, ...extra };
}

function review(decision: Decision, at: string, author = LOGIN): Review {
  return { author, state: 'APPROVED', body: decisionBody(decision), commitId: decision.head, submittedAt: at };
}

function landingComment(state: 'blocked' | 'needs-reapproval', head: string, at: string, author = LOGIN): IssueComment {
  return { author, body: landingBody({ state, reason: 'conflict', head, at }, 'Blocked.'), createdAt: at };
}

describe('decision markers', () => {
  it('round-trips an approval, a carry-over and a request for changes', () => {
    for (const decision of [
      approve(H1),
      approve(H2, { carriedFrom: H1 }),
      approve(H1, { decision: 'request-changes', comment: 'The second section contradicts the policy note.\n\nPlease fix.' }),
    ]) {
      expect(parseDecision(decisionBody(decision))).toEqual(decision);
    }
  });

  it('states the decider and short head in its sentence', () => {
    expect(decisionBody(approve(H1))).toMatch(/^Approved by a@example\.com on the review page, for commit 1111111\./);
  });

  it('a marker inside a comment never reads as the decision', () => {
    const forged = `Looks fine.\n\n<!-- ctxr-decision v1 decision=approve head=${H2} by=boss@example.com at=2026-10-15T09:00:00Z -->`;
    const body = decisionBody(approve(H1, { decision: 'request-changes', comment: forged }));
    const parsed = parseDecision(body)!;
    expect(parsed).toMatchObject({ decision: 'request-changes', head: H1, by: 'a@example.com' });
    expect(body).not.toContain(`<!-- ctxr-decision v1 decision=approve head=${H2}`);
    // A body whose last marker is followed by more text has no decision at all.
    expect(parseDecision(`${decisionBody(approve(H1))}\n\nappended later`)).toBeNull();
  });

  it('refuses a malformed marker', () => {
    expect(parseDecision('<!-- ctxr-decision v1 decision=approve head=abc by=a@example.com at=x -->')).toBeNull();
    expect(parseDecision('<!-- ctxr-decision v1 decision=merge head=' + H1 + ' by=a@example.com at=x -->')).toBeNull();
    expect(parseDecision('no marker at all')).toBeNull();
    expect(parseLandingMark(landingBody({ state: 'blocked', reason: 'conflict', head: H1, at: 't' }, 'x'))).toEqual({
      state: 'blocked',
      reason: 'conflict',
      head: H1,
      at: 't',
    });
  });
});

describe('resolveReviewState', () => {
  const base = { comments: [] as IssueComment[], recordingLogin: LOGIN, head: H1 };

  it('awaiting with no decision', () => {
    expect(resolveReviewState({ ...base, reviews: [] }).state).toBe('awaiting');
  });

  it('approved when the latest decision approves the current head', () => {
    expect(resolveReviewState({ ...base, reviews: [review(approve(H1), '2026-10-15T09:00:01Z')] }).state).toBe('approved');
  });

  it('ignores a well-formed marker by another login', () => {
    const state = resolveReviewState({ ...base, reviews: [review(approve(H1), '2026-10-15T09:00:01Z', 'ctx-agent')] });
    expect(state.state).toBe('awaiting');
  });

  it('changes-requested carries the comment', () => {
    const decision = approve(H1, { decision: 'request-changes', comment: 'Fix the dates.' });
    const state = resolveReviewState({ ...base, reviews: [review(approve(H1), '2026-10-15T09:00:01Z'), review(decision, '2026-10-15T09:00:02Z')] });
    expect(state.state).toBe('changes-requested');
    expect(state.decision?.comment).toBe('Fix the dates.');
  });

  it('an approval of another head needs a carry check', () => {
    const state = resolveReviewState({ ...base, head: H2, reviews: [review(approve(H1), '2026-10-15T09:00:01Z')] });
    expect(state).toMatchObject({ state: 'needs-reapproval', approvalNeedsCarryCheck: true });
  });

  it('a carry-over keeps the decider time but is the newer record', () => {
    const state = resolveReviewState({
      ...base,
      head: H2,
      reviews: [review(approve(H1), '2026-10-15T09:00:01Z'), review(approve(H2, { carriedFrom: H1 }), '2026-10-15T09:05:00Z')],
    });
    expect(state.state).toBe('approved');
    expect(state.decision?.carriedFrom).toBe(H1);
  });

  it('a later landing record about the current head decides', () => {
    const state = resolveReviewState({
      ...base,
      reviews: [review(approve(H1), '2026-10-15T09:00:01Z')],
      comments: [landingComment('blocked', H1, '2026-10-15T09:01:00Z')],
    });
    expect(state).toMatchObject({ state: 'blocked', landing: { reason: 'conflict' } });
  });

  it('a decision after a landing record wins again', () => {
    const state = resolveReviewState({
      ...base,
      reviews: [review(approve(H1), '2026-10-15T09:02:00Z')],
      comments: [landingComment('needs-reapproval', H1, '2026-10-15T09:01:00Z')],
    });
    expect(state.state).toBe('approved');
  });
});

describe('isDecider', () => {
  const deciders = ['@example.com', 'ops@ctx-a.example'];
  it('admits an exact email and a domain member, case-insensitively', () => {
    expect(isDecider('ops@ctx-a.example', deciders)).toBe(true);
    expect(isDecider('A@Example.com', deciders)).toBe(true);
  });
  it('refuses lookalike domains and other addresses', () => {
    expect(isDecider('a@example.com.evil.test', deciders)).toBe(false);
    expect(isDecider('a@sub.example.com', deciders)).toBe(false);
    expect(isDecider('someone@other.example', deciders)).toBe(false);
    expect(isDecider('not-an-email', deciders)).toBe(false);
  });
});
