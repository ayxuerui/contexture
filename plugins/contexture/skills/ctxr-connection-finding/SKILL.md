---
name: ctxr-connection-finding
description: Traverse the wikilink graph of the store (neighbors, paths, hubs, orphans) to find what a note already connects to.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Connection finding

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

Traversal of links that already exist. To discover links a note SHOULD have, use `ctxr-connection-proposal`;
to synthesize an entity's current state from its sources, use `ctxr-rollup`.

1. Run `ctxr graph build` to refresh the wikilink graph from the store's current notes, then read the graph
   document it writes at `<graph document>` — hub notes by cluster, cross-cluster bridges,
   orphans — for the cluster context the point queries below do not summarize.
2. To find what a note connects to or from, run `ctxr graph query neighbors <path>` (add `--depth` for
   further hops, `--direction in|out|both`, `--type <relation>` to follow one configured relation).
3. To read a neighbourhood rather than enumerate one — every reachable note with its catalog gloss,
   hop distance, and why it was reached — run `ctxr context gather --seed <path> --hops <n>`. Use it
   when you need to judge which links matter; use the point queries below when you need the structure.
4. To find a path between two notes, run `ctxr graph query path <from> <to>`.
5. To find the most-referenced notes, run `ctxr graph query hubs`; to find unlinked ones,
   `ctxr graph query orphans`; `ctxr graph query clusters` and `ctxr graph query bridges` show the
   cluster structure and the notes that span it.
6. When the store mounts other stores under `shared/`, the graph carries their notes under `shared/<name>/`.
   Link from this store into a mount with a path link, such as `[[shared/<name>/<path>]]`.
   A filename link resolves only inside the store that holds the note. A note in a mount never resolves a link back into this store.
7. Report what the graph says — it enumerates structure and ranks nothing; judgment about which links
   matter is yours.
