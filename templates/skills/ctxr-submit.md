The submit half of the session lifecycle — everything up to and including opening the pull request.
`ctxr-land` is the other half, after review; `ctxr-session-lifecycle` covers what surrounds both (starting
a session, the conflict playbook, sequencing several pull requests) and is not repeated here.

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
8. Fire gate: pushing the branch and opening the pull request are external side effects, and plan consent
   is not fire consent. Present the branch, the title, and what rides it; wait for an explicit go before
   running the next step.
9. Run: `git push -u origin "<branch>"`, then `gh pr create --base __DEFAULT_BRANCH__ --title "<title>" --body
   "<why / what changed / verification / follow-ups>"`. If `gh` has no reachable GitHub remote for this
   repository, `git push` still succeeds on its own — report the pushed branch and give the operator the
   manual pull-request instructions instead of retrying `gh`.
10. Verify before any retry: a transport error can arrive AFTER the push or the pull-request open already
    succeeded. Before retrying anything, `git ls-remote origin <branch>` and `gh pr list --head <branch>` —
    never replay a push or a pull-request open blindly.
11. Hand off: report the pull request, then point at `ctxr-land` for after review.
