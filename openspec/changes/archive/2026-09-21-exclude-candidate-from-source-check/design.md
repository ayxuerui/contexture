## Context

See proposal.md — Why. The constraints that shape the fix:

- `evaluateSourceCheck` (`src/core/ingest/model.ts:54-85`) is a pure function over `(records, candidateHash, sourceId, trackingParams)`. It has no notion of *which* record is the candidate, and nothing in its signature could tell it.
- `source-check.ts` already computes the candidate's store-relative path at line 59, before it builds the record set at line 69. The knowledge needed for the fix is already at that site.
- `source-check.ts` is the only production caller of `evaluateSourceCheck`; `ingest.ts` performs no dedupe (its only guard is `hasAssignedIdentity`). Verified by grep, so the fix has exactly one call site to cover.
- The comparison set is path-keyed already: `identityRecords()` de-duplicates with `new Map<string, IdentityRecord>()` on `record.path` (lines 42-44), and paths are normalized store-relative forward-slash strings by both `listCaptures`/`listNotes` and `toStoreRelativePath`. So path equality is a sound identity test here.
- **Found while implementing, not anticipated at proposal time**: an unconditional self-exclusion breaks an existing, currently-passing, spec-intended behaviour. `test/unit/ingest-command.test.ts:246-268` ingests a capture via `ctxr ingest` (which stamps `source_hash`/`ingested` onto it), then checks that same retained file against its own `source_id`, and correctly asserts `already_ingested` matching itself — because it genuinely was already ingested and there is no other record to name. Excluding by path unconditionally would turn that correct answer into a false `new`. `src/core/ingest/identity.ts` already has the primitive that distinguishes the two cases: `hasAssignedIdentity()`, true iff the record carries `source_hash` or `ingested` — "the two fields ingest itself assigns, as opposed to the two a capture pipeline commonly already knows when it writes the file" (its own doc comment). The exclusion has to be conditional on this, not unconditional on path — see D2's revision below.

## Goals / Non-Goals

**Goals:**

- A record that has **not** been assigned identity by ingest is never a match for itself, at either stage.
- A record that **has** been assigned identity by ingest still matches itself when re-checked against its own identity — that is the correct `already_ingested` answer, not a bug.
- No change to any other verdict, for any other input.

**Non-Goals:**

- Teaching `evaluateSourceCheck` about candidacy — see D1.
- The `duplicate`/`already_ingested` vocabulary drift, `ingest`-side dedupe, and `source hash`'s sidecar inconsistency (proposal.md — Non-goals).

## Decisions

### D1 — Filter in the command, not in the model

Exclude the candidate's path from the records `source-check.ts` hands to `evaluateSourceCheck`, rather than passing a candidate path into the model and filtering there.

`evaluateSourceCheck`'s contract today is "given these records, what does this identity and hash match?" — a pure predicate over a set the caller chose. Adding a `candidatePath` parameter would widen it to "…and also, one of these records might be the thing you're asking about, ignore that one", which is a caller's concern leaking into a decision function. The caller is the only party that knows what it is checking; it should hand over the set it means.

It also keeps the existing unit tests over `evaluateSourceCheck` honest: they construct record sets directly and assert verdicts, and they should stay free of a candidate-path concept the function doesn't need.

Alternative considered: filter inside `identityRecords()` by passing it the path. Equivalent in behaviour, and marginally tidier at the call site, but it buries an exclusion rule inside a function whose stated job is "enumerate the store's identity records" — the exclusion is about *this check*, not about what the store contains. Doing it at the point of use keeps the function's name true.

### D2 — Match on store-relative path, and only exclude when the candidate has no assigned identity

Two records are "the same file" iff their store-relative paths are equal. Not "same hash" (two genuinely distinct captures of identical content must still report `alternate_source_match` — that is the whole point of stage 2), and not "same source-id" (that is precisely the match being evaluated).

Path is already the identity key `identityRecords()` de-duplicates on, and both sides are produced by normalizers that agree on separator and base, so no additional normalization is introduced.

**Revised, per the Context finding above: the exclusion is conditional.** `identityRecords()` already returns the candidate's own record — the same call that builds the comparison set contains the file being checked, with its frontmatter — so no extra read is needed. Find that record by path, test `hasAssignedIdentity` on it, and exclude it from the set only when that is false:

- **Candidate not yet ingested** (no `source_hash`, no `ingested` — the shape a compliant capture pipeline produces per the spec's "A capture MAY arrive already carrying its source type and source id" allowance): excluded. A pre-assigned `source_id` must not make the file its own answer to "has this been ingested" before it has been.
- **Candidate already ingested** (has `source_hash` or `ingested`, e.g. via `ctxr ingest` or `source stamp`): left in. Re-checking it against its own identity correctly reports `already_ingested`, naming itself — this is `test/unit/ingest-command.test.ts:246-268`'s scenario, and it must keep passing unchanged.

This also clarifies what this change does and does not fix in practice. A capture pipeline that stamps `source_hash`/`ingested` at capture time (in violation of the spec's contract, but not something this command can detect or police) will still self-match after this fix — correctly, in the narrow sense that the record is honestly answering "do you claim to be already ingested?" with "yes," even though that claim is false. This command's job is to correctly interpret whatever identity state a record declares, not to audit whether a capture pipeline is telling the truth about how it got that state. Fixing a pipeline that lies about `ingested` is that pipeline's fix to make, not this one's — see proposal.md's Impact for the concrete case this surfaced.

### D3 — Exclude before evaluation, not after

Filter the set going in, rather than post-processing `result.matches` to drop the candidate.

Post-filtering would have to re-derive the verdict: dropping the candidate from a single-match `already_ingested` result would have to become `new`, and dropping it from a two-match `multiple_matches` would have to become whatever a one-match evaluation would have produced. That is re-implementing the state machine at the call site, and it would silently diverge the moment `evaluateSourceCheck` gains a verdict. Filtering the input keeps exactly one implementation of the decision.

## Risks / Trade-offs

- **[Risk]** A store where the same file is somehow enumerated under two different path spellings would still self-match. → Not reachable today: `identityRecords()` already keys a `Map` on `record.path`, so divergent spellings would already be producing duplicate records and spurious `multiple_matches` before this change. The fix does not make that worse, and the existing de-duplication is the place that would need to change if it ever did.
- **[Risk]** A caller who *wants* to know "does this file's own identity appear in the store" loses that signal. → No such caller exists; that question is answered by reading the file's own frontmatter, not by a dedupe check against the corpus.
- **[Risk]** Behaviour change for anyone whose workflow silently depended on the false positive as a "this capture is already stamped" signal. → Reporting `already_ingested` for a never-ingested file is a bug, not an interface; and the honest signal for that question is `ctxr ingest`'s own `AlreadyIngestedError`, which is unaffected. **Revert**: single-commit revert, no persisted state involved.

## Migration Plan

None — no persisted state, no config, no store-resident file changes. The fix changes one command's in-memory comparison set.

Sequencing note: a downstream store is blocked on this reaching npm, not merely `main`. Landing this without a release does not unblock it.
