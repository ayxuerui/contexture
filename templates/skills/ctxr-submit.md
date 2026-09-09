The submit half of the session lifecycle — everything up to and including opening the pull request.
`ctxr-land` is the other half, after review; `ctxr-session-lifecycle` covers what surrounds both (starting
a session, the conflict playbook, sequencing several pull requests) and is not repeated here.

## When

Fires on an explicit request to wrap up — "submit", "open the PR", "push it", "ship it" — or on the
operator's own closing utterance ("done", "that's all", a sign-off). That request is the whole reason step 8
needs no further confirmation: it is the consent for the push and the pull-request open. Enter without
one and there is nothing behind those steps.

Anti-triggers — do not enter this skill when: you have merely finished the task you were given (a
delivered piece of work is not a closing signal, and the next message is as likely to extend it as to
end it); a question, an error, or a requested follow-up is still outstanding; the operator's last message
asked for more work. Your own judgment that the work looks complete is never the signal, and neither is
your own summary saying so.

Two tells that you are here uninvited. Reaching for `ctxr doctor`, `ctxr lint`, or `ctxr catalog check`
to decide *whether* to submit — those live at step 5 and after, inside a submit already asked for, and
running them ahead of one is a rehearsal, not a check. And composing a question like "shall I open the
pull request?" — needing to ask is itself the answer: leave, and let the work continue.

Ending a turn without that signal is normal and is not this skill. Say in one line what is uncommitted
and which worktree holds it, then stop. The work is safe on the branch and the next message picks it up.

## Steps

1. Re-scan (mandatory — never replay a plan from an earlier snapshot): `git fetch origin`,
   `git status --short`, `git diff --stat`, `git diff --cached --stat`,
   `git ls-files --others --exclude-standard`, `git log --oneline origin/__DEFAULT_BRANCH__..HEAD`. State moves
   under you while you work; name the delta from the previous scan rather than silently folding new work
   into old buckets.
2. Capture pass: run `ctxr-session-capture` exactly once here — closing a session is itself a capture
   trigger; do not fire it again after submitting.
3. Stage surgically: `git add <paths>`, never `git add -A`; confirm with `git status --short` that the
   staged set matches the intended unit. Derived artifacts under the cache paths never stage.
4. One coherent unit per pull request. If the session produced two disjoint units, say so and ask
   whether to split.
5. Validate: run `ctxr doctor` (store scope, not `--staged` — a session's job is to leave the whole store
   healthy, not merely pass one commit's gate). Fix a failure; never bypass it, and never proceed past it.
6. Commit: `git commit -m "<message>"`, describing the unit staged in step 3.
7. Name the branch: if it still carries a generated name, `git branch -m "<name>"` before pushing — never
   let a generated name reach the forge.
8. Run: `git push -u origin "<branch>"`, then `gh pr create --base __DEFAULT_BRANCH__ --title "<title>" --body
   "<why / what changed / verification / follow-ups>"`. Do not stop to confirm first — the request to
   submit is the consent for both, and `ctxr doctor` in step 5 is the gate on this path. If `gh` has no
   reachable GitHub remote for this repository, `git push` still succeeds on its own — report the pushed
   branch and give the operator the manual pull-request instructions instead of retrying `gh`.
9. Verify before any retry: a transport error can arrive AFTER the push or the pull-request open already
   succeeded. Before retrying anything, `git ls-remote origin <branch>` and `gh pr list --head <branch>` —
   never replay a push or a pull-request open blindly.
10. Hand off: report the pull request's number and its url, and name what landing it takes —
    `ctxr-land`, targeting that number — so the next step is one word away instead of something to
    reconstruct later. Landing stays a separate decision and keeps its own explicit confirmation; never
    run it from here.
