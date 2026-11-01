---
name: ctxr-ingest-orchestration
description: Capture raw material into the inbox, run the dedupe check, read the existing cluster, decide new/update/merge/restructure, and ingest with source identity via the contexture CLI.
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

# Ingest orchestration

Ingest is synthesis, not filing. The question is what the store should know after this source, not where
to put the file — "create a new note" is one option among several, never the default.

1. Capture: write the material into the inbox (see AGENTS.md's capture section). It may already carry
   `source_type` and `source_id`; it must carry neither `source_hash` nor `ingested`, which ingest assigns.
   The capture is kept — it is the store's record of what arrived, and it never becomes the note.
2. Check: run `ctxr source check <path> --source-id <id>` and read the verdict — `new`, `already_ingested`,
   `drift` (same identity, the source's content moved — read what changed and decide whether to update the
   note, then `ctxr source stamp <path> --id <id>` once resolved), `alternate_source_match`, or
   `multiple_matches`. On `multiple_matches`, stop and resolve the ambiguity yourself; never guess which
   existing record it is. A record with an identity but no hash on file: `ctxr source stamp` backfills it.
   A source re-published under a new URL you've confirmed is the same material:
   `ctxr source add-alt <path> --id <new-id>` on the existing capture, not a second ingest.
3. Read the source fully. Then read the existing cluster BEFORE writing anything: the catalog section for
   the domain (`ctxr catalog show --section <id>`), every related note in it (all of them, not one or two),
   and the graph (`ctxr graph build`, then read the graph document it writes at
   `<graph document>` for hub notes by cluster and cross-cluster bridges; `ctxr graph query hubs`
   and `ctxr graph query neighbors <path>` on the closest note for the detail). Ask: what does the
   store already know, and does this source confirm, extend, contradict, or nuance it?
4. Decide — the decision table:

   | The source… | Action |
   |---|---|
   | adds a genuinely new concept | create a new note |
   | deepens an existing note | update and expand that note |
   | makes two notes redundant | merge them; fix every cross-link |
   | reveals a note is badly structured | recreate it with better structure |
   | belongs as a section, not a page | add a section to the existing note |
   | does several of the above | do all of them |

   - Hub check: if the cluster's hub already covers this, update the hub. If this source could become a
     hub — a note many future notes will reference — create it at hub level, not as a leaf.
   - Bridge check: if the source connects two clusters that have no bridge note, create one or add
     explicit cross-links.
   - Thesis-change rule: when new material contradicts a note, patch its top-level conclusion FIRST, then
     hunt down the now-stale verdict language further down. A corrected body under an uncorrected
     headline is worse than either alone.
   - Source discipline: a field the source does not confirm is "not reported" — never inferred from
     silence in either direction. A quantity the store did not verify carries who claimed it, when, and
     in what setting ("founder-claimed, 2026-09-16, recruiting pitch"): stripped of its setting, a pitch
     number and a filed number look identical later. Say when a figure is checkable and unchecked.
5. Write the note the decision calls for — create it, expand it, merge, restructure, or add a section —
   preserving prior content in every case but the deliberate rewrite. A NEW note starts from a template
   under `<templates path>`, with `{{title}}` and `{{date}}` substituted as you write (`ctxr-placement`
   picks which). An EXISTING note is extended in place — never re-cut from a template, which would throw
   away the content that made it worth expanding.
6. Register the source against whatever note you just wrote:
   `ctxr ingest <path> --into <note> --source-type <type> --source-id <id>`. Every row of the table above
   ends here, not just the first: the command retains the capture under the capture tier's month, freezes
   its hash, cites it from the note, and rebuilds the catalog. A note that was expanded rather than created
   records its provenance exactly as a new one does, and a note built from several sources cites all of
   them. A deliberate ingest despite an `alternate_source_match` is the same command.
7. Verify: `ctxr lint` (orphans, broken links, material still in the inbox) and `ctxr catalog check`.
8. Log it: append `## [YYYY-MM-DD] ingest | <title>` to `<log path>`, with a bullet naming the note it informed
   and what changed there.
