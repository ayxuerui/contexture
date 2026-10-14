1. Run `ctxr lint` for the full health report — orphan notes, broken links, uningested inbox material,
   catalog gaps. It always exits 0; its findings are observations for judgment, never a block.
   After a lint pass, append `## [YYYY-MM-DD] lint | <one-line summary>` to `__LOG_PATH__`, with a bullet per
   finding class you acted on — the log's last `lint` entry is how the next session knows one is due.
2. Run `ctxr doctor` for the invariants that DO block: catalog coverage, hook health, and more. Address doctor's failures before `ctxr-submit`; it runs the same checks.

## Placement review

The diagnostic that works: "what standard am I maintaining here, and what is my review cadence?" A
location reviewed on a cadence is an ongoing responsibility; one touched only when its material is needed
is reference — whatever its label says. Apply a file-count sanity check first: dozens of reference
readings under a responsibility label is drift. Watch for topic libraries creeping back into layers
organized by actionability. Single-note calls go through `ctxr-placement`.

## Retiring: move, don't tag

A status tag left in place defeats the layer — the active layers must show only active work.
`ctxr archive <path>` moves the note to the same path beneath `__ARCHIVE_DESTINATION__` as a tracked rename, so
the archive still shows where it lived and the reverse rename restores it. The note's frontmatter travels unchanged
(never rewrite it on the move). Retiring is reversible cold storage, not deletion. Verify with `git status --short` showing `R` (a rename, history preserved), not a delete
plus an add, then `ctxr catalog check`.

A unit that lives as a folder of notes (a project with its supporting notes) is retired whole —
`ctxr archive <folder>` moves it to `__ARCHIVE_DESTINATION__<folder>` as one tracked rename. Archiving its notes
one by one leaves the unit half-retired until the last one moves.

Every retirement records, in the past tense, what happened and when it was retired — in the hub note for a
folder, as a blockquote at the top of a single note — so the item reads as a record, not as live work. When the
item was one of the mission's priorities, hand it to `ctxr-mission`, which proposes what takes the freed slot.

## Stale rollups

`ctxr lint`'s rollup-stale finding (and `ctxr rollup stale` directly) names entity notes whose backlinks
have moved since their last synthesis, or which have never been rolled up — hand each one to
`ctxr-rollup` rather than re-synthesizing ad hoc.

## Disposable pages and drifted pages

`ctxr lint` lists disposable pages that are older than 30 days. Each one is a removal candidate, not a
removal. Do these steps:

1. Show the list to the operator as a proposal, with each page's age. Ask which pages to remove.
2. Remove only the pages that the operator approves. Why: somebody can still have the link to a
   disposable page, and a removal breaks that link.
3. Do the removal in a session, on its session branch, with `git rm -r <page folder>`.
4. Land the removal through `ctxr-submit`. Its **Pages** table marks the address of each removed page
   as one that stops working.

Never remove a disposable page that the operator did not approve, and never remove one only because it
is old.

`ctxr lint` also lists permanent pages that are out of step with the note they represent: stale, not
stamped, or with no note that resolves. Give each one to `ctxr-publish`. Do not stamp the page
yourself. Why: a stamp without a review of the page against its note confirms nothing.

## Broken links have classes — classify before fixing

- URL wrapped in wikilink syntax → convert to a markdown link.
- Basename collision (differs from an existing note only by case, hyphenation, or display name) →
  rewrite with `[[Real Name|display]]` alias syntax.
- Dangling: bugs (typos, accidental self-references, a path rewrite that hit a folder name) get fixed;
  healthy forward references (a name you may write about later, a planned hub) are intent markers —
  leave them. Never fabricate stub notes to silence them; a one-line stub hides the real TODO and makes
  orphan analysis lie.

## Moves at scale

A restructure that moves folders between layers is a migration. Run it in this order.

1. **Snapshot, don't abort.** If the worktree holds unrelated uncommitted work, commit it first as
   `WIP: pre-<slug> snapshot` and note that commit. It is the rollback anchor, and the baseline step 4 diffs
   against.
2. **Preflight.** Grep the whole store for the old path prefixes. That covers notes, skills, scripts and
   generated config, but not `.git` or the session worktrees path. Every hit is a hardcoded reference the
   move will break. A wikilink written with a path (`[[old/folder/Note]]`) breaks on the move, so rewrite it
   to the bare name first. `ctxr doctor` reports links that resolve ambiguously; a collision the move would
   create shows there afterwards.
3. **Two commits, never a broken intermediate.** Commit 1 is the moves plus the wikilink fixes they
   require, so the store is consistent after it alone. Commit 2 is tooling and doc patches.
4. **Stage surgically.** Diff each staged file against the snapshot. A file whose diff is larger than the
   migration's own edit is carrying unrelated drift: unstage it, restore it from the snapshot, re-apply only
   the migration edit, and leave the drift for its own commit.
5. **After they land,** rebuild the derived artifacts (`ctxr-derived-artifacts`), re-run `ctxr lint` and
   `ctxr doctor`, and log the migration in the store log with the snapshot, move, and tooling commits.
