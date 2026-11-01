---
name: ctxr-mission
description: Keep the store's mission core current — the primary mission, the top priorities in rank order with status/purpose/next action, and what is not now — with the back burner, sunset candidates, and open debt in a linked register; propose changes and write only on the operator's confirmation.
---

## Before this skill: the store's tools stand in for a checkout

### In a checkout, use the store's own skill

If the working directory has a `contexture.yaml` at its root and a shell here runs `ctxr`, you are in a
checkout of the store, and this text is not for you. The `contexture:`-namespaced skills and commands, such as
`contexture:ctxr-capture` and `/contexture:capture`, are this plugin's, written for the store's server. The
un-namespaced `ctxr-<name>` skills in the store's skills folder are the store's own, written for a checkout.
In a checkout, invoke the un-namespaced `ctxr-<name>` skill of the same name and follow it, never the
`contexture:` one, and ignore the rest of this text. A `/contexture:` command typed in a checkout asks for that store
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

# Mission

Keep this store's mission current: the short core every agent sees on every turn, inlined into AGENTS.md's
"Mission" section from the document named on its source line. The core is the operator's statement of what
matters now, so it is small, ranked, and dated. Everything else it once carried lives in a register note it
links to. Hand-written content outside the fenced region is never touched.

Run `ctxr rollup stale` (or `--for <mission_path>`) first. A mission never confirmed, or one confirmed more than
`organize.rollup_stale_days` ago, is reported stale on elapsed time alone; `ctxr lint` also reports any due date
in it that has passed. Use those rather than guessing from memory whether it is out of date.

1. Resolve `<mission_path>` from the source line of AGENTS.md's "Mission" section. If no mission document is
   configured for this store, STOP — this skill has nothing to maintain; do not invent a path or create one
   unasked.
2. Gather from recent work: the current session's own changes, the store log at `<log path>`, and every store
   location the taxonomy declares (read AGENTS.md's "Placing a new note" section for the configured layers) —
   not backlinks, and not a sample. A priority absent from every configured layer is not a store priority; treat
   it as the operator's own working memory instead and leave it out.
3. Write the core, and only the core:
   - **Primary mission** — one or two lines on what this store is for, right now.
   - **Top priorities, in rank order** — three to five. Each names its status, its purpose, and its next useful
     action; a priority with no next action is not actionable, and one with no purpose is not a priority —
     resolve or downgrade it rather than carry it silently.
   - **Not now** — what is deliberately set aside, one line each, so it is not mistaken for forgotten.

   The core stays under `<mission size limit>` bytes; `ctxr doctor` fails above it. Per-item detail an agent
   already finds elsewhere (a project's own next action, a status its note carries) is linked, not copied.
4. Keep the register in a note the core links to, placed by `ctxr-placement` like any other: back-burner items,
   each stating plainly why it is not active right now (a size cutoff, a blocking dependency, a deliberate
   deprioritization); sunset candidates (work whose end state is in sight or whose relevance is fading); and
   open operational debt (deferred cleanup, known gaps, workarounds owed a real fix). Debt that is closed is
   history: record it in `<log path>` and remove it.
5. Propose, then write. The ranking and the mission are the operator's: show the proposed core and say what
   moved and why, and write only once the operator confirms. A factual correction — a priority shipped,
   blocked, or archived — is yours to make, and you say so in the report.
6. Synthesize into a file — bullets throughout, short clauses; skip any empty section silently (never "N/A",
   "none", or "TBD"). Nothing dated later than today; no editorializing beyond the shape above.
7. Write: `ctxr rollup write <mission_path> --content-file <file>` — the same command `ctxr-rollup` uses for an
   entity, applied here to the store's own mission path. It stamps the confirmation date AGENTS.md shows, and
   is an idempotent fenced write (`changed: false` and a byte-identical file when the content matches;
   mismatched markers abort with nothing written).

## Report

Mission path, `changed` or unchanged, what moved since the last write (a priority resolved, re-ranked, or
added; an item moved to the register), and any factual correction made without confirmation. Anything outside
the fence you want to fix is a separate, explicit edit.
