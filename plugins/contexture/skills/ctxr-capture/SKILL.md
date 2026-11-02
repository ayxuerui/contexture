---
name: ctxr-capture
description: Bring material from outside the store into the inbox as a faithful record carrying its source identity, then hand off to ingest.
---

<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->

# Capture

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

Capture is how material from outside the store becomes something the store can cite. It ends at the
inbox, not at a note: what the store should know from this material is the next skill's question, and
answering it here is how a capture quietly turns into someone's paraphrase of a source nobody kept.

## 1. Find the material

If this store ships a `ctxr-capture-<source>` skill for the material's source, retrieve through it. Such a
skill knows which of that source's items this store owes, and writes each one into the inbox as the verbatim
record, already carrying its identity. Then continue here at step 2 with what it wrote: everything below still
applies to it, and a record you did not write yourself is checked, not trusted.

Otherwise, work with whatever the harness has actually connected — a tool that can read the source system, a file
on disk, a URL the user handed you. Do not assume any particular one is available, and do not guess at
one: look at what is there, and if nothing can reach the material, say so and ask rather than
reconstructing it from memory or from what the user said about it.

Before a research pass on a topic, query the connected meeting and note sources for it first, and capture
what they hold. Desk research is the expensive move, and nothing else catches primary material that was
never captured, because every other check runs on what the store already holds.

When a source system returns several items and the request named one, confirm which before writing.
Capturing the wrong meeting is not recoverable by a later ingest — it is a record of something that did
not happen.

## 2. Write the record, not your reading of it

A capture is the source's own account, in the source's own words. Copy it through. Do not condense it,
do not reorder it, do not fix its grammar, and do not drop the parts that look redundant — a capture
that has been improved is no longer evidence of anything.

Where the source supplies a summary of its own, keep it, clearly marked as the source's derivation, in
its own section beside the record rather than instead of it. A summary is what a service concluded; the
record is what happened. A store may require, per source type, the section its captures must carry — if
it does, a capture missing that section is refused at ingest, and so is one whose heading has nothing under
it or appears only inside a code block, so check the store's configuration before deciding a summary is
enough.

Perishable material — a promotion, a price, an offer with an end date — is kept for its durable mechanic,
not its momentary state: capture how it works, and keep the state that will change in a section a later
capture overwrites.

A file a note links to or displays (a PDF it cites, an image it shows) lives under `<capture root>assets/`,
never in a folder of its own beside the notes.

Several items from one source system covering the same occasion (two recordings of one meeting, a
transcript and its summary) are one source. Check them against each other by content and named entities —
string matching misses the same speech transcribed twice — and when they share an event, say so in each
capture and name which governs. A fact appearing in both is never corroborated by the pair. Where one
rendering is demonstrably worse, keep it and record its specific errors rather than discarding it.

When a source does not separate speakers, or labels them generically ("Participant 2"), or its own summary
gives a position or a role to the wrong person, say so in the capture as a caveat on the whole file. Name who
a label most likely is only where the record itself makes it clear. Any attribution built from it is inference,
and a service's own summary attributing positions to named people is not the record.

A slide deck is read as images, not extracted text: render its pages and read those, since a deck's meaning
lives in its layout.

One capture per item. Two meetings in one file cannot be cited separately, deduplicated separately, or
retracted separately.

## 3. Give it an identity

In the capture's frontmatter:

- `source_type` — the source system's own name, lowercased. Use the same value the store already uses
  for that system; a second spelling silently defeats deduplication. Name the same value on
  `ctxr ingest --source-type`: a capture that says one source type and is ingested as another is refused,
  and a store's required section is looked up under the type the capture is recorded under.
- `source_id` — that source type, then a slash, then the identifier the source system itself uses for
  this item. Prefer an opaque, stable id over a title or a date, which get edited. Material no system
  identifies takes a hash instead: a file its SHA-1 (`pdf/<sha1 of the file>`), pasted text the SHA-1 of the
  text (`manual/<sha1>`). An email is its `Message-ID`; a web page is its URL, which `ctxr source check`
  compares with the store's tracking parameters (`ingest.tracking_params`) removed. Pass the same prefixed form
  to `ctxr ingest --source-id`, which refuses one that does not begin with its source type.

Do not write `source_hash` or `ingested`. Ingest assigns both, once, and a capture that arrives
claiming them is treated as already ingested.

Material that is not markdown cannot carry frontmatter, so write a markdown file beside it naming it in
`capture_file`. The two travel together from here on, and the required-section rule looks at the
markdown, not at the bytes.

## 4. Check before you write it into the inbox

If the material may already be in the store, run `ctxr source check <path> --source-id <id>` and read
the verdict before going further. That check compares material you already hold; before fetching
anything, search `<capture root>` for it by content and by `capture_file`. The retrieval pass leaves
that directory out, so a search scoped by it will never find a capture. Re-capturing something the store already holds is how one source ends
up cited twice under two identities.

Then write the file into `<inbox path>`. Nothing else — no note, no edit to an existing note, no
placement decision.

## 5. Hand off

Say what you captured and where it landed, then stop and let `ctxr-ingest-orchestration` take it: what
the store should know after this material, which note it changes, and whether it needs a note at all is
that skill's decision table, and it reads the existing cluster before answering. A capture that has been
filed straight into a note has skipped the only step that asks whether the store needed a new one.
