---
title: Baseline conventions
description: Contexture's shipped conventions, rendered from this store's own configuration.
---
## Writing notes

- Write in outliner bullets, not prose paragraphs, unless asked otherwise. Link liberally with wikilinks, and when you create a note, search the store and suggest links to what already exists.
- Extend what a note says rather than overwrite it, unless a rewrite is asked for.
- A task is a checkbox with a dated parenthetical: `- [ ] Task (added YYYY-MM-DD, due YYYY-MM-DD)`, `- [~] Task (added YYYY-MM-DD)` while in progress, `- [x] Task (done YYYY-MM-DD)`. Omit a date that does not apply.

## What stays out of the store

- Credentials and full card or account numbers never enter it — the last four digits only.
- Scratch and intermediate files go in `__SCRATCH_PATH__`, never the store or `$HOME`. Deliverables are not scratch: a page goes under `__PUBLISH_PATH__`, a note into the store.
- Notes carry no access control — whoever reads the store reads all of it. Place sensitive material deliberately, and say in the note when it must not be quoted onward.

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
