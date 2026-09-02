Every write lands via a session worktree and a reviewed pull request; nothing commits to the default
branch (`__DEFAULT_BRANCH__`). This skill covers what surrounds a session — starting one, re-scanning before
any plan, resolving conflicts, and sequencing several pull requests. `ctxr-submit` and `ctxr-land` are
the two verbs at the seams; their steps are not repeated here.

## Start

`ctxr session start` creates a worktree on a fresh branch off the fetched default branch; work there.
If you find yourself on the default branch or in the root checkout, stop — `ctxr session list` shows the
active sessions to work in instead.

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

For a session whose pull request merged: `git worktree remove <path>` then `git branch -d <branch>`, run
from outside that worktree (no command can remove the directory it is running from — `git worktree list`
names the canonical clone first). Leave both unforced — git already refuses on its own if the worktree is
dirty or the branch isn't fully merged; a refusal means stop and look, not reach for `--force`.

To deliberately discard a session instead — abandoning unmerged work — `git worktree remove --force <path>`
then `git branch -D <branch>`. State plainly, before running it, that this destroys any uncommitted or
unmerged work in that worktree; it needs its own explicit go, distinct from the merged-and-clean case above.
