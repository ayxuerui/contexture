---
description: Typed shortcut for /ctxr:submit, which opens the ctxr-submit skill. A request in words loads ctxr-submit itself.
---

## Before this skill: the store's tools stand in for a checkout

### In a checkout, use the store's own skill

If the working directory has a `contexture.yaml` at its root and a shell here runs `ctxr`, you are in a
checkout of the store, and this text is not for you. The `ctxr:`-namespaced skills and commands, such as
`ctxr:ctxr-capture` and `/ctxr:capture`, are this plugin's, written for the store's server. The
un-namespaced `ctxr-<name>` skills in the store's skills folder are the store's own, written for a checkout.
In a checkout, invoke the un-namespaced `ctxr-<name>` skill of the same name and follow it, never the
`ctxr:` one, and ignore the rest of this text. A `/ctxr:` command typed in a checkout asks for that store
skill.

### Through the store's server

Otherwise you are working through this store's server, not in a checkout of it. Nothing runs a shell here, so no
`git`, `gh` or `ctxr` command runs as written. The skill below was written for an agent with a checkout:
follow it as written, and take each step it names through the tool these tables give.

### Commands

| Command | Tool |
| --- | --- |
| `ctxr session start` | `session_start` |
| `ctxr session list` | `session_list` |
| `ctxr session status` | `session_status` |
| `ctxr session submit` | `session_submit` |
| `ctxr session rebase` | `session_rebase` |
| `ctxr session discard` | `session_discard` |
| `ctxr shared-stores sync` | none |

A command marked none has no counterpart here: skip that step and say nothing about it. Each other tool takes its command's options as fields, each named for its option without the leading
dashes, and the session the command names as `session`: the session worktree's directory name, which
`session_start` returns and `session_list` lists. `session_start` takes the session's name as `label`.

Every other `ctxr` step runs through the `ctxr` tool when the command only reads, and through `ctxr_write`
when it writes. Pass the words after `ctxr` as `args`, one word per entry: a step that says to run
`ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`. Name a session as `session` to run the command
in that session's working tree; `ctxr_write` always needs one. When a command reads a file you prepared,
pass the file's text as `input` and write `@input` in `args` where its path goes.

### Git steps

| Git step | Tool |
| --- | --- |
| `git mv` | `Move` |
| `git rm` | `Delete` |
| `git status` | `session_status` |
| `git diff` | `session_status` |
| `git log` | `session_status` |
| `git add` | `session_submit` |
| `git commit` | `session_submit` |
| `git push` | `session_submit` |
| `git branch -m` | `session_submit` |
| `gh pr create` | `session_submit` |
| `gh pr edit` | `session_submit` |
| `git fetch` | none |
| `git merge --ff-only` | none |
| `git rebase` | `session_rebase` |
| `git worktree add` | `session_start` |
| `git worktree list` | `session_list` |
| `git worktree remove` | `session_discard` |

Commits, pushes and pull requests happen only in `session_submit`. A step marked none is the server's own
work: it keeps the store's clone current, and `session_start` branches from the freshly fetched default
branch. Skip that step and say nothing about it.

### Paths

`session_start` returns the session's root, a path such as `<worktrees path><directory>/`. Every path the
skill names is relative to the store; inside a session it goes under that root, so the note `work/a.md` in
that session is `<worktrees path><directory>/work/a.md` for `Read`, `Edit`, `Write`, `Move`, `Delete`,
`Grep` and `Glob`. A path without a session root reads the store as it was last approved, and a write to one
is refused. A change rests uncommitted in its session until `session_submit`.

### This store's settings

Where the skill uses one of this store's settings, it names the setting with a placeholder in angle
brackets, such as `<inbox path>`, `<log path>` or `<default branch>`. The connector's instructions give each
one's value under *This store*, by the same name, with the store's layers and its relation vocabulary. Use
that value wherever the placeholder appears, inside a path too: `<capture root>assets/` with a capture root
of `sources/` is `sources/assets/`. Other words in angle brackets, such as `<path>`, `<title>` or `<session>`, are
yours to fill as the step says. If the instructions are not in front of you, AGENTS.md states most of these
values; for one it does not state, ask the person rather than guess.

### More than one contexture connector

Someone in several stores has one connector per store, and each one's instructions name its own store and
values. Use the connector of the store the person names, with that store's values, and ask when it is unclear
which store they mean. A session, a path or a value from one store's connector never goes to another's.

### A step this connector does not offer

The skills update when contexture releases, and a store's server can run an older ctxr: *This store* gives
the version it runs. When a step names a tool the connector does not list, or the `ctxr` or `ctxr_write`
tool refuses a command the step names as one it does not run, tell the person that this store's server runs
an older ctxr, then skip that step or take the nearest step the connector does offer. Never improvise a
replacement for a step that writes.

### Sessions across conversations

The server keeps a session between conversations, but it cannot tell two conversations apart. At the
start of a conversation, call `session_list` and mention each open session: what it holds uncommitted,
and any requested changes on its pull request. Work in the session the person names, or start one.

Where the skill hands off to a skill this environment does not carry, such as landing or upgrading, or
asks you to work inside a store mounted under `shared/`, that step is not yours here: a person lands an approved change from the store's approval page.

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Submit

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
   `--diff` when you need the changes themselves. It fetches `<default branch>` and reports what is
   uncommitted, the diff stat of committed and uncommitted work, and the commits ahead of
   `origin/<default branch>`. State moves under you while you work; name the delta from the previous scan
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
   branch, pushes, and opens the pull request against `<default branch>`, or updates the one already open
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

What the person typed after /ctxr:submit, to start from: $ARGUMENTS
