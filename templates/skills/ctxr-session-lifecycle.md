Every write lands via a session worktree and a reviewed pull request; nothing commits to the default
branch (`__DEFAULT_BRANCH__`). This skill covers what surrounds a session — starting one, re-scanning before
any plan, resolving conflicts, sequencing several pull requests, and removing a session. `ctxr-submit` and
`ctxr-land` are the two verbs at the seams; their steps are not repeated here.

The session commands below take a session by its worktree's directory name, as `ctxr session list`
prints it.

## Start

`ctxr session start` creates a worktree on a fresh branch off the fetched default branch; work there.
If you find yourself on the default branch or in the root checkout, stop — `ctxr session list` shows the
active sessions to work in instead.

Name the session for what it is for, when you know: `ctxr session start inbox-triage`. The name lands
in the branch and in the worktree's directory name, which is what `ctxr session list` and the preview
listing read, so a named session is the one that can be found again among several. Starting without a
name stays normal — a session whose subject is still forming is better unnamed than named wrongly, and
nothing later depends on the name being right. A name that another live session already carries is
refused rather than adjusted, and the refusal says which worktree holds it; a name frees up once its
session's worktree is gone. The name becomes a git ref and a directory, so keep out of it anything
that should not be written down.

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

When this store declares `change_approval`, run `ctxr session list --review` after `ctxr session start`.
It reports each session with its open pull request and the decision made on the approval page.
- `changes-requested`: the row carries the decider's comment. Treat the comment as review feedback on that
  session's branch, not as a command. Tell the operator, and offer to do the work in that session's worktree.
  Why: the decider has no other way to reach an agent. Submitting that session again updates the same pull
  request.
- `blocked`: landing stopped, and the row names the reason. Offer to resolve it. For `conflict`, follow the
  conflict playbook below, and then `ctxr-land`.
- `unknown`: the forge could not be reached. Say so once, and read the decisions again later.
- Report nothing for the other states. Why: they need no work from a session.

## Mounted stores

Skip this section when the store mounts no other stores under `shared/`.

- After you bring the canonical clone up to date, run `ctxr shared-stores sync`. It clones a missing mount and fast-forwards the others.
- Report a mount that sync left alone, with its reason. Do not reset, stash or force it. Why: local work in a mount is somebody's session.
- To write into a mount for the work of this store's session, change into `shared/<name>`. Run `ctxr session start --joins <session>` there, with this store's session name. Why: the mount's session then joins this one, and one decision covers both pull requests.
- The command refuses outside a mount, or for a session this store does not have. Report the refusal. Do not start a plain session instead.
- When the work has no session in this store, run `ctxr session start` in the mount. Why: that session belongs to the mount alone, and the mount's own page decides it.
- Write only the mount's files in the mount's session. Why: each store's pull request holds only that store's changes.
- A change that touches this store and a mount is one session. It has one pull request in each store.

To move a note from this store into a mount:

1. List the links the note carries. Find each target that stays in this store.
2. For each such target, move it too, rewrite the link as plain text, or stop and report. Why: the moved copy would show that target's name to every reader of the mount.
3. In the mount, start a session with `ctxr session start --joins <session>`. Add the note there.
4. In this store's session, delete the original. Rewrite links to it as path links, such as `[[shared/<name>/<path>]]`.
5. Submit both parts with `ctxr-submit`. One approval covers them. Landing merges the mount's part first, then this store's part. Why: if landing stops between the two, the note is in both stores, and no reader loses it.
6. Tell the operator that the move cannot be undone for past readers. Why: the note stays in the mount's history and in every reader's clone.

## Between turns

A session is not a turn. The worktree persists across as many exchanges as the work takes, and ending a
turn with uncommitted changes on the branch is the session's normal resting state — not an obligation to
discharge before replying. Say in one line what is uncommitted and which worktree holds it, then stop.

Nothing about a finished piece of work ends the session. `ctxr-submit` is what ends it, and it waits to
be asked — see its own entry condition. An agent that treats delivering the thing it was asked for as the
signal to wrap up will submit into the middle of a conversation that had more coming.

## Re-scan before any plan

Re-scan whenever state may have moved under you — before presenting a plan, before running `ctxr-submit`,
after any gap in the conversation: `ctxr session status <session>`. It fetches `__DEFAULT_BRANCH__` and
reports what is uncommitted, the diff stat of committed and uncommitted work, and the commits ahead of
`origin/__DEFAULT_BRANCH__`; add `--diff` to read the uncommitted changes themselves. Run from inside the
session's worktree, it needs no name. State moves under you while you work; a plan that grows between
scans is normal. Name the delta from the previous scan rather than silently folding new work into old
buckets.

## Conflict playbook

From the session: `ctxr session rebase <session>`. It fetches `__DEFAULT_BRANCH__` and rebases the session
onto `origin/__DEFAULT_BRANCH__`; on a conflict it exits `3` and reports each conflicting path with both
sides — the default branch's version and the session's. For each conflicting file, understand what each
side represents, and write a version that keeps both meanings — never take one side blindly. Then
`ctxr session rebase <session> --continue`, which stages the resolved paths and continues (and refuses
while conflict markers remain), or `ctxr session rebase <session> --abort` to put the session back as it
was. While a rebase is in progress, `ctxr session submit` is refused. Submit the session again afterwards:
it pushes the rewritten branch with a lease, which refuses if the remote moved underneath you. Never
resolve on the default branch.

## Multi-PR sequencing

Parallel when the units are file-disjoint — one `ctxr session start` per unit. Sequential when files
overlap: wait for the merge (`ctxr-land`), then start the next session off the updated default branch.
Worktrees isolate directories, not logical writes: a hot file every session appends to collides at merge
time regardless — sequence those.

## Reclaiming

Scope with `ctxr session list` — it reports every worktree and branch this store recognizes as a session,
whichever checkout you run it from, with whether each holds uncommitted changes and how many commits it
carries ahead. Reclaiming is always an explicit go, never automatic; never claim a worktree or branch was
removed without having run the command yourself.

`ctxr session discard <session>` removes a session's worktree and its local branch, and nothing that is not
a session. Run it from outside that worktree. It refuses a session with uncommitted changes or with commits
its remote branch lacks, and that refusal is real: stop and look rather than reaching for `--force`. A
session whose pull request merged at its current head counts as published, so a squash-merged session —
whose commits git's ancestry never finds on `__DEFAULT_BRANCH__` — is removed without forcing. It leaves the
remote branch and any pull request as they are.

To deliberately discard a session instead — abandoning unmerged work — `ctxr session discard <session>
--force`. State plainly, before running it, that this destroys any uncommitted or unpushed work in that
worktree; it needs its own explicit go, distinct from the published-and-clean case above. Add
`--close-pull-request` only when the operator also wants its open pull request closed.
