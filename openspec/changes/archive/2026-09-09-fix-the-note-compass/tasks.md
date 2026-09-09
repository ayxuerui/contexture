## 1. One source for the vocabulary

- [x] 1.1 Add the four names with their definitions to `src/config/defaults.ts` as a single exported constant, documented as the one place either is written (context-retrieval spec)
- [x] 1.2 Remove `relations` from `RetrievalSchema` in `src/config/schema.ts` and from `SHIPPED_DEFAULTS.retrieval`; no `SUPPORTED_SCHEMA_VERSION` bump (design D1)
- [x] 1.3 Extend `noUnrecognizedConfigKeysCheck` to report a retired NESTED key against the config file's text — the schema strips one, so it leaves nothing in the loaded config — carrying what replaced it
- [x] 1.4 Unit test: a config declaring `retrieval.relations` fails the check naming the dotted path; one that does not declare it passes
- [x] 1.5 `npm run typecheck && npx vitest run test/unit/config-schema.test.ts test/unit/integrity-checks.test.ts` exits 0

## 2. The graph types against the constant

- [x] 2.1 `src/core/graph/model.ts`: take the vocabulary from the constant rather than from `GraphBuildOptions`; drop the empty-vocabulary default and the `relations` option
- [x] 2.2 Unit test: a note with a compass heading yields a typed edge with no configuration involved; a heading outside the vocabulary still yields an untyped link
- [x] 2.3 Integration test: a freshly initialized store types an edge from a note using a compass heading, and `ctxr graph query neighbors --type <name>` returns it
- [x] 2.4 `npx vitest run test/unit/graph-model.test.ts test/integration/graph.test.ts` exits 0

## 3. Delete the empty-vocabulary branches

- [x] 3.1 `src/core/convention-doc.ts`: drop the "declares no relation vocabulary" branch; always render the names with their definitions and the directedness sentence
- [x] 3.2 `src/core/skills.ts`: drop `relationGroupingStep`'s single-group fallback; render one group per relation with its definition
- [x] 3.3 Unit test: the entry document's conventions section and the connection-proposal skill each name all four relations with their definitions and state that edges are directed
- [x] 3.4 Unit test: no skill template contains a relation name as a literal
- [x] 3.5 `npx vitest run test/unit/skills.test.ts test/unit/conventions.test.ts test/unit/agents-doc.test.ts` exits 0

## 4. The template

- [x] 4.1 Add `## Source` to `templates/notes/Concept.md`, between `## Concept` and the compass, with a comment distinguishing it from the `sources:` frontmatter ingest writes (design D4)
- [x] 4.2 Align the compass comments in the template with the definitions in the constant
- [x] 4.3 Unit test: each compass heading in the packaged template is followed by a comment matching that relation's definition, so the fixed copy cannot drift from the constant
- [x] 4.4 `npx vitest run test/unit/note-templates.test.ts` exits 0

## 5. Documentation and full verification

- [x] 5.1 README: state that the relation vocabulary is fixed and not configurable, name the four with their definitions, and note that edges are directed
- [x] 5.2 Confirm no module or template outside the constant writes a relation name, and no spec other than context-retrieval enumerates them
- [x] 5.3 `npm run typecheck && npm run build && npm test` exits 0
- [x] 5.4 `openspec validate fix-the-note-compass --strict` exits 0
- [x] 5.5 End to end in a scratch directory: `ctxr init`; write a note with a compass heading; `ctxr graph build`; `ctxr graph query neighbors --type Upstream` returns it; adding `retrieval.relations` to the config makes `ctxr doctor` fail naming the key; `ctxr lint` exits 0 throughout
