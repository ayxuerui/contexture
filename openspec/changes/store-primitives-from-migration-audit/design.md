## D1 — Fenced-region append is the only structured-write primitive

Many audited skills reduce to "append a line into a known block of a note and keep everything else intact". One verb with a `--region` name covers bookings, expenses, decisions, principles, and change logs without contexture knowing any of those words. The region uses the existing `contexture:<region>` fence markers so `adapters generate`'s fence handling and the derived-artifacts skill's "never hand-edit inside a fence" rule apply unchanged. Returning the post-append line count lets a skill verify on disk in one command.

## D2 — Dedupe verdicts, not dedupe scripts

`source check` today answers `new | duplicate`. The audit's dedupe script also answers "same source, content changed" and "already ingested from a different URL". Adding `drift` as a verdict and `stamp`/`add-alt` as explicit recording commands moves the engine's whole decision table under contexture. URL canonicalization is a pure function with a fixed rule list (lowercase scheme+host, drop fragment, drop configured tracking parameters, collapse trailing slash) and a unit-test table; operators extend the tracking-parameter list in config.

## D3 — Leak scan is marker-driven and mapping-aware

A leak is content that belongs to context X inside a note visible to a context that cannot see X. Contexture cannot know what "belongs to X" means without operator markers, so `disclosure.leak_markers` maps a context to a list of patterns; the scan intersects each match's context with the note's visible-to set (via the mapping from `visibility-contexts-and-wall-verdicts`) and reports any context that both matches a marker and cannot see the note. Empty markers → the check is a no-op, so existing stores are unaffected.

## D4 — Staleness is computed, never stored

`rollup stale` compares each backlinking note's git mtime against a `rolled_up:` frontmatter timestamp the rollup skill writes; no cache, no ledger. `organize.rollup_stale_days` bounds noise.

## Risks

- **[Risk] Marker patterns produce false positives.** → Reported as lint findings with the matched text and context, never auto-fixed; the leak check is severity `warn` by default.
