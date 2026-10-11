Keep this store's mission current: the short core every agent sees on every turn, inlined into AGENTS.md's
"Mission" section from the document named on its source line. The core is the operator's statement of what
matters now, so it is small, ranked, and dated. Everything else it once carried lives in a register note it
links to. Hand-written content outside the fenced region is never touched.

Run `ctxr rollup stale` (or `--for <mission_path>`) first. A mission never confirmed, or one confirmed more than
`organize.rollup_stale_days` ago, is reported stale on elapsed time alone; `ctxr lint` also reports any due date
in it that has passed. Use those rather than guessing from memory whether it is out of date.

1. Resolve `<mission_path>` from the source line of AGENTS.md's "Mission" section. If no mission document is
   configured for this store, STOP — this skill has nothing to maintain; do not invent a path or create one
   unasked.
2. Gather from recent work: the current session's own changes, the store log at `__LOG_PATH__`, and every store
   location the taxonomy declares (read AGENTS.md's "Placing a new note" section for the configured layers) —
   not backlinks, and not a sample. A priority absent from every configured layer is not a store priority; treat
   it as the operator's own working memory instead and leave it out.
3. Write the core, and only the core:
   - **Primary mission** — one or two lines on what this store is for, right now.
   - **Top priorities, in rank order** — three to five. Each names its status, its purpose, and its next useful
     action; a priority with no next action is not actionable, and one with no purpose is not a priority —
     resolve or downgrade it rather than carry it silently.
   - **Not now** — what is deliberately set aside, one line each, so it is not mistaken for forgotten.

   The core stays under `__MISSION_MAX_BYTES__` bytes; `ctxr doctor` fails above it. Per-item detail an agent
   already finds elsewhere (a project's own next action, a status its note carries) is linked, not copied.
4. Keep the register in a note the core links to, placed by `ctxr-placement` like any other: back-burner items,
   each stating plainly why it is not active right now (a size cutoff, a blocking dependency, a deliberate
   deprioritization); sunset candidates (work whose end state is in sight or whose relevance is fading); and
   open operational debt (deferred cleanup, known gaps, workarounds owed a real fix). Debt that is closed is
   history: record it in `__LOG_PATH__` and remove it.
5. Propose, then write. The ranking and the mission are the operator's: show the proposed core and say what
   moved and why, and write only once the operator confirms. A factual correction — a priority shipped,
   blocked, or archived — is yours to make, and you say so in the report.
6. Synthesize into a file — bullets throughout, short clauses; skip any empty section silently (never "N/A",
   "none", or "TBD"). Nothing dated later than today; no editorializing beyond the shape above.
7. Write: `ctxr rollup write <mission_path> --content-file <file>` — the same command `ctxr-rollup` uses for an
   entity, applied here to the store's own mission path. It stamps the confirmation date AGENTS.md shows, and
   is an idempotent fenced write (`changed: false` and a byte-identical file when the content matches;
   mismatched markers abort with nothing written).

## Report

Mission path, `changed` or unchanged, what moved since the last write (a priority resolved, re-ranked, or
added; an item moved to the register), and any factual correction made without confirmation. Anything outside
the fence you want to fix is a separate, explicit edit.
