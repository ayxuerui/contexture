---
title: Baseline conventions
description: Contexture's shipped conventions, rendered from this store's own configuration.
---
<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; this store's own conventions belong in house-conventions.md alongside it. -->

These are the rules that hold regardless of which operation you're doing; a skill states the procedure for one operation.

## Visibility

The visibility field is `__VISIBILITY_FIELD__:`. It resolves in this order: (1) an explicit value in the note's own frontmatter; (2) a directory default declared in `contexture.yaml` for the note's path; (3) failing both, the configured default context, `__DEFAULT_CONTEXT__` — run `ctxr note resolve <path>` to see which step produced a given note's value.

Configured directory defaults:

__DIRECTORY_DEFAULTS_TABLE__

If a note's placement is ambiguous between two contexts, resolve to the more restrictive one rather than guessing broad — promote it later if it proves reusable.

Exclusion from retrieval (`retrieval.exclude_paths`, the leg-routing section above) is a path decision, never a visibility value — a path being excluded and a note's visibility are two independent axes. Do not invent a visibility value to mean "not indexed"; if a location should never be retrieved, its path belongs in `retrieval.exclude_paths`, not in a note's visibility field.

## Disclosure

`ctxr check <path> --audience <name>` decides whether a note's content may flow to an external audience, evaluated in this fixed order — a rung, once it produces a verdict, is final:

1. **Hard walls** — configured rules matching the note's path or the audience, evaluated before anything else.
2. **Explicit audience tag** — an `audience:` value on the note matching the requested audience.
3. **Internal-audience rule** — derived from the note's resolved visibility, for an audience configured as internal.
4. **External default** — no rule matched: **ASK**, never a silent ALLOW or DENY.

Configured hard walls:

__HARD_WALLS_LIST__

Configured internal audiences:

__INTERNAL_AUDIENCES_LIST__

Run `ctxr check <path> --scan` to check one note for a marker leaking across a wall.

## Links and the relation vocabulary

Wikilinks (`[[Note Name]]`) are the edge substrate the graph is built from. A dangling link — pointing at a note that doesn't yet exist — is a candidate for a new note or a typo, not an error; nothing about it needs fixing before a commit.

__RELATION_VOCABULARY__

## Archiving

`ctxr archive <path>` retires a note via a single tracked rename into `__ARCHIVE_DESTINATION__`, preserving its git history and its visibility value unchanged — never a status tag on a note that stays in place. It reports every other note that links to the archived one, so those links can be reviewed; a dangling link left behind is not itself an error (see Links, above).

## Git and sessions

Nothing reaches `__DEFAULT_BRANCH__` un-gated — every write happens inside a session worktree under `__WORKTREES_PATH__`, landed only through a reviewed pull request (see the Write path rule above).

Landing (`ctxr-land`) fast-forwards the store's canonical clone itself once a PR merges — `git fetch origin && git merge --ff-only origin/__DEFAULT_BRANCH__`, run from that clone — as long as it is on `__DEFAULT_BRANCH__` and can fast-forward cleanly from its remote; if it can't (diverged, no remote, or already elsewhere), the skill reports why instead of forcing it, and the clone is never checked out, reset, or discarded to make it fast-forward.

The pre-push hook refuses a direct push to `__DEFAULT_BRANCH__`; `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH=1` is its emergency override — for genuine emergencies, not routine use. A generated harness permission config (for example, a harness-generation adapter's `.claude/settings.json`) anchors any absolute path it invokes — such as the write-gate hook's command — at the store's main worktree, never at whichever checkout happened to run the generator, so it keeps resolving after the session worktree that generated it is gone.

## Directory-scoped conventions

Some folders may carry their own conventions that apply only when working within them — typically as a `README.md` at that folder's root. Read a folder's own `README.md`, if it has one, before making changes inside it; nothing else in this store scans for these automatically.
