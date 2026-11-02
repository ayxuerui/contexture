---
name: ctxr-connection-proposal
description: Discover the links a note should have, read each candidate before proposing, group by the store relation vocabulary, and write only approved links.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Connection proposal

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

Link DISCOVERY — complementing `ctxr-connection-finding`, which traverses links that already exist.

1. Read the target note in full. If given a name instead of a path, find the file; several candidates →
   ask which one, never pick.
2. Extract its key concepts, entities (people, organizations, products), claims, and tags.
3. Search the store with those terms: content search (grep) for the phrases, the catalog section for the
   domain (`ctxr catalog show --section <id>`), and `ctxr graph query neighbors <path> --depth 2` for
   two-hop candidates the note does not link directly.
4. Read every candidate before proposing it. A keyword match is not a connection; each proposal states in
   one line why the link is meaningful to a reader of the target note.
5. Group proposals by the relation vocabulary the connector's instructions list under *This store*, each
   with its definition. The section headings carrying these names are what `ctxr graph build` types edges
   from, so a link written under the right heading becomes a typed edge on the next build. Format each item
   as `[[Note]]` — reason. Choose between two adjacent relations by their definitions, not their names, and
   remember that an edge is recorded only on the note carrying the link.
6. Confirm before writing: present the grouped proposals and wait for approval by item. Do not write on
   silence or on plan-level agreement.
7. Write approved links into the matching section of the target note, creating the relation sections the
   sibling notes use when the note lacks them. No other edits to the note in the same pass.
8. Report: notes scanned, proposals per group, links written, and nearby orphans
   (`ctxr graph query orphans`) that would also benefit from linking.
