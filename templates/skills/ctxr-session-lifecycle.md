Every write lands via a session worktree and a reviewed pull request; nothing commits to the default
branch (`__DEFAULT_BRANCH__`). This skill covers what surrounds a session — starting one, re-scanning before
any plan, resolving conflicts, and sequencing several pull requests. `ctxr-submit` and `ctxr-land` are
the two verbs at the seams; their steps are not repeated here.

## Start

`ctxr session start` creates a worktree on a fresh branch off the fetched default branch; work there.
If you find yourself on the default branch or in the root checkout, stop — `ctxr session list` shows the
active sessions to work in instead.

Before starting, bring the store's canonical clone up to date — the repository's main worktree, not
whichever checkout you are standing in. From the canonical clone: `git fetch origin`, then
`git merge --ff-only origin/__DEFAULT_BRANCH__`. If it is on another branch, carries uncommitted
changes, or the fast-forward fails because it has diverged from origin, report exactly that and start
the session anyway — never check it out, reset it, stash, or force the merge to make it comply. The
session's base is unaffected either way, because `ctxr session start` branches from the
`origin/__DEFAULT_BRANCH__` it fetches itself. What a stale clone costs is the context you read out of
it: notes, catalog sections, the graph document, and AGENTS.md would all be the versions it last had.

`ctxr session start` names the start point it used. If it reports that it did not fetch, there was no
remote branch to fetch from and it branched from the local default branch instead — say so plainly,
because the session is then based on whatever that clone last had rather than on origin.

If `ctxr session start` reports a `cli.update_available` finding, a newer `ctxr` than the one installed
has been published. Name both versions to the operator and offer `ctxr-upgrade`; then continue the
session either way. Do not upgrade unasked, and do not make continuing conditional on the answer —
deferring is a normal answer, and the session is unaffected by it. A `cli.update_check_failed` finding
means the check could not be completed; it says nothing about whether an upgrade is due, so proceed
without mentioning it.

## Re-scan before any plan

Re-scan whenever state may have moved under you — before presenting a plan, before running `ctxr-submit`,
after any gap in the conversation: `git fetch origin`, `git status --short`, `git diff --stat`,
`git diff --cached --stat`, `git ls-files --others --exclude-standard`,
`git log --oneline origin/__DEFAULT_BRANCH__..HEAD`. State moves under you while you work; a plan that grows
between scans is normal. Name the delta from the previous scan rather than silently folding new work into
old buckets.

## Conflict playbook

From the session worktree: `git fetch origin && git rebase origin/__DEFAULT_BRANCH__`. For each conflicting
file inspect both sides (`git show`), understand what each represents, and produce a version that keeps
both meanings — never take one side blindly. `git add <file>`, `GIT_EDITOR=true git rebase --continue`,
then `git push --force-with-lease origin <branch>` (aborts if the remote moved underneath you). Never
resolve on the default branch.

## Multi-PR sequencing

Parallel when the units are file-disjoint — one `ctxr session start` per unit. Sequential when files
overlap: wait for the merge (`ctxr-land`), then start the next session off the updated default branch.
Worktrees isolate directories, not logical writes: a hot file every session appends to collides at merge
time regardless — sequence those.

## Reclaiming

Scope with `ctxr session list` — it reports every worktree and branch this store recognizes as a session,
whichever checkout you run it from. Reclaiming is always an explicit go, never automatic; never claim a
worktree or branch was removed without having run the command yourself.

Establish that the pull request actually merged before removing anything, and get that from the forge —
`gh pr view <branch> --json state` reporting `MERGED` — not from git. If the store squash-merges (GitHub's
default), the squashed commit is not the branch's tip, so git's ancestry test calls a landed branch
unmerged forever: `git log <default>..<branch>` never empties and `git branch -d` never succeeds. Reading
a refusal there as "unmerged work" strands every session the store has ever landed.

With `MERGED` confirmed: `git worktree remove <path>`, then `git branch -d <branch>` — run from outside
that worktree (no command can remove the directory it is running from — `git worktree list` names the
canonical clone first). Leave the worktree removal unforced: it refuses on uncommitted work, and that
refusal is real, so stop and look rather than reaching for `--force`. If `git branch -d` refuses on a
pull request the forge says is merged, that is the squash case above, and `git branch -D` is the correct
finish — the forge, not the ancestry graph, is what established the work is safe.

To deliberately discard a session instead — abandoning unmerged work — `git worktree remove --force <path>`
then `git branch -D <branch>`. State plainly, before running it, that this destroys any uncommitted or
unmerged work in that worktree; it needs its own explicit go, distinct from the merged-and-clean case above.
