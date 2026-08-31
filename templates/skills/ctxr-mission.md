Keep this store's mission document — the standing "what's active right now" map AGENTS.md names at
`organize.mission_path` when configured — current: priorities, active builds, back burner, sunset
candidates, and debt. Hand-written content outside the fenced region is never touched.

Run `ctxr rollup stale` (or `--for <mission_path>`) first — a never-written mission document, or one whose
recorded timestamp has aged past `organize.rollup_stale_days`, is reported stale on elapsed time alone (no
backlinks compared, unlike an entity rollup); use it instead of guessing from memory whether the document
is out of date.

1. Resolve `<mission_path>` from AGENTS.md's canonical section. If no mission document is configured for
   this store, STOP — this skill has nothing to maintain; do not invent a path or create one unasked.
2. Gather from recent work: the current session's own changes, and every store location the taxonomy
   declares (read AGENTS.md's "Placing a new note" section for the configured layers) — not backlinks, and
   not a sample. A priority absent from every configured layer is not a store priority; treat it as the
   operator's own working memory instead and leave it out.
3. For each active priority, state its status, its purpose, and its next useful action — a priority with no
   next action is not actionable, and one with no purpose is not a priority; resolve or downgrade it rather
   than carry it silently.
4. For each back-burner item, state plainly why it is not active right now — a size cutoff, a blocking
   dependency, a deliberate deprioritization. An item with no stated reason for being dormant reads as
   simply forgotten; do not leave one that way.
5. Carry sunset candidates (work whose end state is in sight or whose relevance is fading) and operational
   debt (deferred cleanup, known gaps, workarounds owed a real fix) as their own sections, separate from
   active and back-burner priorities — never folded into either.
6. Synthesize into a file — bullets throughout, short clauses; skip any empty section silently (never
   "N/A", "none", or "TBD"). Nothing dated later than today; no editorializing beyond the status/purpose/
   next-action shape above.
7. Write: `ctxr rollup write <mission_path> --content-file <file>` — the same command `ctxr-rollup` uses for
   an entity, applied here to the store's own mission path; an idempotent fenced write (`changed: false` and
   a byte-identical file when the content matches; mismatched markers abort with nothing written).

## Report

Mission path, `changed` or unchanged, and what moved since the last write (a priority resolved, a new
back-burner addition, a sunset candidate promoted or dropped). Anything outside the fence you want to fix
is a separate, explicit edit.
