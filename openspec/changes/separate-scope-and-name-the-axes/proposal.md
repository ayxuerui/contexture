## Why

One frontmatter field is carrying two capabilities whose defaults contradict each other. The visibility field currently answers both *"which body of knowledge is this note part of"* and *"which context may retrieve it"* — but knowledge partitioning must fail **open** (a wrong partition costs relevance) while permission must fail **closed** (a wrong permission is a leak). `openspec/config.yaml`'s own spec-authoring rule already decides this case: *"A capability that has two requirements with contradictory defaults ... is two capabilities, not one — split it."* Today a store cannot express "this note belongs to one project, and every internal context may read it" without abandoning one of the two meanings.

The split is also the moment the postponed naming decision (`bootstrap-contexture-core` D7) resolves, and it resolves differently than D7 assumed: `scope:` and `lens:` were never two candidate names for one field — they are two fields. Both axis keys are renamed to **relational** forms so that a value can only be read as an audience, never as a level or a category, and so that the two audience-shaped fields encode direction (inbound retrieval vs. outbound disclosure) rather than relying on the reader to infer it.

## What Changes

- Add a **scope** axis: a multi-valued frontmatter field naming which bodies of knowledge a note belongs to, resolved explicit → directory default → configured default, consulted as a **selector** that narrows retrieval and never as a security boundary.
- Add a per-scope `isolating` flag that inverts the selector's default for that scope only: a non-isolating scope is present unless narrowed away; an isolating scope is absent unless explicitly requested. A `doctor` check fails a note that mixes an isolating scope with any other, which is the invariant that makes the flag meaningful.
- **BREAKING**: rename the visibility field key `lens:` → `visible_to:` and the disclosure audience-tag key `audience:` → `disclosable_to:` on every note and in `contexture.yaml`. Migration `0003-rename-axis-fields` performs both renames in one pass; `schema_version` becomes `3`.
- Make the disclosure field key **configurable** (`fields.disclosure`), as the visibility field key already is, so all three axis fields are bound the same way in the same place.
- Narrow `context-visibility` to permission only, and state explicitly that its enforcement extends to contexture's own retrieval legs and no further.
- Accept a scope selector wherever a requesting context is already accepted, and carry a note's resolved scope on the stable per-note retrieval record.

No behavior other than key names changes: visibility resolution order, the context→visible-values mapping, the disclosure ladder, and the tri-state verdict are all untouched, so the rename is reviewable as a rename.

## Capabilities

### New Capabilities

- `context-scope`: which bodies of knowledge a note belongs to, and how a requested scope narrows retrieval — a selector with an opt-in isolating mode, deliberately distinct from permission.

### Modified Capabilities

- `context-store`: binds the scope and disclosure field keys with shipped defaults, in the one place a field key may be asserted, and forbids a migration-retired key being reused for a different meaning at a schema version a store can still run.
- `context-visibility`: bounds where the visibility label is enforced, and requires the visibility pre-filter and the scope selector to compose as one filter applied before traversal.
- `disclosure-policy`: the explicit-tag rung reads the configured disclosure field key instead of a fixed literal.
- `store-lifecycle`: pending migrations apply in ascending schema-version order, which this change is the first to exercise.
- `context-retrieval`: filtered operations accept a scope selector alongside the requesting context and reject an unknown scope; the per-note record carries resolved scope.
- `context-catalog`: entries record resolved scope, and catalog reads accept a scope selector alongside the requesting context.

## Impact

Affected code: `src/core/notes/scope.ts` (new), `src/core/notes/visibility.ts`, `src/core/notes/list.ts` (`NoteQuery` gains scope; its long-accepted `as` finally applies), `src/core/graph/visibility-filter.ts` (becomes a combined scope+visibility pre-filter), `src/core/records.ts`, `src/core/notes/checks.ts` and `src/core/checks/manifest.ts` (new scope checks), `src/core/disclosure/model.ts` (configurable key), `src/config/{schema,defaults,render}.ts`, `src/core/migrations/{registry,0003-rename-axis-fields}.ts`, `src/commands/{init,catalog-show,graph-query,lint}.ts`, `src/run.ts`, plus every config fixture.

Affected stores: every existing store requires `ctxr migrate` before commands will run, because `schema_version` advances to 3. The migration is dry-runnable and resumable.

Affected project documents: `openspec/config.yaml`'s context block still records the naming decision as postponed and its spec-authoring rules still name a single field key; both are updated here, along with the archive-time audit that checks for literal key names.

## Non-goals

- **Automatically reclassifying existing visibility values into scopes.** The CLI cannot know which of a store's values were doing partition duty rather than permission duty, and guessing would silently move notes across a permission boundary. Operators who need it get a separate opt-in, operator-mapped migration; this change only ensures the new axis exists and defaults to a single scope so nothing moves on its own.
- **Changing any visibility or disclosure semantics.** Resolution order, the context mapping, wall ordering, and the ALLOW/DENY/ASK verdict stay exactly as specified, so that a reviewer can read this change as a rename plus an addition rather than auditing the access model again.
- **Making the requesting context mandatory.** Retrieval commands still accept an absent context exactly as they do today; requiring one is a breaking default change that belongs with the resolution-chain work, not here.
- **Ranked or semantic search, and any adapter kind for it.** Still the `bootstrap-contexture-core` D2 cut — deferred until the v1 core has real usage behind it. Nothing in this change opens or presumes that seam.
- **Scope-aware projections, exports, or any second materialized corpus.** The selector is defined here; what consumes it beyond the existing retrieval legs is separate work.
