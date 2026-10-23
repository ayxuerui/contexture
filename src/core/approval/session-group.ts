import { parse as parseYaml } from 'yaml';
import type { StoreConfig } from '../../config/schema.js';
import { storePrefix } from '../graph/tree.js';
import { CONFIG_FILE_NAME } from '../root.js';
import type { ForgeCredentials } from '../forge/credentials.js';
import { ContextureError } from '../errors.js';
import { ForgeRequestError, type ForgeClient, type IssueComment, type PullRequest, type Review } from '../forge/github.js';
import type { GitRunner } from '../git/exec.js';
import { declaresSharedStores, resolveMounts } from '../shared-stores.js';
import { parseDecision, parseLandingMark, partKey, recordPartOf, type Decision, type LandingMark, type PartRef, type ReviewStateName, type SessionDecision } from './decision.js';
import { parseSessionMarker, repositorySlug, sessionKey, sessionsEqual, type SessionIdentity } from './session-marker.js';
import { baseRef, carriesOver } from './sessions.js';

/**
 * approve-sessions-across-stores: a session's pull requests across the home
 * store and the stores it mounts, and the state of its one decision.
 *
 * Only pull requests carrying a well-formed session marker are grouped here.
 * A pull request without one is a session of its own and keeps today's path
 * (`sessions.ts`), so a store whose pull requests carry no marker behaves
 * exactly as before.
 */

/** One store a session can reach: the home store, or a present mount. */
export interface SessionStore {
  /** The forge repository slug, `owner/repo`. */
  slug: string;
  /** null for the home store; the mount's name otherwise. */
  mountName: string | null;
  /** The clone's top level: the canonical clone for the home store, `shared/<name>` for a mount. */
  root: string;
  config: StoreConfig;
  forge: ForgeClient;
  /** The credential behind `forge`, for fetches and pushes against the store's remote; null keeps the transport's own. */
  credentials: ForgeCredentials | null;
}

export interface StoreReach {
  home: SessionStore;
  /** Present mounts with a forge slug, in declared order. */
  mounts: SessionStore[];
  /** Declared mounts this run cannot read: absent, not a store, or without an `origin`. */
  unavailable: { name: string; reason: string }[];
}

export type ForgeFor = (root: string, mount: boolean) => Promise<{ forge: ForgeClient; credentials: ForgeCredentials | null }>;

/** The home store and every present mount, each with its own forge client. */
export async function storeReach(git: GitRunner, home: { root: string; canonical: string; config: StoreConfig; forge: ForgeClient; credentials?: ForgeCredentials | null }, forgeFor: ForgeFor): Promise<StoreReach | null> {
  const homeSlug = await repositorySlug(git, home.canonical);
  if (homeSlug === null) return null;
  const mounts: SessionStore[] = [];
  const unavailable: { name: string; reason: string }[] = [];
  for (const mount of await resolveMounts(home.root, home.config)) {
    if (mount.state !== 'present') {
      unavailable.push({ name: mount.name, reason: mount.state === 'absent' ? 'not cloned' : mount.reason });
      continue;
    }
    const slug = await repositorySlug(git, mount.root);
    if (slug === null) {
      unavailable.push({ name: mount.name, reason: 'its clone has no "origin" remote' });
      continue;
    }
    mounts.push({ slug, mountName: mount.name, root: mount.root, config: mount.config, ...(await forgeFor(mount.root, true)) });
  }
  return { home: { slug: homeSlug, mountName: null, root: home.canonical, config: home.config, forge: home.forge, credentials: home.credentials ?? null }, mounts, unavailable };
}

export function allStores(reach: StoreReach): SessionStore[] {
  return [...reach.mounts, reach.home];
}

/** A store's open pull requests, or why they could not be read. */
export interface StoreListing {
  store: SessionStore;
  pulls: PullRequest[] | null;
  error: string | null;
}

export async function listOpen(reach: StoreReach, homePulls?: () => Promise<PullRequest[]>): Promise<StoreListing[]> {
  return Promise.all(
    allStores(reach).map(async (store): Promise<StoreListing> => {
      try {
        const pulls = store === reach.home && homePulls !== undefined ? await homePulls() : await store.forge.openPulls();
        return { store, pulls, error: null };
      } catch (err) {
        // A mount the credential cannot reach (an App not installed there) is unreadable, like an unreachable forge.
        if (!(err instanceof ForgeRequestError) && !(store !== reach.home && err instanceof ContextureError)) throw err;
        return { store, pulls: null, error: err.message };
      }
    }),
  );
}

export interface OpenPart {
  store: SessionStore;
  pull: PullRequest;
}

