## Why

`ctxr source check <path> --source-id <id>` compares the candidate against a set that includes the candidate itself. `identityRecords()` (`src/commands/source-check.ts:33-45`) unions `listCaptures()` with `listNotes()` and never removes the file being checked, so a capture that already carries the identity it is being checked against matches itself — even when it has never actually been ingested.

Verified against a real store. Two shapes a capture can have, and only one of them is a bug this change fixes:

```
# source_id + source_id + source_hash + ingested all present (a capture pipeline stamped all four at
# capture time, which the spec does not permit — see Non-goals)
→ {"verdict":"drift","stage":"source_id","matches":["raw/inbox/202608/20260810 1 1 Sigmund - Rui.md"]}

# source_id present, neither source_hash nor ingested present (the shape the spec DOES permit:
# "A capture MAY arrive already carrying its source type and source id")
→ {"verdict":"already_ingested","stage":"source_id",
   "matches":["raw/inbox/2026-05-29-daniel-pink-spend-money-happier.md"]}
```

Only the second is this change's bug. `src/core/ingest/identity.ts`'s `hasAssignedIdentity()` — true iff a record carries `source_hash` or `ingested` — already distinguishes "genuinely already ingested" from "merely carries a pre-assigned source id." The first case's capture claims (via its `ingested` field) to have already been assigned identity by ingest; whether that claim is honest is not something `source check` can or should judge — a record that says it has been ingested is treated as having been ingested, which is correct in the case where an agent re-checks a legitimately-already-ingested file (see design.md's Context, the existing passing test this constraint comes from). The second case's capture makes no such claim, carries only what a compliant pipeline is permitted to know at capture time, and still gets treated as if it had been ingested — that is the actual defect.

This contradicts a capture shape this capability explicitly permits: "A capture MAY arrive already carrying its source type and source id — a capture pipeline commonly knows both at the moment it writes the file." A pipeline that does exactly that makes `source check` return a false positive for every candidate it produces. And because `ctxr-ingest-orchestration` step 2 tells an agent that `already_ingested` means stop, the shipped ingest procedure then refuses to ingest anything that pipeline captures.

The bug is masked today only because callers commonly pass captures carrying no identity yet.

## What Changes

- `ctxr source check` excludes the candidate's own store-relative path from its comparison set before evaluating, **only when the candidate has not itself been assigned identity** (`hasAssignedIdentity` false — no `source_hash`, no `ingested`). A not-yet-ingested record is never a match for itself, at either stage.
- A candidate that has already been assigned identity is left in the set: checking an already-ingested file against its own identity still correctly reports `already_ingested`, naming itself. This is existing, tested, unchanged behaviour, not a new exception — see design.md's Context for why the unconditional version of this fix would have broken it.
- Verdicts for every other input are unchanged. A genuine prior capture or note carrying the same identity still reports `already_ingested`/`drift`; two other records sharing the identity still report `multiple_matches`.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `context-ingest`: the source-check requirements gain the exclusion. They currently describe two-stage matching without stating that the candidate is not compared against itself, which is what allows the false positive.

## Impact

- `src/commands/source-check.ts` — exclude `relativePath` from the records handed to `evaluateSourceCheck`.
- `test/unit/ingest-command.test.ts` (or a source-check unit test) — a case asserting a capture carrying its own `source_id`, checked against that id, reports `new`.
- `openspec/specs/context-ingest/spec.md` — the delta.

`src/core/ingest/model.ts` is deliberately untouched: `evaluateSourceCheck` is a pure function over records it is handed and has no notion of which record is the candidate. Confirmed `source-check.ts` is its only production caller (`ingest.ts` performs no dedupe of its own), so the fix stays at the one site that knows the candidate's path.

Downstream: a store retiring its hand-authored ingest skills in favour of the shipped `ctxr-ingest-orchestration` is blocked on this, because its capture pipeline records identity at capture time. That store runs the released `ctxr-cli`, so it is gated on this landing *and* being published.

## Non-goals

- **Fixing a capture pipeline that stamps `source_hash`/`ingested` at capture time.** This is a pipeline lying about its own state, not a `source check` defect — the command correctly treats a record's declared identity as authoritative, and cannot distinguish an honest already-ingested record from a pipeline's premature stamp. The downstream store that surfaced this bug has exactly such a pipeline (its Granola capture path); fixing it is that store's own, separate change, sequenced before it can benefit from this one.
- **The `duplicate` vs `already_ingested` vocabulary drift.** `openspec/specs/context-ingest/spec.md` says the verdict is `duplicate`; `src/core/ingest/model.ts:15` emits `already_ingested`. Real and worth fixing, but it is a naming reconciliation across spec and implementation with its own blast radius, and bundling it here would make a one-line behavioural fix look like a rename. Noted so it is not lost.
- **Making `ingest` dedupe.** `ctxr ingest` deliberately performs no `source check` of its own; its only guard is the already-stamped refusal. Whether it should is a separate design question this change does not open.
- **`ctxr source hash`'s sidecar inconsistency.** It calls `contentHash` directly rather than the sidecar-aware `hashOfCapture`, so for a `capture_file` sidecar it hashes the sidecar's own prose while `check`/`stamp`/`ingest` hash the subject's bytes. Out of scope here, but adjacent enough to record.
