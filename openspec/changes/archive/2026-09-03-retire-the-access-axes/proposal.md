## Why

Contexture carries two access-control axes and has a third proposed. None of them is carrying its weight.

**Disclosure is a gate that only ever says "ask."** `disclosure.internal_audiences` and `disclosure.hard_walls` both ship empty (`src/config/defaults.ts`), so rungs 1 and 3 of the four-rung ladder never fire. Every note in every default store evaluates to ASK at the external-audience rung. The one consumer, `ctxr publish gather`, therefore refuses nothing and permits nothing — it defers every decision to the operator it was meant to inform.

**Visibility is half-enforced, and the unenforced half is specified.** `src/core/catalog/build.ts` reads `void asContext; // visibility filtering wired in Phase 5`, `src/core/notes/list.ts` ignores `NoteQuery.as` the same way, and `src/run.ts` advertises the catalog flag to operators as "(wired in Phase 5)". Phase 5 never happened. The pre-filter holds on graph traversal and `publish gather --as` and nowhere else — so `context-catalog`'s requirement that `catalog show --as` omit entries is currently unmet by shipped code, and an operator reading `--help` is told a filter applies that does not.

**Scope was never built.** It exists only in `separate-scope-and-name-the-axes`, whose twenty tasks are all unchecked and which has drifted from the tree it was written against (it targets `schema_version` 3 and a `0003-` migration prefix; the store is on 6 and migrations are named `<verb>-<noun>.ts`).

Three half-built axes is worse than none. Each one costs comprehension on every read of the retrieval path, each is specified in more detail than it is implemented, and the gap between the two is itself a hazard: a specification that claims a filter applies teaches an agent to rely on it. Access control is a real future need — it is a P2 need, and the shape it should take (owner/editor/viewer roles, plus a pattern scan at publish time) is not the shape any of these three axes has. Remove them, and re-enter deliberately against a concrete need. See `design.md` for the decisions, including why scope goes with them.

## What Changes

- **BREAKING**: removes the `context-visibility` capability entirely — the visibility field, `visibility.default_context`, `visibility.directory_defaults`, `visibility.contexts`, `fields.visibility`, resolution order, the pre-filter, and the fail-closed checks.
- **BREAKING**: removes the `disclosure-policy` capability entirely — the four-rung ladder, the tri-state verdict, hard walls, the leak scan, and verdict aggregation.
- **BREAKING**: removes the `ctxr check` and `ctxr note resolve` commands, which exist solely to serve these two axes.
- **BREAKING**: removes `--as <context>` from graph query, catalog show, and publish gather, and `--audience <audience>` from publish gather.
- `ctxr publish gather` narrows to a plain enumeration over `--under`/`--note`/`--entity`; it resolves a subject to its note set and reports it, gating nothing.
- `contexture.yaml` loses its `visibility:` and `disclosure:` blocks and `fields.visibility`. Migration `drop-access-axes` removes them; `schema_version` becomes 7.
- **Notes are not rewritten.** A note's existing visibility-field key stays in frontmatter, unread. See `design.md` D3.
- Retires three pending changes that exist only to extend these axes: `separate-scope-and-name-the-axes`, `rollup-respects-visibility`, and `isolation-and-egress`.

## Capabilities

### New Capabilities

_None._

### Removed Capabilities

- `context-visibility`: every requirement is removed and the capability retired. No successor requirement replaces it.
- `disclosure-policy`: every requirement is removed and the capability retired. No successor requirement replaces it.

### Modified Capabilities

- `publish`: the subject-resolution requirement loses its named-context selector; the disclosure gate and the aggregate-verdict exit code are removed outright; the page structural check no longer asserts anything about the visibility field.
- `context-store`: the visibility-field-key requirement is removed — there is no field left to name.
- `context-retrieval`: the per-note record drops resolved visibility.
- `context-catalog`: catalog entries drop resolved visibility and the `--as` omission.
- `write-lifecycle`: `session capture` no longer writes a visibility field; its frontmatter-shape validation stands.
- `context-organize`: archiving no longer asserts preservation of resolved visibility.
- `harness-portability`: the placement skill drops the visibility-collision test; the publish skill drops the disclosure gate.
- `store-integrity`: `doctor`'s enumerated check list drops the unresolvable-visibility check.

