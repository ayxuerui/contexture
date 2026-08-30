## D1 — The audit record: 52 skills, one verdict each

The migration target's `.claude/skills/` was read skill by skill (three parallel passes over the 25 store-shaped skills; descriptions for the rest) and each was placed in exactly one bucket. This table is the evidence for both this change and `store-primitives-from-migration-audit`.

**Ship inside contexture (this change):** `pkm-note-placement` → `ctxr-placement`; `connect` → `ctxr-connection-proposal`; `rollup` → `ctxr-rollup`; `land` + `ship` + `pkm-pr-workflow` (conductor + merge state machine + conflict playbook) → `ctxr-session-lifecycle`; `session-to-pkm` → `ctxr-session-capture`; `regenerating-generated-artifacts` → `ctxr-derived-artifacts`; `pkm-archive-project` (the text that `ctxr archive` doesn't already embody) → `ctxr-organize-audit`.

**Split — generic core here or in the primitives change, vocabulary stays in the vault:** `ingest` (dedupe engine already ported; synthesis discipline → `ctxr-ingest-orchestration`; drift/stamp/alt-source verdicts → primitives), `digest` (URL canonicalization → primitives), `build-graph` (graph ported; typed edges → primitives), `lint` (rollup staleness, stubs, unlinked mentions → primitives), `organize` (broken-link classes, basename collisions, bulk-move preflight → primitives), `confidential-career-pkm-updates` (leak scan → primitives), and the entity-logging family — `pkm-booking-log`, `pkm-expense-log`, `strategic-person-note`, `nestor-principle-extraction` — which share one pattern (land a fact in N coupled surfaces: dated source note → append into a structured region → recompute an aggregate → propagate a wikilink; verify on disk; anomalies first) and become one owned skill once the append-into-region primitive exists.

**Operator-owned — stays in the vault (37):** store-shaped but bound to one operator's tools or not a store operation: an external-service capture connector, a research methodology, retrieval over a third-party index (its lexical-first/semantic-fallback policy is the seed of a future retrieval adapter), HTML artifact tooling, machine-wide identity propagation (its reference file holds live personal identifiers and must never enter an open-source repo), an interview-preparation composite; and the ~20 skills with no store relationship at all (model-vendor CLIs, OpenSpec's own workflow, geocoding, package recovery, calendars, PDF/slide rendering, entity lookup, transcript fallbacks, contract analysis).

## D2 — Text first, primitives second

Splitting into two changes is deliberate: everything in this change targets commands that already exist, so it can land and be delivered by `ctxr update` immediately, and it forces each skill's decision procedure to be expressed against the CLI as it is. Where a skill needs a verb that does not exist yet (`session land`, `entry append`), the skill names the manual equivalent and the primitives change replaces it.

## D3 — Generic-ification rules applied to every skill

No shipped profile's layer names (the placement procedure derives its tests from the *configured* taxonomy's descriptions — a termination test is emitted only for a layer whose description implies an end state); no real context names (visibility rules speak of "the configured contexts"); relation vocabularies read from config with a single-group fallback; harness tools referenced only through contexture commands (the capture skill writes identity via files, never a harness memory tool); every "verify" step names the command that verifies (`lint`, `doctor`, `catalog check`, `git status --short`).

## D4 — One answer to "who commits?"

The audited vault gave four contradictory git instructions across four skills (an editor plugin auto-commits; the operator commits manually; never commit; commit into the worktree). Contexture owning start → submit → land end-to-end, stated once in `ctxr-session-lifecycle` and referenced by every other skill, is the resolution — the skills in this change never instruct a direct commit or push.

## Risks

- **[Risk] Skill text grows and agents skim.** → Each skill keeps the shape of the current four (numbered steps, one screen), with the decision tests as short imperative rules rather than essays; anything longer becomes a referenced conventions doc.
- **[Risk] `ctxr update` overwrites a store's edits to an owned skill.** → By design (managed header); operator additions go alongside, and the conventions index is the place for store-specific overlays.
