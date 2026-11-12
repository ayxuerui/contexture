The submit half of the session lifecycle — everything up to and including opening the pull request.
`ctxr-land` is the other half, after review; `ctxr-session-lifecycle` covers what surrounds both (starting
a session, the conflict playbook, sequencing several pull requests) and is not repeated here.

## When

Fires on an explicit request to wrap up — "submit", "open the PR", "push it", "ship it" — or on the
operator's own closing utterance ("done", "that's all", a sign-off). That request is the whole reason step 7
needs no further confirmation: it is the consent for the push and the pull-request open. Enter without
one and there is nothing behind that step.

Anti-triggers — do not enter this skill when: you have merely finished the task you were given (a
delivered piece of work is not a closing signal, and the next message is as likely to extend it as to
end it); a question, an error, or a requested follow-up is still outstanding; the operator's last message
asked for more work. Your own judgment that the work looks complete is never the signal, and neither is
your own summary saying so.

Two tells that you are here uninvited. Reaching for `ctxr doctor`, `ctxr lint`, or `ctxr catalog check`
to decide *whether* to submit — those live at step 4 and inside `ctxr session submit`, in a submit already
asked for, and running them ahead of one is a rehearsal, not a check. And composing a question like "shall
I open the pull request?" — needing to ask is itself the answer: leave, and let the work continue.

Ending a turn without that signal is normal and is not this skill. Say in one line what is uncommitted
and which worktree holds it, then stop. The work is safe on the branch and the next message picks it up.

## A session in a mounted store

A session started inside `shared/<name>` belongs to that mounted store. Run every step below from that session's worktree. The pull request opens on that store's repository. The hand-off names that store's approval page, from its own `contexture.yaml`.

A session started with `ctxr session start --joins` is one part of a session of this store. Submit every part of the session. Run `ctxr session submit` once in each part's worktree. Why: each store gets its own pull request, and the command marks each pull request with the session. Do not write a session marker into a body yourself. Why: the command writes it, and it refuses a body that already carries one.

## Routes

Every pull request takes one of three routes. Say which, and why, in its body:

- **Session** (the default): the session's work plus the capture it approved.
- **Own**: a new skill, a structural change (folders, the entry document, conventions), or a refactor touching five
  or more files — reviewed on its own so it is not buried in content.
- **Housekeeping**: small appends nothing else depends on (a log line, a stray link fix), batched rather than folded
  into unrelated work.

## Steps

`<session>` below is the session worktree's directory name, as `ctxr session list` prints it.

1. Re-scan (mandatory — never replay a plan from an earlier snapshot): `ctxr session status <session>`, with
   `--diff` when you need the changes themselves. It fetches `__DEFAULT_BRANCH__` and reports what is
   uncommitted, the diff stat of committed and uncommitted work, and the commits ahead of
   `origin/__DEFAULT_BRANCH__`. State moves under you while you work; name the delta from the previous scan
   rather than silently folding new work into old buckets. If the session touched or linked to an entity
   note, run `ctxr rollup stale --for <entity>` (or a plain `ctxr rollup stale` when unsure which), and
   offer `ctxr-rollup` on anything flagged — never run a rollup unasked; the operator decides.
2. Capture pass: run `ctxr-session-capture` exactly once here — closing a session is itself a capture
   trigger; do not fire it again after submitting.
3. One coherent unit per pull request. `ctxr session submit` commits every change in the worktree outside
   the derived paths, so what the re-scan shows is what ships. If the session produced two disjoint units,
   say so and ask whether to split; anything that should not ship leaves the worktree before step 7. Derived
   artifacts under the cache paths never ship, and the command refuses an index that holds one, whoever
   staged it.
4. Validate: run `ctxr doctor` (store scope, not `--staged` — a session's job is to leave the whole store
   healthy, not merely pass one commit's gate). `ctxr session submit` runs the same check as its gate and
   commits nothing when it fails. Fix a failure; never bypass it, and never proceed past it.
5. Name the branch: `<prefix>/<short-slug>`, with a prefix from `skill/` `feat/` `project/` `notes/` `chore/`
   `refactor/` `fix/` unless this store's conventions say otherwise. Never let a generated name reach the
   forge: the name you pass at step 7 replaces it. A name given at `ctxr session start` does not settle
   this: it named a worktree when the work began, and what ships is decided here.
6. Write the commit message, the title and the body. The body answers
   `<why / what changed / route / verification / follow-ups>`. Write the why so that a reviewer does not
   have to find it again. Do not write a Knowledge changes section or a Pages section: the command appends
   both after your body — the Pages table from the change set's page report when a page changed, and the
   Knowledge changes block always — and refuses a body that already carries either heading. Why: you wrote
   the change, and the reviewer checks your account against the record the command wrote.
7. Submit: `ctxr session submit <session> --branch "<name>" --message "<message>" --title "<title>"
   --body-file <file>` (or `--body "<body>"` for a short one). It stages, runs the gate, commits, renames the
   branch, pushes, and opens the pull request against `__DEFAULT_BRANCH__`, or updates the one already open
   for the branch. Do not stop to confirm first. Why: the request to submit is the consent, and the
   command's store-scope check is the gate on this path. Never push or open the pull request any other way;
   never export or interpolate a token, and never rewrite the origin's URL. Why: that URL can hold a
   credential.
   Exit `0` means the pull request is open. Exit `3` names the step that stopped it, with everything before
   that step left in place: a failed gate (fix it and run the same submit again), a derived path in the
   index (unstage it), a rebase in progress (finish it with the conflict playbook), or a push or forge
   failure. Exit `2` is a refused argument: a branch name the default branch or another branch carries, or
   a body with a generated heading. If the forge cannot be reached, report the pushed branch and give the
   operator the manual pull-request instructions.
8. Verify before any retry: a transport error can arrive AFTER the push or the pull-request open already
   succeeded. `ctxr session submit` reads the remote branch and the forge's pull requests for it before it
   pushes or opens anything, so running the same submit again is the retry, and it publishes once.
   Submitting a session again after requested changes works the same way: a further commit on the same
   branch, and the same pull request updated — keep `--branch` as it was.
9. Hand off. Report each pull request's number and its url. Name what lands it: `ctxr-land`, with that
   number, or with the session when the session has a part in more than one store. Why: the next step is
   then one word away, not something to reconstruct later. When this store declares `change_approval`,
   also give the approval page address that the command reports.
   It is `serve.base_url`, then `/approve/`, then the session worktree's directory name and a `/`.
   For a session with parts in several stores, give one address only: the session's page in the store
   where it started. Every part's submit reports that same address. Why: a person without a forge account
   approves the change there. One decision covers every part, and the change then lands without further
   steps. Landing stays a separate decision, made on the approval page or by an explicit go.
   Never run it from here.