## Non-Goals

- **Designing the P2 access model.** This is a removal, not a redesign. Owner/editor/viewer is recorded in `design.md` D5 as the intended direction so this removal is not later misread as a judgment that access control is unnecessary — but it gets its own proposal, argued on its own merits and against a concrete need, not a revival of any of these three.
- **Building the publish-time leak scan now.** It is the cheap, honest core of the stated need — a page built for a company must not carry an internal note evaluating that company — and it requires neither axis, being a pattern match against a built `index.html`. It is deliberately deferred so this change stays a removal; `design.md` D5 records it as the P2 entry point.
- **Stripping the visibility field from note frontmatter.** Removal is meant to be reversible; deleting the labels would make re-entry a hand re-labelling pass over every note. See D3.
- **Reclaiming exit codes 4 and 5.** They stay reserved and unused. See D4.
- **Touching the retrieval legs themselves.** The catalog, the wikilink graph, and the ripgrep leg are unchanged except for the removal of a filter that, in two of the three, was never applied.

## Impact

Affected code:
- Deleted: `src/core/notes/visibility.ts`, `src/core/graph/visibility-filter.ts`, `src/core/disclosure/` (`model.ts`, `leak-scan.ts`), `src/core/checks/disclosure-checks.ts`, `src/commands/check.ts`, `src/commands/note-resolve.ts`.
- Modified: `src/run.ts` (drop two commands and the `--as`/`--audience` options), `src/config/schema.ts` (drop `VisibilitySchema`, `DisclosureSchema`, `FieldsSchema.visibility`, `HardWallSchema`), `src/config/defaults.ts` (drop five constants), `src/commands/init.ts`, `src/commands/session-capture.ts`, `src/commands/publish-gather.ts`, `src/commands/publish-check.ts`, `src/commands/graph-query.ts`, `src/core/records.ts`, `src/core/notes/checks.ts`, `src/core/notes/list.ts`, `src/core/catalog/build.ts`, `src/core/checks/manifest.ts`, `src/core/convention-doc.ts`, `src/core/agents-doc.ts`, `src/core/skills.ts`, `src/core/errors.ts`, `src/core/migrations/registry.ts`.
- Added: `src/core/migrations/drop-access-axes.ts`.
- Comment-only references to update: `src/adapters/types.ts`, `src/commands/archive.ts`, `src/core/checks/types.ts`, `src/core/checks/organize-checks.ts`, `src/core/ingest/identity.ts`.
- Templates: `templates/agents/canonical.md`, `templates/conventions/baseline-conventions.md`, `templates/skills/ctxr-publish.md`, `templates/skills/ctxr-organize-audit.md`, `templates/skills/ctxr-placement.md`, `templates/skills/ctxr-session-capture.md`.
- Tests deleted: `test/unit/visibility.test.ts`, `test/unit/disclosure-model.test.ts`, `test/unit/leak-scan.test.ts`, `test/unit/graph-visibility-filter.test.ts`, `test/unit/check-command.test.ts`, `test/unit/note-resolve-command.test.ts`, `test/unit/disclosure-checks.test.ts`, `test/integration/disclosure.test.ts`, `test/integration/note-resolve.test.ts`.
- Tests trimmed: roughly forty further suites carrying a `visibility: {...}` / `disclosure: {...}` config literal in a fixture, plus the visibility-key assertion in `test/unit/single-source-literals.test.ts`.
- `openspec/specs/context-visibility/` and `openspec/specs/disclosure-policy/`: deleted entirely after archive, a capability with zero requirements not being a valid spec state.
- `openspec/config.yaml`: the Tenancy paragraph, the "naming is deliberately postponed" paragraph, the three visibility-field-key authoring rules, and the archive-time literal-key audit all describe machinery this change removes.

Affected stores: every store needs `ctxr migrate`. No note is rewritten; only `contexture.yaml` changes.
