/**
 * The exit-code taxonomy every contexture command shares (cli-contract spec).
 *
 * `0` and `1` follow a deliberate split from plain "success vs failure":
 * Node itself exits a process with `1` on an uncaught exception, so `1` is
 * reserved for exactly that class of failure (a bug, a crash) and nothing
 * else. That keeps `1` from ever being confused with "the command ran
 * correctly and found a real problem" — which is `CheckFailed`, not `Internal`.
 *
 * `4` and `5` are reserved now, unused until Phase 5's disclosure-policy
 * tri-state (ALLOW/DENY/ASK) needs codes distinct from `CheckFailed` — ALLOW
 * must be `Ok` (0), so DENY/ASK can't reuse `CheckFailed` (3).
 *
 * This table is allocated once, here, and is never extended by guessing a
 * number under pressure in a later phase.
 */
export const ExitCode = {
  /** The command ran and found nothing wrong. */
  Ok: 0,
  /** An unexpected internal error (a bug) — never a real, expected finding. */
  Internal: 1,
  /** Bad arguments, no store root, not a git repo, invalid/mismatched schema version. */
  Usage: 2,
  /** The command ran correctly and determined a real problem exists. */
  CheckFailed: 3,
  /** Reserved for Phase 5's disclosure-policy tri-state: DENY. */
  DisclosureDeny: 4,
  /** Reserved for Phase 5's disclosure-policy tri-state: ASK. */
  DisclosureAsk: 5,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
