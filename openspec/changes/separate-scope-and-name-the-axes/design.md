## Context

See `proposal.md` — Why, and the seven spec deltas under `specs/` for the full requirement set. This document records the decisions that shaped them.

Two constraints run through everything below. First, `openspec/config.yaml`'s spec-authoring rules already decide the central question: a capability whose requirements have contradictory defaults is two capabilities. Second, `bootstrap-contexture-core` D7 built the store so that a frontmatter key rename is a config-default change plus a migration — this change is the second exercise of that machinery, and the first that renames two keys at once.

The evidence that a per-note label is not, on its own, an isolation mechanism comes from an independent implementation: GBrain's `docs/architecture/brains-and-sources.md` reports that its own page-level `visibility:` frontmatter has "no query filters on it," and that real isolation there means placing content where a caller has no grant. Its actual isolating primitive — a source marked `federated=false`, to "isolate a topic so it never leaks into personal search" — is the same shape as the isolating scope specified here, arrived at separately. Contexture is in a stronger position because its visibility label genuinely is a pre-filter, but that only holds for legs contexture computes, which is why this change writes that boundary down (`context-visibility`) rather than leaving it implied.

## Goals / Non-Goals

**Goals:**
- Make the two axes independently expressible, so a note can be partitioned one way and permissioned another, without either default contaminating the other.
- Settle the axis field names on forms whose values cannot be misread, and settle them together so the two audience-shaped fields differ visibly in direction.
- Keep the change reviewable as a rename plus an addition: no access-model semantics move.
- Leave every existing store behaviourally identical after migration until an operator opts into the new axis.

**Non-Goals:**
- Deciding what consumes the scope selector beyond the existing retrieval legs. Materialized projections and any second corpus are separate work, and are deliberately absent from these specs (see Risks).
- Reclassifying existing data. The migration renames keys; it never moves a note between axes.
- Reopening the visibility model. The context mapping, the wall ladder, and the tri-state verdict are untouched.

## Decisions

### D1 — Scope is its own capability, not a mode of the visibility field
`context-scope` and `context-visibility` have opposite defaults: an unplaced note should still be findable, an unclassified note should not be readable. Expressing both through one field forces every requirement to say "fails closed, except when it doesn't," which is precisely the ambiguity `openspec/config.yaml`'s capability rule exists to prevent. Alternative considered: a single field with a per-value "enforcing" flag — rejected because the flag would have to be consulted by every filter, and a value's flag being wrong would silently convert a permission into a hint, which is the failure mode with no detection.

### D2 — Scope is multi-valued; visibility stays single-valued
A note genuinely can belong to several bodies of knowledge — a decision record relevant to three projects is the ordinary case, not the exception — and forcing a single value would push operators into inventing composite scopes. Visibility is left single-valued because a note has exactly one classification and multiple values would immediately raise "most permissive or least permissive wins," a question with no safe default. The asymmetry is deliberate and is what the two axes' postures imply: a selector benefits from breadth, a gate does not.

### D3 — `isolating` is an opt-in inversion of the selector, and the mixing check is what makes it real
Rather than a second hard axis, an isolating scope changes one thing: the note is absent unless the scope is named, instead of present unless narrowed away. That keeps one mechanism and one mental model. The requirement that matters is the `doctor` check failing a note that carries an isolating scope alongside any other — without it, naming the other scope surfaces the note and the isolation is decorative. Alternative considered: silently dropping the non-isolating scopes from such a note — rejected, because quietly rewriting an operator's classification to preserve an invariant hides the conflict instead of surfacing it.

### D4 — Relational field names, and why `readable_by` was rejected
A noun key makes the reader infer the relation: `visibility: work` could be a level, a category, or an owner. A relational key admits one reading. Naming the two audience-shaped fields `visible_to:` and `disclosable_to:` additionally encodes direction — inbound retrieval versus outbound disclosure — which is otherwise the only thing distinguishing them, and is exactly what a reader most needs to know.

`readable_by:` was considered and rejected: it asserts that the file cannot be read, which contexture cannot enforce and which `openspec/config.yaml`'s enforcement rule forbids claiming. `visible_to:` describes what actually happens — the note does not surface in contexture-computed retrieval — and the `context-visibility` delta states that boundary explicitly so the name and the guarantee agree.

