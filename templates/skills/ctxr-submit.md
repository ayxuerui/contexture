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

## Routes

Every pull request takes one of three routes. Say which, and why, in its body:

- **Session** (the default): the session's work plus the capture it approved.
- **Own**: a new skill, a structural change (folders, the entry document, conventions), or a refactor touching five
  or more files — reviewed on its own so it is not buried in content.
- **Housekeeping**: small appends nothing else depends on (a log line, a stray link fix), batched rather than folded
  into unrelated work.

## Steps

1. Re-scan (mandatory — never replay a plan from an earlier snapshot): `git fetch origin`,
   `git status --short`, `git diff --stat`, `git diff --cached --stat`,
   `git ls-files --others --exclude-standard`, `git log --oneline origin/__DEFAULT_BRANCH__..HEAD`. State moves
   under you while you work; name the delta from the previous scan rather than silently folding new work
   into old buckets. If the session touched or linked to an entity note, run `ctxr rollup stale --for <entity>`
   (or a plain `ctxr rollup stale` when unsure which), and offer `ctxr-rollup` on anything flagged — never run a
   rollup unasked; the operator decides.
2. Capture pass: run `ctxr-session-capture` exactly once here — closing a session is itself a capture
   trigger; do not fire it again after submitting.
3. Stage surgically: `git add <paths>`, never `git add -A`; confirm with `git status --short` that the
   staged set matches the intended unit. Derived artifacts under the cache paths never stage.
4. One coherent unit per pull request. If the session produced two disjoint units, say so and ask
   whether to split.
5. Validate: run `ctxr doctor` (store scope, not `--staged` — a session's job is to leave the whole store
   healthy, not merely pass one commit's gate). Fix a failure; never bypass it, and never proceed past it.
6. Commit: `git commit -m "<message>"`, describing the unit staged in step 3.
7. Name the branch: `<prefix>/<short-slug>`, with a prefix from `skill/` `feat/` `project/` `notes/` `chore/`
   `refactor/` `fix/` unless this store's conventions say otherwise. If it still carries a generated name,
   `git branch -m "<name>"` before pushing — never
   let a generated name reach the forge. A name given at `ctxr session start` does not settle this: it
   named a worktree when the work began, and what ships is decided here.
8. Before you open the pull request, run `ctxr publish urls --since origin/__DEFAULT_BRANCH__ --json`.
   When the report lists a page, add a **Pages** section to the body. In that section, put a table with one
   row for each page: its status, its preview address, and its published address. Copy each address from the
   report. An address is never rebuilt by hand. Mark the old address of a moved page as one that stops
   working. Mark the address of a removed page the same way. Under the table, state the condition one time: a
   preview resolves only while this pull request is open and the server can see this
   session's worktree. The published address resolves when the served checkout gets the landed commit.
   When the report has no preview, leave out that column. When the report says that no base URL is declared,
   say that the addresses are bare routes. When it lists no page, add no section.
   Then run `ctxr graph diff --since origin/__DEFAULT_BRANCH__ --format markdown`. Paste its output into the
   body verbatim, as the **Knowledge changes** section. Do not add, remove, or change a word of it. Why: you
   wrote the change, and the reviewer checks your account against this record, which the command wrote.
   Always paste the block, also when it says that the range changes no note. Why: a missing section looks the
   same as a skipped step. The block is the record of the change. The review address in the block is a
   convenience only. Why: it resolves only while this session's worktree exists and the server can reach it.
   Then run `git push -u origin "<branch>"`. Then run `gh pr create --base __DEFAULT_BRANCH__ --title "<title>"
   --body "<why / what changed / route / verification / follow-ups>"`. `gh` reads its own credential file, so
   never export or interpolate a token, and never rewrite the origin's URL. Why: that URL can hold a
   credential. The body answers those five questions and carries the sections above. Write the why so that a
   reviewer does not have to find it again. Do not stop to confirm first. Why: the request to submit is the
   consent for both, and `ctxr doctor` in step 5 is the gate on this path. If `gh` has no reachable GitHub
   remote for this repository, `git push` still succeeds alone. Then report the pushed branch, and give the
   operator the manual pull-request instructions. Do not retry `gh`.
9. Verify before any retry: a transport error can arrive AFTER the push or the pull-request open already
   succeeded. Before retrying anything, `git ls-remote origin <branch>` and `gh pr list --head <branch>` —
   never replay a push or a pull-request open blindly.
10. Hand off: report the pull request's number and its url, and name what landing it takes —
    `ctxr-land`, targeting that number — so the next step is one word away instead of something to
    reconstruct later. Landing stays a separate decision and keeps its own explicit confirmation; never
    run it from here.
