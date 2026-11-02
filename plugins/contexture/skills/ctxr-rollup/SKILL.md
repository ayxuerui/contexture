---
name: ctxr-rollup
description: Regenerate the synthesized current-state region of an entity note from every source that references it, with provenance for every fact.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Rollup

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

Regenerate the machine-synthesized current-state region of an entity note (a person, organization,
product, initiative, or topic hub) from every note that references it. Hand-written content outside the
fenced region is never touched.

Run `ctxr rollup stale` (or `--for <entity>` for one) to find entities worth re-rolling — it lists every
entity note whose backlinks have moved since its last synthesis, or which has never been rolled up at
all; use it instead of guessing from memory which entities are out of date.

An entity under `shared/<name>/` belongs to a mounted store. Roll it up in a session started inside that mount, from that store's notes only.
Why: a rollup that quotes this store's notes would show them to every reader of the mount.

1. Resolve, never create. `<entity>` is a path or a note name; several candidates → list them and ask.
   When a location has more than one plausible hub, prefer the shorter-named, undated one. If no entity
   note exists, STOP and say so — creating it is a separate task, not a side effect of a rollup.
2. Refuse non-entities. Dated notes, journal entries, meeting notes, generated files, and store
   infrastructure are INPUTS to rollups, not entities. If the name resolves to one of those, stop and ask
   which entity was meant.
3. Gather: `ctxr rollup gather <entity>` enumerates the candidate sources (notes linking to it). Fewer
   than 3 accepted sources → push back ("only N notes reference this; a rollup would be thin — continue?")
   and do not auto-continue.
4. Read EVERY accepted source, not a sample — the value of a rollup is total recall over the entity's
   corpus. Per source note its date (filename, frontmatter, then mtime as a last resort), its kind, and
   what it says about THIS entity specifically. For a long source, grep for the entity first.
5. Synthesize into a file, in this shape — bullets throughout, short clauses; skip any empty subsection
   silently (never "N/A", "none", or "TBD"):

   ```
   ## Current state
   ### Status            — one fact per line; what it is, what is happening now, headline problem or metric
   ### Recent activity   — `YYYY-MM-DD — what happened [[Source]]`, most recent first
   ### Open threads      — unresolved decisions, blockers, pending actions; each links where it was raised
   ### Key people        — `[[Person]] — role in this entity's orbit`; only people present in the corpus
   ### Sources           — every note consulted, sorted; the audit trail
   ```

   Provenance rules: every fact traceable to a source note — nothing from memory or earlier conversation;
   no editorializing or recommendations; nothing dated later than today; inline `[[wikilinks]]` when one
   claim has one clear source.
6. Write: `ctxr rollup write <entity> --content-file <file>` — an idempotent fenced write (`changed: false`
   and a byte-identical file when the content matches; mismatched markers abort with nothing written).
7. Report: entity path, sources accepted, `changed` or unchanged, and notable findings (e.g. the oldest
   unresolved thread). Anything outside the fence you want to fix is a separate, explicit edit.