### D5 — The rename needs no change to the existing visibility-key requirement
`context-store`'s visibility-key requirement never names the literal key; it requires only that the key be read from `fields.visibility` with a shipped default. Changing that default from one value to another therefore touches no requirement at all. This is D7's naming inoculation working exactly as designed, and it is why this change adds two sibling requirements rather than editing the original.

### D6 — The disclosure field key becomes configurable
It is currently a literal in the disclosure implementation, on the recorded grounds that nothing asked for it to be configurable. Renaming it is that ask. Three sibling axis fields bound three different ways is its own ambiguity, and the alternative — renaming the literal and leaving it hardcoded — would mean the next rename is a code change rather than a migration, discarding the property D7 exists to protect.

### D7 — One migration renames both keys, and searches the historical literals
`0003-rename-axis-fields` performs both renames in a single pass over notes, because two migrations would double the note rewrites for no added safety and would leave a valid intermediate schema version nothing else needs. Following `rename-visibility-field`'s pattern, it searches for the **fixed historical literals**, never for the configured key names — those are what the migration's own final step changes, so deriving the search from them would make a resumed run misread already-migrated notes as needing work.

### D8 — The new axis defaults to inert
A store that says nothing about scope resolves every note to the configured default scope list, so every retrieval leg behaves exactly as before. Operators adopt the axis by adding directory defaults or note-level values when they want it. Alternative considered: deriving an initial scope from each note's path at migration time — rejected, because it would silently invent a classification the operator never chose, and an operator who wants that can get it with directory defaults in one config edit.

## Risks / Trade-offs

- **[Risk] `scope:` was the schema-v1 key for what is now the visibility field.** A store still carrying that meaning must never have its notes read under the new one. → **Mitigation**: the schema-version gate already refuses any store below the supported version before a command reads notes, and this change adds a `context-store` requirement making that guarantee explicit rather than incidental. After `0003` there are two migrations of distance between the two meanings.
- **[Risk] This is the first change to require two pending migrations to chain.** Ordering was implicit in the implementation and unspecified. → **Mitigation**: a `store-lifecycle` requirement now specifies ascending-order application, dry-run enumeration, and resumability at the last completed version, with scenarios covering all three.
- **[Risk] `visible_to:` and the spec phrase "the visibility field" no longer look different at a glance,** where the old key made a violation of the one-place-binding rule obvious on sight. → **Mitigation**: the archive-time audit that already checks for literal key names is extended to all three keys, converting a visual check into a mechanical one. The rule itself is unchanged.
- **[Risk] Every existing store breaks until migrated.** → **Mitigation**: accepted and stated in the proposal. The gate is loud and names the version; `migrate --dry-run` reports the exact rewrites first; the store is a git repository, so the migration commit is reviewable and revertible like any other.
- **[Trade-off] The scope axis ships inert.** Nothing in a freshly migrated store uses it, so the change delivers expressiveness rather than immediate behavior. That is the price of D8, and it is the right one: a migration that both renames keys and reclassifies notes would be impossible to review as either.
- **[Trade-off] Specifying a selector before specifying a consumer beyond the existing legs.** The retrieval legs consume it immediately, which is enough to make every requirement here testable; anything further is deliberately absent so that this change does not commit to a corpus-materialization design it has not made.

## Migration Plan

1. Land the config schema, the scope resolution, and the composed filter first — visibility enforcement sequences before retrieval, per the tasks rule, so no leg is ever briefly filterable on one axis only.
2. `0003-rename-axis-fields` renames both keys on every note and both config keys, and advances `schema_version` to 3. `plan()` and `apply()` both re-derive pending work from on-disk state, so an interrupted run resumes.
3. `openspec/config.yaml` is updated in the same change: its context block still records the naming decision as postponed, its "bind the provisional field name" rule still names one provisional key, and its one-place rule and archive audit still name only the visibility field. All four are now wrong in the same direction.
4. `context-visibility`'s Purpose is narrowed to permission alone by editing the main spec directly — the tooling ignores a Purpose written in a delta for an existing capability.

Rollback: revert the migration commit. The migration performs no lossy transformation — both renames are bijective and no note's classification changes — so a reverted store is byte-identical to its pre-migration state apart from the schema version.

## Open Questions

None. The two decisions that could have changed the specs — whether scope is a security boundary (it is not, with an opt-in exception) and whether the two audience-shaped fields are renamed as a pair (they are) — were resolved during planning rather than deferred here.
