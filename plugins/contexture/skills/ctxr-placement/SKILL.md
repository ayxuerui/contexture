---
name: ctxr-placement
description: Choose the right taxonomy layer and location for a new or relocated note in this contexture store, with the reasoning.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Placement

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

Decide where a note lives BEFORE writing it, and say why: the caller wants the reasoning (which layer, why
this location over its sibling, what would promote it) so they can push back — not a
folder name. Answer the questions in order; stop early only when the content clearly resolves.

## 0. Which store?

Skip this step when the store mounts no other stores under `shared/`. `AGENTS.md` lists the mounts.

- Ask who may read the note before you ask where it goes.
- Place the note in this store by default. Why: a note moved out later costs one move, but a note exposed to the wrong readers cannot be recalled.
- Place it in a mounted store only when every reader of that store may read it. Why: everyone who can clone a store reads all of it.
- For a note in a mounted store, answer the questions below against that store's own taxonomy. Its own `AGENTS.md` lists its layers.
- Write it in a session started inside that mount, as `ctxr-session-lifecycle` describes.

## 1. Which layer?

The connector's instructions list this store's layers, each with its description, under *This store*;
AGENTS.md's "Placing a new note" section lists them too. Choose by what the content fundamentally IS, not by
surface keywords; a label on a location says nothing about what is actually kept there.

- A layer whose description names an end state, a finish line or a deadline takes only what has a finish
  line: if it never closes, it does not belong there. An item in that layer that can never close is a smell
  — it either clutters the layer as open-forever or gets retired prematurely. Never create one on purpose;
  an ongoing responsibility with a standard to maintain belongs in a layer whose description says so.
- A layer whose description says it holds completed, abandoned or inactive items is where the other layers'
  finished or dropped items go — never a first placement. Retire a note with `ctxr archive <path>` (a
  tracked move; frontmatter untouched).

If the store lists no layers, there is no layer decision: place the note next to the notes it will link to
most (`ctxr graph query neighbors <path>` on the closest existing note shows that cluster) and let wikilinks
carry the structure. If no layer fits, use the catch-all location AGENTS.md names and revisit the placement
later.

## 2. Which location within the layer?

- Match on what the content IS. When two sibling locations both seem to fit, name the distinction between
  them (abstract vs concrete; outward-facing vs inward-facing; who-we-are vs how-it-runs) and pick by
  altitude and audience, not by keyword.
- If the chosen location has a `README.md`, read it first: a folder with one answer about what its notes
  look like states it there, and that answer wins over anything you would infer.

## 2b. Which template?

Start a new note from a template under `<templates path>` — never a blank file, and never by copying a
sibling wholesale. List that directory and pick the kind the content actually is; `Note` is the base when
nothing more specific fits, and it is also the file to copy when this store needs a kind it does not have.
Substitute `{{title}}` and `{{date}}` as you write — no command expands them, and `ctxr lint` reports a
note that lands with one still in it.

The template is the starting shape, not a cage: delete a section that does not apply rather than leaving
it empty, and add one the note needs. Read a sibling note only for what the template leaves open — house
phrasing, bullets vs prose, which tags this location uses.

## 3. Sub-item under an existing location, or a new top-level one?

Default to a sub-item until it earns promotion. A near-empty top-level location is its own kind of
clutter — worse than a slightly crowded existing one. Starting small and promoting later is cheap;
starting big and hollow is not. Make the promotion trigger a rule, not a vibe, and write it INTO the
note: "Promote to its own top-level location the moment this holds 3+ distinct notes or topics."

A unit that will carry supporting notes (a project with its research, an exploration with its evidence)
gets a folder of its own. The graph clusters notes by their first `<cluster depth>` path segments, so
grouping such units under one common parent at that depth merges their clusters, and the graph then asserts
a relationship between them that does not exist.

## 4. What must never enter the store?

Credentials, full account numbers, and secrets never enter the store — last-4 only. This is a placement
input, not a cleanup step: if the content cannot be written without them, it does not belong here.

## Perishable vs durable

One capture often mixes a durable fact with perishable specifics. The durable part (the reusable
structure, mechanic, or trap) goes into the permanent note. The perishable part (this period's values,
links, boilerplate) goes into a fenced `contexture:<region>` block you OVERWRITE on each refresh, never
an accumulating pile of dead entries. Do not ingest a perishable item as source material — that
manufactures an artifact for the graveyard; capture the durable slice by hand instead.

## Wire it in

Add a one-line wikilink from the relevant hub note so the new note is not an orphan; `ctxr lint` flags
orphans and notes without a catalog entry.

## An existing note

A note that already exists is EXTENDED, never restarted from a template: add the section it now needs,
preserve what is there, and leave its frontmatter alone. Re-cutting a note from a template to "bring it up
to standard" destroys the content that made it worth keeping — a note that has outgrown its starting shape
is doing the right thing.

## Relocating an existing note

`ctxr archive <path>` to retire it; for an ordinary re-placement, a plain tracked `git mv` in a shell, or the `Move` tool through the store's server. Either way the
note's frontmatter is left untouched.

## Verify

`ctxr lint` for orphans and catalog gaps; `ctxr doctor` for anything that blocks a submit.
