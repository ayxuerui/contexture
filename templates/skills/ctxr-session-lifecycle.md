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

`ctxr session reap` removes merged, clean worktrees (or use `ctxr-land`'s `--reap`); `ctxr session abandon
<branch>` discards work and needs an explicit go. Never claim cleanup happened without having run one.
