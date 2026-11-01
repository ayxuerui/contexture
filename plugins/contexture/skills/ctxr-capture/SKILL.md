---
name: ctxr-capture
description: Bring material from outside the store into the inbox as a faithful record carrying its source identity, then hand off to ingest.
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

# Capture

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
