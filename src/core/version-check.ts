import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { SHIPPED_DEFAULTS } from '../config/defaults.js';
import type { RunEnv } from './env.js';
import type { Finding } from './envelope.js';
import { writeFileAtomic } from './fs/atomic.js';
import { ownPackageName } from './registry.js';
import type { Store } from './store.js';
import { CLI_VERSION } from '../version.js';

/**
 * The release comparison behind `ctxr version --check` and the session-start /
 * update advisory (cli-contract: an explicit release check reports its answer
 * through the exit code).
 *
 * Hand-rolled over the plain three-part shape rather than taking a semver
 * dependency (design.md D7): every published release is X.Y.Z with no
 * prerelease or build metadata, and a comparison that handles exactly that and
 * REFUSES anything else fails in the right direction. An unrecognized version
 * is reported as undeterminable and named — the fail-loud contract applied to
 * parsing — never compared by guesswork, and never quietly treated as "current".
 */
export type ReleaseComparison =
  | { readonly kind: 'current' }
  | { readonly kind: 'newer-available'; readonly installed: string; readonly latest: string }
  | { readonly kind: 'undetermined'; readonly reason: string };

const THREE_PART = /^(\d+)\.(\d+)\.(\d+)$/;

/** Parses a plain X.Y.Z version. Returns undefined for anything else — including
 *  a prerelease, build metadata, a `v` prefix, or a leading/trailing space. */
export function parseVersion(version: string): [number, number, number] | undefined {
  const match = THREE_PART.exec(version);
  if (!match) return undefined;
  const parts = [match[1], match[2], match[3]].map((part) => Number(part));
  // Number() on a digits-only string cannot be NaN, but it can exceed the safe
  // integer range on absurd input; refuse rather than compare imprecisely.
  if (parts.some((part) => !Number.isSafeInteger(part))) return undefined;
  return [parts[0] as number, parts[1] as number, parts[2] as number];
}

/** Numeric, component-wise. Returns a negative number when `a` precedes `b`. */
function compareParsed(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] as number) - (b[i] as number);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * An installed version AHEAD of the published one is 'current', not an error:
 * that is exactly what a maintainer running an unreleased build sees, and it
 * is not a condition to nag them about.
 */
export function compareRelease(installed: string, latest: string): ReleaseComparison {
  const installedParts = parseVersion(installed);
  if (!installedParts) {
    return { kind: 'undetermined', reason: `the installed version "${installed}" is not a X.Y.Z version` };
  }
  const latestParts = parseVersion(latest);
  if (!latestParts) {
    return { kind: 'undetermined', reason: `the published version "${latest}" is not a X.Y.Z version` };
  }
  if (compareParsed(installedParts, latestParts) < 0) {
    return { kind: 'newer-available', installed, latest };
  }
  return { kind: 'current' };
}

// ---------------------------------------------------------------------------
// The advisory: the cached, never-throwing path used by session start and
// update. `ctxr version --check` deliberately does NOT come through here — an
// operator asking explicitly is asking about now, not about the last answer.
// ---------------------------------------------------------------------------

/**
 * Store-local, under the derived-cache subpath that is already gitignored and
 * already declared in `derived.paths` — so it needs no new plumbing and never
 * rides review. Deliberately NOT ~/.cache: that would be the first thing this
 * codebase writes outside a store root, and under the integration tests'
 * hermetic HOME it would write to a nonexistent path and silently do nothing
 * (design.md D6).
 */
export function updateCheckCachePath(store: Store): string {
  return path.join(store.root, '.contexture', 'cache', 'update-check.json');
}

/** The environment variable that suppresses the check for one invocation. */
export const UPDATE_CHECK_ENV_VAR = 'CONTEXTURE_UPDATE_CHECK';

interface CacheEntry {
  checked_at: string;
  latest: string;
}

function isFresh(entry: CacheEntry, now: Date, ttlHours: number): boolean {
  const checkedAt = Date.parse(entry.checked_at);
  if (!Number.isFinite(checkedAt)) return false;
  const ageMs = now.getTime() - checkedAt;
  // A cache stamped in the future is not fresh — a clock that moved backwards
  // must not pin the answer forever.
  return ageMs >= 0 && ageMs < ttlHours * 60 * 60 * 1000;
}

