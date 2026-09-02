The land half of the session lifecycle, after review. `ctxr-submit` is the other half; `ctxr-session-lifecycle`
covers what surrounds both and is not repeated here.

1. Name the target explicitly — a branch name or a pull-request number — rather than relying on whichever
   checkout you happen to be standing in: that checkout is as likely to be the canonical clone on
   `__DEFAULT_BRANCH__`, which has no session to infer, as the session itself. Never land
   `__DEFAULT_BRANCH__` itself; a pull request whose head is `__DEFAULT_BRANCH__` is refused too.
2. Read state before any side effect: `gh pr view <target> --json number,url,title,state,mergeable,headRefName`.
   Refuse if the head branch is `__DEFAULT_BRANCH__`, or if the target you named doesn't match the head
   branch this reports. A closed pull request stops here — report it, do nothing further.
3. Check mergeability. `MERGEABLE` proceeds to the gate below. `UNKNOWN` re-queries once (`gh pr view`
   again) before treating it as still unknown. `CONFLICTING` or still-`UNKNOWN` after the re-query stops
   the command — follow `ctxr-session-lifecycle`'s conflict playbook, then retry from step 1; a retry
   re-reads state and performs only what remains.
4. Gate: merging is an external side effect, and plan consent is not fire consent. Present the pull
   request's number, title, and url; wait for an explicit go (already having explicit approval from
   elsewhere in this conversation satisfies this — don't ask twice).
5. Merge: `gh pr merge <number> --squash` (or `--merge` / `--rebase` if the operator asked for a different
   method). Then re-read state (`gh pr view` again) to confirm the forge reports `MERGED` — never claim a
   merge from the merge command's exit code alone; a transport error can arrive after the merge already
   succeeded.
6. Synchronize the default branch in the store's canonical clone — the repository's main worktree, not
   necessarily the checkout you're running this from. From the canonical clone: `git fetch origin` then
   `git merge --ff-only origin/__DEFAULT_BRANCH__`. If that clone is on another branch, or the fast-forward
   fails (diverged from origin), report exactly that and stop — never check it out, reset it, or force the
   merge to make it comply.
7. Reclaim the worktree if you want to now: see `ctxr-session-lifecycle`'s Reclaiming section
   (`ctxr session list` to scope, then `git worktree remove` / `git branch -d`) — run it from outside the
   worktree being removed. Otherwise leave cleanup to whoever owns the worktree.
8. Report exactly what happened — merged or not, synced or not (with why not), reclaimed or not (with why
   not). Never claim a merge or a cleanup you did not confirm yourself.

Merging with `gh pr merge` (step 5) is the mechanism, not a shortcut around one: the pull request and its
merge commit are the audit trail. What step 4's gate protects against is merging without having actually
read the state in steps 2-3 first, or without an explicit go — never skip the read, the mergeability check,
or the confirmation to save a round trip.
