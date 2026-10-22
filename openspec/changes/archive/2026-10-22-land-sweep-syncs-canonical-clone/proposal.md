## Why

A merged change reaches a store's canonical clone, the checkout `ctxr serve` serves and agents start sessions
from, only when something fast-forwards it. Three things do: the store update when a container starts, an agent
that follows the lifecycle skill when it starts a session, and `ctxr land` right after it merges. Nothing does it
for a change merged on the forge in any other way, such as a configuration pull request merged by a person. So on
2026-10-21, after bambi's and readyrun-brain's `change_approval` pull requests merged, both stores kept serving the
old configuration. `serve` already reloads `contexture.yaml` when the file changes (`serve-follows-config-changes`),
but the file never changed until someone fast-forwarded `/store` by hand. The same holds for merged notes: the
browsing surface shows the old content until something else moves the checkout.

`serve` already runs a landing sweep every five minutes (`serve-lands-approved-changes`), and that sweep already
fetches the default branch. Fast-forwarding there costs one more git command, and makes "merged" mean "served
within five minutes".

## What Changes

- **`ctxr land --pending` brings the canonical clone up to date on every run,** whether or not it landed anything.
  After its landings, it fast-forwards the canonical clone to the forge's default branch. The conditions are: the
  clone is on that branch, it has no uncommitted changes to tracked files, and it can be fast-forwarded. Otherwise
  it leaves the clone untouched and reports why.
- **The same rule applies after `ctxr land <pr>`'s own merge.** That merge today fast-forwards without checking for
  uncommitted changes.
- **The result is reported** as `canonical_sync` in the envelope: synced from which commit to which, or not synced
  and why. A sync that cannot happen is a warning, not a failure, and does not change the exit code.
- **With `serve` landing automatically, a merged change** (configuration, notes or pages) is in the served checkout
  within one sweep. With the configuration reload, a merged `contexture.yaml` change takes effect without a
  restart.

## Non-goals

- **Stores that do not declare `change_approval`, or that set `land: manual`.** No sweep runs for them, so nothing
  changes. Their checkout still moves with container starts and session starts. A general sync for such stores
  would be its own command or schedule, and needs its own case.
- **Forcing, resetting, stashing or switching branches.** An unclean or diverged clone is somebody's work, so it is
  reported and left alone, exactly as the lifecycle skill already instructs agents.
- **Pulling anything but the default branch.**

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `write-lifecycle`: adds that every landing run brings the canonical clone up to date when it is safe to, and
  reports the outcome. That covers the sweep with nothing to land, and replaces the merge-time fast-forward's
  weaker check.

## Impact

- `src/commands/land.ts`: one `syncCanonical()` used both after a merge and at the end of every `--pending` run; the
  `--pending` envelope gains a top-level `canonical_sync`.
- Tests: an integration test merging a change on the forge outside `ctxr land`, then running `ctxr land --pending`
  with nothing approved; dirty, wrong-branch and diverged clones left alone; and an end-to-end check that a merged
  `contexture.yaml` change reaches a running `serve` within a sweep.
- No configuration, no images change.
