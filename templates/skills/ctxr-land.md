The land half of the session lifecycle, after review. `ctxr-submit` is the other half; `ctxr-session-lifecycle`
covers what surrounds both and is not repeated here. `ctxr land` does the landing. This skill decides when to run it.

For a pull request on a mounted store under `shared/<name>`, run every step from that mount, not from this store.
Why: the mount's own `contexture.yaml` names its approval rules and its canonical clone.

1. Name the target explicitly — a branch name or a pull-request number — rather than relying on whichever
   checkout you happen to be standing in: that checkout is as likely to be the canonical clone on
   `__DEFAULT_BRANCH__`, which has no session to infer, as the session itself. Never land
   `__DEFAULT_BRANCH__` itself; a pull request whose head is `__DEFAULT_BRANCH__` is refused too.
   Run every step from outside the worktree being removed. Why: no command can remove the directory it runs from.
2. Read state before any side effect. Run `gh pr view <target> --json number,url,title,state,headRefName`.
   A closed pull request stops here. Report it, and do nothing more.
   When this store declares `change_approval`, also run `ctxr review list`. Find the row for this pull request.
   Why: a decision made on the approval page is recorded there, with the person who made it.
3. Gate. Landing is an external side effect, and plan consent is not fire consent.
   - When the row says `approved`, that decision is the consent. Go to step 4 without a question.
     Why: a decider approved this exact change on the approval page.
   - Otherwise, present the pull request's number, title, and url. Wait for an explicit go. An explicit
     approval given earlier in this conversation satisfies this. Do not ask twice.
   - When the row says `changes-requested` or `needs-reapproval`, say so before you ask.
     Why: a decider asked for a change, or has not seen the current version.
4. Land. With an approval from the page, run `ctxr land <number>`. With an explicit go, run
   `ctxr land <number> --confirm`. Use `--confirm` only after that go. Why: the flag tells the command that a person agreed.
   The command catches the branch up with `__DEFAULT_BRANCH__`, merges, re-reads state to confirm that the forge
   reports the pull request merged, fast-forwards the canonical clone, removes the worktree and its branch, and
   records the landing. Do not run `gh pr merge` yourself. Why: the command holds the consent check, and it
   never trusts a merge command's exit code alone.
5. Act on the outcome the command reports:
   - `merged`: go to step 6.
   - `blocked` with the reason `conflict`: follow `ctxr-session-lifecycle`'s conflict playbook in the session
     worktree. Then do step 4 again. A retry re-reads state and does only what remains.
   - `blocked` with another reason: report the reason. A conflict resolver ran and its result was refused.
   - `needs-reapproval`: report that the change needs a new decision on the approval page. Do not land it with
     `--confirm` unless the operator says so for this version. Why: nobody approved the new version.
   - `no-consent`: return to step 3.
   - `merge-refused`: report it. Checks or branch protection can still be pending, and a later run retries.
   - `lease-refused`: the branch moved while the command ran. Start again from step 1.
6. Report exactly what happened — merged or not, synced or not (with why not), reclaimed or not (with why
   not), each as the command reports it. If the canonical clone did not sync, never check it out, reset it, or
   force a merge to make it comply. Reclaiming is the default action, not an optional extra: nothing sweeps
   up afterward, so a worktree left here is left indefinitely. If the command kept the worktree, follow
   `ctxr-session-lifecycle`'s Reclaiming section once the reason is gone. Never claim a merge or a cleanup that
   the command did not report.

The pull request and its merge commit are the audit trail. What the gate in step 3 protects against is landing
without reading the state in step 2 first, or without a go. Never skip the read or the gate to save a round trip.