export interface SessionGroup {
  identity: SessionIdentity;
  /** Whether this store is the session's home: only then is it decided and landed here. */
  homedHere: boolean;
  /** Its open pull requests, in landing order: mounted stores first (in declared order), the home store last. */
  parts: OpenPart[];
  /** Stores whose pull requests could not be read: the session may have parts there, so it is not decided. */
  unreadable: string[];
}

/** Landing order: parts in mounted stores first, in declared order, then the home store's part. */
export function landingOrder<T extends { store: string }>(parts: readonly T[], reach: StoreReach, homeSlug: string): T[] {
  const rank = (slug: string): number => {
    if (slug === homeSlug) return Number.MAX_SAFE_INTEGER;
    const i = reach.mounts.findIndex((m) => m.slug === slug);
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };
  return [...parts].sort((x, y) => rank(x.store) - rank(y.store));
}

/**
 * Whether a pull request is read as a part of a session rather than on its own:
 * it carries a session marker, and the session is homed in another store or
 * the reading store declares mounts. A store with no `shared_stores` keeps
 * today's path for its own sessions (design.md D9: nothing changes for a store
 * that has not declared mounts); a pull request homed elsewhere is always its
 * home's, so a mounted store never lands it.
 */
export function readAsSessionPart(pull: PullRequest, homeSlug: string | null, config: StoreConfig): boolean {
  const identity = parseSessionMarker(pull.body);
  if (identity === null) return false;
  return identity.home !== homeSlug || declaresSharedStores(config);
}

/**
 * write-lifecycle spec ("Every pull request of a session carries the session"):
 * every open pull request read as a session part, grouped by the session it
 * names. A session homed elsewhere is grouped too, so a page can show it apart.
 * `all` also groups this store's own sessions when it declares no mounts — for
 * `ctxr land --session`, which names one explicitly.
 */
export function groupSessions(reach: StoreReach, listings: readonly StoreListing[], all = false): SessionGroup[] {
  const groups = new Map<string, SessionGroup>();
  const unreadable = listings.filter((l) => l.pulls === null).map((l) => l.store.slug);
  for (const listing of listings) {
    for (const pull of listing.pulls ?? []) {
      const identity = parseSessionMarker(pull.body);
      if (identity === null) continue;
      if (!all && !readAsSessionPart(pull, reach.home.slug, reach.home.config)) continue;
      const key = sessionKey(identity);
      let group = groups.get(key);
      if (group === undefined) {
        group = { identity, homedHere: identity.home === reach.home.slug, parts: [], unreadable };
        groups.set(key, group);
      }
      group.parts.push({ store: listing.store, pull });
    }
  }
  for (const group of groups.values()) {
    const ordered = landingOrder(group.parts.map((p) => ({ ...p, store: p.store.slug, part: p })), reach, group.identity.home);
    group.parts = ordered.map((o) => o.part);
  }
  return [...groups.values()];
}

/** Whether a pull request's body names a session homed in another store than `homeSlug`. */
export function homedElsewhere(pull: PullRequest, homeSlug: string): boolean {
  const identity = parseSessionMarker(pull.body);
  return identity !== null && identity.home !== homeSlug;
}

export type SessionStateName = ReviewStateName | 'retrying';

export interface PartState {
  ref: PartRef | null;
  store: SessionStore | null;
  storeSlug: string;
  number: number;
  /** The pull request as the forge has it now; null when its store cannot be read. */
  pull: PullRequest | null;
  /** Whether the decision names this part. */
  named: boolean;
  /** What this part contributes: ok, merged, closed, moved (head no longer the one approved), unnamed, unknown, or a landing record. */
  status: 'ok' | 'merged' | 'closed' | 'moved' | 'unnamed' | 'unknown' | 'landing-blocked' | 'landing-needs-reapproval' | 'pending';
  /** Whether this part carries a review of the decision (the record, or a copy) by the recording login. */
  hasCopy: boolean;
  landing: LandingMark | null;
}

export interface SessionState {
  identity: SessionIdentity;
  state: SessionStateName;
  /** The record's decision, as on the record part. */
  decision: Decision | null;
  session: SessionDecision | null;
  /** Every part: the named ones in the decision's order, then any open part it does not name. */
  parts: PartState[];
  /** The part and the reason behind `blocked`, `needs-reapproval` or `retrying`. */
  reason: string | null;
  reasonPart: string | null;
}

interface PartReads {
  reviews: Review[];
  comments: IssueComment[];
}

