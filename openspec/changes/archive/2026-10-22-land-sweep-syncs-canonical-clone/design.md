## Context

See proposal.md for the motivation. What exists today:

- `ctxr land`'s `afterMerge()` runs `git fetch origin <default>`, then `git merge --ff-only` in the canonical clone
  when it is on the default branch. It does not check for uncommitted changes. `git merge --ff-only` refuses only
  when such a change would be overwritten, so a dirty clone is sometimes moved, around someone's edits.
- `ctxr land --pending` already fetches `origin` at its start, under the landing lock.
- The lifecycle skill tells agents the same rule this change applies: fast-forward only, only on the default
  branch, never check out, reset, stash or force.

## Goals / Non-Goals

**Goals:** one fast-forward rule, used after a merge and at the end of every sweep; nothing ever done to a clone
that is not clean and on the default branch; an envelope that says what happened.

**Non-Goals:** see proposal.md.

## Decisions

### D1. The sweep, not a timer of its own in `serve`

*The case for a sync timer in `serve`, independent of landing:* it would also cover `land: manual`, and the sync
would not depend on approval being configured at all. *Why not:* the sweep already exists, already fetches, and
already holds the landing lock. A second timer would be a second writer to the canonical clone that has to
coordinate with the first. The stores this targets are exactly those where `serve` lands. A general "keep any store
current" mechanism for stores without approval is a separate decision (proposal Non-goals).

### D2. Clean means no uncommitted changes to tracked files

The check is `git status --porcelain --untracked-files=no` with empty output. Untracked files do not block the
sync: a scratch file in `/store` is common and harmless. If the fast-forward would overwrite one, `git merge
--ff-only` refuses on its own, and that refusal is reported like any other.

### D3. A failed sync is a warning, not a failure

`ctxr land --pending` exits non-zero for a blocked landing, and `serve` logs that. An agent's in-progress edit in the
canonical clone is not a landing failure, and it would otherwise make every sweep look failed until the agent
finishes. So `canonical_sync` carries the reason, a warning finding names it, and the exit code reflects landings
only.

### D4. Inside the landing lock, after the landings

The sync runs last, so it includes anything this run merged, and it runs once per run rather than once per merged
pull request. The per-merge sync in `afterMerge()` stays, because `ctxr land <pr>` lands a single pull request and
should leave the clone current too. It uses the same function, so it gains the cleanliness check.

## Risks / Trade-offs

- [An agent is mid-edit in the canonical clone] → the clone is dirty, so it is left alone and the sweep reports it.
  The rule matches the one agents already follow.
- [git's own lock collides with an agent's git command at the same moment] → the merge fails with `index.lock` in
  use. That is reported as a failed sync and retried on the next sweep, five minutes later.
- [Served content changes under a reader every few minutes] → this is the intended effect. Before this change it
  happened at container restarts instead.

## Migration Plan

Ships in the next ctxr release. Stores with `serve` landing (pkm, bambi, readyrun-brain) need nothing else.
