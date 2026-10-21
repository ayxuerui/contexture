import type { IssueComment, Review } from '../forge/github.js';

/**
 * change-approval spec (design.md D3): a decision lives on the forge, as a
 * review by the recording login whose body carries a sentence for people and
 * a marker for this module. The landing path's own records (a block, a
 * resolved conflict awaiting a new decision) are comments by the same login
 * with a marker of their own. Nothing else — no local file — holds either.
 *
 * Marker values never contain spaces (commit ids, emails, ISO times, slugs),
 * so a marker is `key=value` tokens separated by single spaces.
 */
export const DECISION_MARKER = 'ctxr-decision';
export const LANDING_MARKER = 'ctxr-land';
const MARKER_VERSION = 'v1';

export type DecisionKind = 'approve' | 'request-changes';

export interface Decision {
  decision: DecisionKind;
  head: string;
  by: string;
  at: string;
  /** Set on a carry-over (design.md D5): the head the person approved, which this head carries over from. */
  carriedFrom: string | null;
  /** The comment of a request for changes; null for an approval. */
  comment: string | null;
}

export type LandingRecordState = 'blocked' | 'needs-reapproval';

export interface LandingMark {
  state: LandingRecordState;
  reason: string;
  head: string;
  at: string;
}

function marker(name: string, fields: Record<string, string>): string {
  const tokens = Object.entries(fields).map(([key, value]) => `${key}=${value}`);
  return `<!-- ${name} ${MARKER_VERSION} ${tokens.join(' ')} -->`;
}

/**
 * Only a marker that ends the body counts. The body is built with the marker
 * last, and a comment above it is the decider's own text — which must never be
 * able to carry a marker that reads as a different decision, head or decider.
 */
function parseMarker(name: string, body: string): Record<string, string> | null {
  const pattern = new RegExp(`<!-- ${name} ${MARKER_VERSION} ([^>]*?) -->\\s*$`);
  const found = pattern.exec(body);
  if (found === null) return null;
  const fields: Record<string, string> = {};
  for (const token of found[1]!.split(' ')) {
    const eq = token.indexOf('=');
    if (eq <= 0) return null;
    fields[token.slice(0, eq)] = token.slice(eq + 1);
  }
  return fields;
}

const SHA = /^[0-9a-f]{40}$/;
const NO_SPACE = /^\S+$/;

function neutralizeComment(comment: string): string {
  return comment.replace(/<!--/g, '<! --').replace(/-->/g, '-- >');
}

/** The review body for a decision: one sentence, the comment when there is one, then the marker. */
export function decisionBody(decision: Decision): string {
  const short = decision.head.slice(0, 7);
  const sentence =
    decision.carriedFrom !== null
      ? `Carried over from ${decision.carriedFrom.slice(0, 7)} to ${short} by a clean rebase (patches unchanged). Approved by ${decision.by}.`
      : decision.decision === 'approve'
        ? `Approved by ${decision.by} on the review page, for commit ${short}.`
        : `Changes requested by ${decision.by} on the review page, for commit ${short}.`;
  const fields: Record<string, string> = { decision: decision.decision, head: decision.head, by: decision.by, at: decision.at };
  if (decision.carriedFrom !== null) fields['carried-from'] = decision.carriedFrom;
  const parts = [sentence];
  // A comment cannot open an HTML comment of its own, so it can neither hide text on the forge nor imitate a marker.
  if (decision.comment !== null) parts.push(neutralizeComment(decision.comment.trim()));
  parts.push(marker(DECISION_MARKER, fields));
  return parts.join('\n\n');
}

export function parseDecision(body: string): Decision | null {
  const fields = parseMarker(DECISION_MARKER, body);
  if (fields === null) return null;
  const { decision, head, by, at } = fields;
  if (decision !== 'approve' && decision !== 'request-changes') return null;
  if (head === undefined || !SHA.test(head)) return null;
  if (by === undefined || !NO_SPACE.test(by) || at === undefined || !NO_SPACE.test(at)) return null;
  const carriedFrom = fields['carried-from'] ?? null;
  if (carriedFrom !== null && !SHA.test(carriedFrom)) return null;
  let comment: string | null = null;
  if (decision === 'request-changes') {
    const paragraphs = body.slice(0, body.lastIndexOf(`<!-- ${DECISION_MARKER}`)).split('\n\n');
    comment = paragraphs.slice(1).join('\n\n').trim();
  }
  return { decision, head, by, at, carriedFrom, comment };
}

