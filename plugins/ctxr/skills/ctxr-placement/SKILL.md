---
name: ctxr-placement
description: Choose the right taxonomy layer and location for a new or relocated note in this contexture store, with the reasoning.
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

# Placement

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

`ctxr archive <path>` to retire it; a plain tracked `git mv` for an ordinary re-placement. Either way the
note's frontmatter is left untouched.

## Verify

`ctxr lint` for orphans and catalog gaps; `ctxr doctor` for anything that blocks a submit.
