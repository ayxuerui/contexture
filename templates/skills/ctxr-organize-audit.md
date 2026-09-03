1. Run `ctxr lint` for the full health report — orphan notes, broken links, uningested inbox material,
   catalog gaps. It always exits 0; its findings are observations for judgment, never a block.
2. Run `ctxr doctor` for the invariants that DO block: catalog coverage, hook health, and more. Address doctor's failures before `ctxr-submit`; it runs the same checks.

## Placement review

The diagnostic that works: "what standard am I maintaining here, and what is my review cadence?" A
location reviewed on a cadence is an ongoing responsibility; one touched only when its material is needed
is reference — whatever its label says. Apply a file-count sanity check first: dozens of reference
readings under a responsibility label is drift. Watch for topic libraries creeping back into layers
organized by actionability. Single-note calls go through `ctxr-placement`.

## Retiring: move, don't tag

A status tag left in place defeats the layer — the active layers must show only active work.
`ctxr archive <path>` moves the note into the configured archive location as a tracked rename; the
note's frontmatter travels unchanged (never rewrite it on the move). Retiring is reversible cold storage,
not deletion. Verify with `git status --short` showing `R` (a rename, history preserved), not a delete
plus an add, then `ctxr catalog check`.

## Stale rollups

`ctxr lint`'s rollup-stale finding (and `ctxr rollup stale` directly) names entity notes whose backlinks
have moved since their last synthesis, or which have never been rolled up — hand each one to
`ctxr-rollup` rather than re-synthesizing ad hoc.

## Broken links have classes — classify before fixing

- URL wrapped in wikilink syntax → convert to a markdown link.
- Basename collision (differs from an existing note only by case, hyphenation, or display name) →
  rewrite with `[[Real Name|display]]` alias syntax.
- Dangling: bugs (typos, accidental self-references, a path rewrite that hit a folder name) get fixed;
  healthy forward references (a name you may write about later, a planned hub) are intent markers —
  leave them. Never fabricate stub notes to silence them; a one-line stub hides the real TODO and makes
  orphan analysis lie.

## Moves at scale

Two commits, never a broken intermediate: commit 1 = the moves PLUS the wikilink fixes they require;
commit 2 = tooling and doc patches. Before the moves, grep for hardcoded references to the old paths.
After they land, rebuild the derived artifacts (`ctxr-derived-artifacts`) and re-run `ctxr lint`.