/** The comment body for a landing record: a sentence for people, then the marker. */
export function landingBody(mark: LandingMark, sentence: string): string {
  return `${sentence}\n\n${marker(LANDING_MARKER, { state: mark.state, reason: mark.reason, head: mark.head, at: mark.at })}`;
}

export function parseLandingMark(body: string): LandingMark | null {
  const fields = parseMarker(LANDING_MARKER, body);
  if (fields === null) return null;
  const { state, reason, head, at } = fields;
  if (state !== 'blocked' && state !== 'needs-reapproval') return null;
  if (reason === undefined || head === undefined || !SHA.test(head) || at === undefined) return null;
  return { state, reason, head, at };
}

export type ReviewStateName = 'awaiting' | 'approved' | 'changes-requested' | 'needs-reapproval' | 'blocked';

export interface ReviewState {
  state: ReviewStateName;
  /** The latest decision by the recording login, if any. */
  decision: Decision | null;
  /** The latest landing record by the recording login, when it is what decides the state. */
  landing: LandingMark | null;
  /**
   * True when the latest decision approves a head other than the current one and no landing record
   * overrides it: the caller decides, by patch identity, whether the current head carries it over.
   */
  approvalNeedsCarryCheck: boolean;
}

function timeOf(value: string | null): number {
  const t = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * change-approval spec ("Only reviews by the recording identity count"): the
 * latest well-formed decision by `recordingLogin` decides, and the latest
 * landing record by the same login overrides it when it was posted later and
 * is about the current head. Anything by any other login is not read at all.
 *
 * "Latest" is the forge's own posting time (stable-sorted, so the forge's order
 * breaks ties), never the marker's `at`: a carry-over keeps the time the person
 * decided (design.md D5) while being the newer record.
 *
 * An approval of a different head is reported as `needs-reapproval` with
 * `approvalNeedsCarryCheck` set; whether a clean rebase carries it over is a
 * git question this module does not ask (write-lifecycle spec).
 */
export function resolveReviewState(input: {
  reviews: readonly Review[];
  comments: readonly IssueComment[];
  recordingLogin: string;
  head: string;
}): ReviewState {
  let decision: Decision | null = null;
  let decisionTime = -1;
  for (const review of input.reviews) {
    if (review.author !== input.recordingLogin) continue;
    const parsed = parseDecision(review.body);
    if (parsed === null) continue;
    const t = timeOf(review.submittedAt);
    if (t >= decisionTime) {
      decision = parsed;
      decisionTime = t;
    }
  }
  let landing: LandingMark | null = null;
  let landingTime = -1;
  for (const comment of input.comments) {
    if (comment.author !== input.recordingLogin) continue;
    const parsed = parseLandingMark(comment.body);
    if (parsed === null) continue;
    const t = timeOf(comment.createdAt);
    if (t >= landingTime) {
      landing = parsed;
      landingTime = t;
    }
  }

  if (landing !== null && landing.head === input.head && landingTime >= decisionTime) {
    return { state: landing.state, decision, landing, approvalNeedsCarryCheck: false };
  }
  if (decision === null) return { state: 'awaiting', decision, landing: null, approvalNeedsCarryCheck: false };
  if (decision.decision === 'request-changes') return { state: 'changes-requested', decision, landing: null, approvalNeedsCarryCheck: false };
  if (decision.head === input.head) return { state: 'approved', decision, landing: null, approvalNeedsCarryCheck: false };
  return { state: 'needs-reapproval', decision, landing: null, approvalNeedsCarryCheck: true };
}

/** change-approval spec: an exact email, or an `@domain` entry matching that domain exactly. */
export function isDecider(email: string, deciders: readonly string[]): boolean {
  const normalized = email.toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return false;
  const domain = normalized.slice(at);
  return deciders.some((entry) => {
    const e = entry.toLowerCase();
    return e.startsWith('@') ? domain === e : normalized === e;
  });
}