async function readCache(store: Store, now: Date, ttlHours: number): Promise<string | undefined> {
  try {
    const raw = await readFile(updateCheckCachePath(store), 'utf8');
    const entry = JSON.parse(raw) as Partial<CacheEntry>;
    if (typeof entry.latest !== 'string' || typeof entry.checked_at !== 'string') return undefined;
    return isFresh(entry as CacheEntry, now, ttlHours) ? entry.latest : undefined;
  } catch {
    // Missing, unreadable, or corrupt are all a miss — never an error. The
    // cache is an optimization; failing on it would let a stray byte on disk
    // fail a session.
    return undefined;
  }
}

async function writeCache(store: Store, now: Date, latest: string): Promise<void> {
  try {
    const filePath = updateCheckCachePath(store);
    await mkdir(path.dirname(filePath), { recursive: true });
    const entry: CacheEntry = { checked_at: now.toISOString(), latest };
    await writeFileAtomic(filePath, `${JSON.stringify(entry, null, 2)}\n`);
  } catch {
    // An unwritable cache costs one extra request next time. It is not a
    // reason to fail the command that was carrying the advisory.
  }
}

/** Reads the effective settings, falling back to the shipped defaults for a config that predates the block. */
function updateCheckSettings(store: Store): { enabled: boolean; ttlHours: number } {
  const configured = (store.config as { update_check?: { enabled?: boolean; ttl_hours?: number } }).update_check;
  return {
    enabled: configured?.enabled ?? SHIPPED_DEFAULTS.update_check.enabled,
    ttlHours: configured?.ttl_hours ?? SHIPPED_DEFAULTS.update_check.ttl_hours,
  };
}

/** Any explicit falsey spelling turns the check off for this invocation. */
function suppressedByEnv(env: RunEnv): boolean {
  const raw = env.env[UPDATE_CHECK_ENV_VAR];
  if (raw === undefined) return false;
  return ['0', 'false', 'no', 'off', ''].includes(raw.trim().toLowerCase());
}

export interface UpdateAdvisory {
  findings: Finding[];
  /** The stderr line, when there is one to print. */
  notice?: string;
}

const NO_ADVISORY: UpdateAdvisory = { findings: [] };

function checkFailed(reason: string): UpdateAdvisory {
  return {
    findings: [
      {
        code: 'cli.update_check_failed',
        severity: 'info',
        message: `the release check could not be completed: ${reason}`,
        subject: ownPackageName(),
      },
    ],
  };
}

/**
 * cli-contract: an advisory about a newer release never changes the outcome of
 * the command carrying it.
 *
 * This function has NO throwing path, and that is a requirement rather than an
 * intention (design.md D5). Session start creates a git worktree BEFORE this
 * runs, and runCommand maps any escaping error to the internal-error code — so
 * an unhandled rejection here would report a failed session that had in fact
 * succeeded, leaving an orphan worktree behind. Every failure below becomes a
 * finding.
 */
export async function updateAdvisory(env: RunEnv, store: Store): Promise<UpdateAdvisory> {
  try {
    const { enabled, ttlHours } = updateCheckSettings(store);
    if (!enabled || suppressedByEnv(env)) return NO_ADVISORY;

    const now = env.now();
    let latest = await readCache(store, now, ttlHours);
    if (latest === undefined) {
      const lookup = await env.registry.latestVersion(ownPackageName());
      if (lookup.kind === 'undetermined') return checkFailed(lookup.reason);
      latest = lookup.version;
      await writeCache(store, now, latest);
    }

    const comparison = compareRelease(CLI_VERSION, latest);
    if (comparison.kind === 'undetermined') return checkFailed(comparison.reason);
    if (comparison.kind === 'current') return NO_ADVISORY;

    const message = `ctxr ${comparison.installed} is installed; ${comparison.latest} is available.`;
    return {
      findings: [
        {
          code: 'cli.update_available',
          severity: 'info',
          message,
          subject: ownPackageName(),
          details: { installed: comparison.installed, latest: comparison.latest },
        },
      ],
      notice: `${message} Run the ctxr-upgrade skill to upgrade.`,
    };
  } catch (err) {
    // The backstop for anything the branches above did not anticipate. Reaching
    // it is a bug, but reaching it must still not fail the caller's command.
    return checkFailed(err instanceof Error ? err.message : String(err));
  }
}
