---
name: ctxr-ingest-orchestration
description: Capture raw material into the inbox, run the dedupe check, read the existing cluster, decide new/update/merge/restructure, and ingest with source identity via the contexture CLI.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Ingest orchestration

## Which store, and where

This skill runs in a shell that runs `ctxr`, or through a contexture store's server. Settle two things first.

**Which store:** the one the person means. With several contexture connectors attached, use that store's,
and ask when it is unclear. Nothing from one store's connector goes to another's.

**Where:** in a checkout of that store (a `contexture.yaml` at the working directory's root and a shell
that runs `ctxr`), follow each step in the shell as written, even when the store's connector is attached
too. Otherwise work through the store's connector:

- A `ctxr session <verb>` step is the tool `session_<verb>`; `session_start` takes the session's name as
  `label`. Every other `ctxr` step is the `ctxr` tool, or `ctxr_write` when it writes, with the words after
  `ctxr` as `args`, one per entry: `ctxr lint` is the `ctxr` tool with `args` set to `["lint"]`.
- A command's options are the tool's fields, named without the dashes. `session` names the session's
  directory, which `session_start` returns and `session_list` lists; `ctxr_write` always needs one. A file
  you prepared goes as `input`, with `@input` in `args` where its path goes.
- Paths go under the session's root: the note `work/a.md` is `<worktrees path><directory>/work/a.md` for
  `Read`, `Edit`, `Write`, `Move`, `Delete`, `Grep` and `Glob`. A path outside a session reads the store as
  last approved and cannot be written. Commits, pushes and pull requests happen only in `session_submit`.
- The server keeps sessions between conversations but cannot tell conversations apart. At the start of
  one, call `session_list` and mention each open session, what it holds and any requested changes.
- Landing, upgrading and work inside a store mounted under `shared/` are not done through the server. A
  person lands an approved change from the store's approval page.
- When a step names a tool the connector does not list, or the `ctxr` tool refuses a command as one it
  does not run, the server runs an older ctxr (*This store* gives its version). Say so, then skip the step
  or take the nearest one offered. Never improvise a replacement for a step that writes.
- A store setting written as a placeholder, such as `<inbox path>` or `<default branch>`, takes the value
  the connector's instructions give under *This store*, inside a path too. AGENTS.md states most of them;
  otherwise ask.

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
