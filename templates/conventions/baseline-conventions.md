---
title: Baseline conventions
description: Contexture's shipped conventions, rendered from this store's own configuration.
---
## Links and the relation vocabulary

Wikilinks (`[[Note Name]]`) are the edges the graph is built from. A dangling link is a candidate note or a typo, not an error.

__RELATION_VOCABULARY__

## Archiving

Retire a note with `ctxr archive <path>` — one tracked rename into `__ARCHIVE_DESTINATION__`, the note unchanged — never a status tag on a note left in place.

## Git and sessions

Nothing reaches `__DEFAULT_BRANCH__` un-gated: work happens in a session worktree under `__WORKTREES_PATH__` and lands through a reviewed pull request (`ctxr-submit`, then `ctxr-land`). The pre-push hook refuses a direct push to `__DEFAULT_BRANCH__`; `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH=1` overrides it, for genuine emergencies only.

## Directory-scoped conventions

A folder may carry its own `README.md`; read it before changing anything inside that folder.
