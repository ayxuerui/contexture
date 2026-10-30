---
title: Baseline conventions
description: Contexture's shipped conventions, rendered from this store's own configuration.
---
## Writing notes

- Write in outliner bullets, not prose paragraphs, unless asked otherwise. Link liberally with wikilinks, and when you create a note, search the store and suggest links to what already exists.
- Extend what a note says rather than overwrite it, unless a rewrite is asked for.
- Keep a note's `title:` equal to its filename stem, unique in the store: the catalog builds each entry's wikilink from `title:`, so a divergent title links to nothing.
- A task is a checkbox with a dated parenthetical: `- [ ] Task (added YYYY-MM-DD, due YYYY-MM-DD)`, `- [~] Task (added YYYY-MM-DD)` while in progress, `- [x] Task (done YYYY-MM-DD)`. Omit a date that does not apply.

## Explaining

When you explain something to the operator, write about 80% of the way to ASD-STE100: one fact per sentence, at most 20 words to instruct and 25 to describe, active voice, one word for one thing, lists for three or more items, numbers over vague words. Keep the store's names as written. Give each reason its own `Why:` sentence. Copy quotes, output and report tables unchanged.

Draw a diagram when structure, flow or sequence would take a paragraph: fenced `mermaid` in notes, pull requests and answers; inline SVG in pages.

## What stays out of the store

- Credentials and full card or account numbers never enter it — the last four digits only.
- Scratch and intermediate files go in `__SCRATCH_PATH__`, never the store or `$HOME`. Deliverables are not scratch: a page goes under `__PUBLISH_PATH__`, a note into the store.
- Notes carry no access control — whoever reads the store reads all of it. Place sensitive material deliberately, and say in the note when it must not be quoted onward.

## Installing tools

- Install a tool you need as your own user, with its publisher's own installer, into your home — never with `sudo`, and never into the store.
- For an npm package, `npm install -g` is right when `npm config get prefix` is in your home. When it is not and the install is refused, report that and stop: where npm installs is the operator's decision.

## The store log

`__LOG_PATH__` is append-only: after an ingest, a lint pass, or a structural change, add `## [YYYY-MM-DD] <kind> | <title>` and a few bullets. At session start, if its last `lint` entry is more than seven days old or missing, suggest a lint pass.

## Links and the relation vocabulary

Wikilinks (`[[Note Name]]`) are the edges the graph is built from. A dangling link is a candidate note or a typo, not an error.

__RELATION_VOCABULARY__

## Archiving

Retire a note with `ctxr archive <path>` — one tracked rename into `__ARCHIVE_DESTINATION__`, the note unchanged — never a status tag on a note left in place.

## Git and sessions

Nothing reaches `__DEFAULT_BRANCH__` un-gated: work happens in a session worktree under `__WORKTREES_PATH__` and lands through a reviewed pull request (`ctxr-submit`, then `ctxr-land`). The pre-push hook refuses a direct push to `__DEFAULT_BRANCH__`; `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH=1` overrides it, for genuine emergencies only.

## Directory-scoped conventions

A folder may carry its own `README.md`; read it before changing anything inside that folder.