function timeOf(value: string | null): number {
  const t = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

interface Found {
  decision: Decision;
  session: SessionDecision;
  time: number;
}

/** The latest session decision for `identity` among a part's reviews by the recording login. */
function latestSessionDecision(reviews: readonly Review[], recordingLogin: string, identity: SessionIdentity, id?: string): Found | null {
  let found: Found | null = null;
  for (const review of reviews) {
    if (review.author !== recordingLogin) continue;
    const decision = parseDecision(review.body);
    const session = decision?.session ?? null;
    if (decision === null || session === null || !sessionsEqual(session.session, identity)) continue;
    if (id !== undefined && session.id !== id) continue;
    const time = timeOf(review.submittedAt);
    if (found === null || time >= found.time) found = { decision, session, time };
  }
  return found;
}

export interface StateInput {
  git: GitRunner;
  reach: StoreReach;
  identity: SessionIdentity;
  /**
   * Whether the session is homed in the reading store. A session homed elsewhere may name parts on stores out of
   * this store's reach; those are left out of its state, and its decision is read from a copy when the record is
   * out of reach. A session homed here never ignores a part: every store it can name is in reach.
   */
  homedHere: boolean;
  /** The session's open parts, as grouped from the forge. */
  open: readonly OpenPart[];
  recordingLogin: string;
}

/**
 * change-approval spec ("A session is decided only on its home store's page,
 * for every part it names"): the session's decision is the latest one on its
 * record part alone, and it counts only while every part it names keeps the
 * head it gives (or one carried over from it) and no open part carrying the
 * marker is missing from it. A named part closed without merging blocks the
 * session; a named part already merged counts as landed, and a session with
 * some named parts landed and others still open is `retrying` — its landing
 * was left unfinished and the next run goes on with it.
 */
export async function sessionState(input: StateInput): Promise<SessionState> {
  const { git, reach, identity, recordingLogin } = input;
  const stores = allStores(reach);
  const storeOf = (slug: string): SessionStore | null => stores.find((s) => s.slug === slug) ?? null;
  const reads = new Map<string, Promise<PartReads>>();
  const readPart = (store: SessionStore, number: number): Promise<PartReads> => {
    const key = partKey({ store: store.slug, number });
    let read = reads.get(key);
    if (read === undefined) {
      read = Promise.all([store.forge.reviews(number), store.forge.comments(number)]).then(([reviews, comments]) => ({ reviews, comments }));
      reads.set(key, read);
    }
    return read;
  };

  // The latest session decision on any open part points at the record part; the record alone decides.
  const openReads = await Promise.all(input.open.map(async (p) => ({ part: p, reads: await readPart(p.store, p.pull.number) })));
  let candidate: Found | null = null;
  for (const { reads: r } of openReads) {
    const found = latestSessionDecision(r.reviews, recordingLogin, identity);
    if (found !== null && (candidate === null || found.time >= candidate.time)) candidate = found;
  }
  let record: Found | null = null;
  if (candidate !== null) {
    const recordRef = recordPartOf(candidate.session);
    const recordStore = storeOf(recordRef.store);
    if (recordStore === null && !input.homedHere) record = candidate;
    if (recordStore !== null) {
      try {
        record = latestSessionDecision((await readPart(recordStore, recordRef.number)).reviews, recordingLogin, identity);
      } catch (err) {
        if (!(err instanceof ForgeRequestError)) throw err;
        record = null;
      }
    }
  }

  const openPart = (slug: string, number: number): OpenPart | undefined => input.open.find((p) => p.store.slug === slug && p.pull.number === number);
  const unnamedOpen = (named: readonly PartRef[]): OpenPart[] =>
    input.open.filter((p) => !named.some((n) => n.store === p.store.slug && n.number === p.pull.number));

  if (record === null) {
    const parts: PartState[] = input.open.map((p) => ({
      ref: null,
      store: p.store,
      storeSlug: p.store.slug,
      number: p.pull.number,
      pull: p.pull,
      named: false,
      status: 'pending',
      hasCopy: false,
      landing: null,
    }));
    return { identity, state: 'awaiting', decision: null, session: null, parts, reason: null, reasonPart: null };
  }

  const decided = record.session;
  const parts: PartState[] = [];
  for (const ref of decided.parts) {
    const store = storeOf(ref.store);
    const base: Omit<PartState, 'pull' | 'status' | 'hasCopy' | 'landing'> = { ref, store, storeSlug: ref.store, number: ref.number, named: true };
    if (store === null) {
      parts.push({ ...base, pull: null, status: 'unknown', hasCopy: false, landing: null });
      continue;
    }
    let pull: PullRequest;
    let reads: PartReads;
    try {
      pull = openPart(ref.store, ref.number)?.pull ?? (await store.forge.pull(ref.number));
      reads = await readPart(store, ref.number);
    } catch (err) {
      if (!(err instanceof ForgeRequestError)) throw err;
      parts.push({ ...base, pull: null, status: 'unknown', hasCopy: false, landing: null });
      continue;
    }
    const copy = latestSessionDecision(reads.reviews, recordingLogin, identity, decided.id);
    const hasCopy = copy !== null;
    if (pull.merged) {
      parts.push({ ...base, pull, status: 'merged', hasCopy, landing: null });
      continue;
    }
    if (pull.state !== 'open') {
      parts.push({ ...base, pull, status: 'closed', hasCopy, landing: null });
      continue;
    }
    // A landing record about this head, posted after this part's review of the decision, overrides it — as for one pull request.
    const since = copy?.time ?? record.time;
    let landing: LandingMark | null = null;
    let landingTime = -1;
    for (const comment of reads.comments) {
      if (comment.author !== recordingLogin) continue;
      const mark = parseLandingMark(comment.body);
      if (mark === null) continue;
      const t = timeOf(comment.createdAt);
      if (t >= landingTime) {
        landing = mark;
        landingTime = t;
      }
    }
    if (landing !== null && (landing.head !== pull.headSha || landingTime < since)) landing = null;

    let current = pull.headSha === ref.head;
    // A carry-over the lander recorded on this part, for this decision, names the head it carried the approval to.
    if (!current && copy !== null && copy.decision.head === pull.headSha && copy.decision.carriedFrom !== null) current = true;
    if (!current) {
      const base = await baseRef(git, store.root, store.config.git.default_branch);
      current = await carriesOver(git, store.root, base, ref.head, pull.headSha);
    }
    const status: PartState['status'] = !current
      ? 'moved'
      : landing?.state === 'blocked'
        ? 'landing-blocked'
        : landing?.state === 'needs-reapproval'
          ? 'landing-needs-reapproval'
          : 'ok';
    parts.push({ ...base, pull, status, hasCopy, landing });
  }
  for (const p of unnamedOpen(decided.parts)) {
    parts.push({ ref: null, store: p.store, storeSlug: p.store.slug, number: p.pull.number, pull: p.pull, named: false, status: 'unnamed', hasCopy: false, landing: null });
  }

  const name = (p: PartState): string => `${p.storeSlug}#${p.number}`;
  const result = (state: SessionStateName, reason: string | null, part: PartState | null): SessionState => ({
    identity,
    state,
    decision: record!.decision,
    session: decided,
    parts,
    reason,
    reasonPart: part === null ? null : name(part),
  });

  if (record.decision.decision === 'request-changes') return result('changes-requested', null, null);
  const closed = parts.find((p) => p.status === 'closed');
  if (closed !== undefined) return result('blocked', `${name(closed)} was closed without being merged`, closed);
  const unnamed = parts.find((p) => p.status === 'unnamed');
  if (unnamed !== undefined) return result('needs-reapproval', `${name(unnamed)} carries the session's marker but the decision does not name it`, unnamed);
  const moved = parts.find((p) => p.status === 'moved');
  if (moved !== undefined) return result('needs-reapproval', `${name(moved)} is no longer at the head the decision approved`, moved);
  const reapprove = parts.find((p) => p.status === 'landing-needs-reapproval');
  if (reapprove !== undefined) return result('needs-reapproval', `${name(reapprove)}: ${reapprove.landing!.reason}`, reapprove);
  const blocked = parts.find((p) => p.status === 'landing-blocked');
  if (blocked !== undefined) return result('blocked', `${name(blocked)}: ${blocked.landing!.reason}`, blocked);
  const counted = parts.filter((p) => input.homedHere || p.store !== null);
  const unknown = counted.find((p) => p.status === 'unknown');
  if (unknown !== undefined) return result('retrying', `${name(unknown)} cannot be read from its store`, unknown);
  const merged = counted.filter((p) => p.status === 'merged').length;
  if (merged > 0 && merged < counted.length) {
    const next = counted.find((p) => p.status === 'ok')!;
    return result('retrying', `${merged} of ${counted.length} parts landed; ${name(next)} is next`, next);
  }
  return result('approved', null, null);
}

/**
 * change-approval spec: a store's deciders, read from its `contexture.yaml` on its default branch on the forge at
 * decision time (design.md D5) — never from a clone that can be behind. No `change_approval` means no deciders.
 */
export async function decidersOnForge(git: GitRunner, store: SessionStore): Promise<string[]> {
  const prefix = await storePrefix(git, store.root);
  const text = await store.forge.fileAt(`${prefix}${CONFIG_FILE_NAME}`, store.config.git.default_branch);
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch {
    return [];
  }
  const deciders = (parsed as { change_approval?: { deciders?: unknown } } | null)?.change_approval?.deciders;
  return Array.isArray(deciders) ? deciders.filter((d): d is string => typeof d === 'string') : [];
}

/** A display name for a store in a session: its mount name, or the home store's slug. */
export function storeLabel(store: SessionStore): string {
  return store.mountName === null ? store.slug : `${store.mountName} (${store.slug})`;
}

export { sessionKey };
