## 1. Model

- [ ] 1.1 Add `retrieval.relations` (default `[]`) and `retrieval.graph.{cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: []}` to the config schema, defaults, renderer, and init; migrate test fixtures
- [ ] 1.2 `buildGraphFromNotes`: cluster per node (D2); section-aware link extraction assigning `type` from the configured vocabulary (D3); `type: 'link'` otherwise
- [ ] 1.3 Tests: cluster for layered, zero-layer, and root notes; a link under a vocabulary heading is typed, under a non-vocabulary heading is `link`, after the section closes is `link`; empty vocabulary → zero typed edges; `npx vitest run test/unit/graph-model.test.ts`

## 2. Document and queries

- [ ] 2.1 `src/core/graph/document.ts` renders D5 from a `GraphBuildResult`; `graph build` writes it next to `graph.json`; `graph build --json` reports the document path and per-section counts
- [ ] 2.2 `graph query clusters`, `graph query bridges [--top n]`, `graph query neighbors --type <name>`; all honor `--as` via the existing pre-filter
- [ ] 2.3 Tests: document byte-identical across two builds of an unchanged store; hub tables capped and sorted; bridge score counts distinct clusters (D4); exempt cluster absent from orphans; `--type` narrows neighbors; `--as` hides an invisible bridge; `npx vitest run test/unit/graph-document.test.ts test/unit/graph-query.test.ts`

## 3. Skills and entry doc

- [ ] 3.1 AGENTS.md retrieval section names the document path; `ctxr-connection-finding` and `ctxr-ingest-orchestration` read it for cluster context; `ctxr-connection-proposal` groups by `retrieval.relations` (single **Related** group when empty)
- [ ] 3.2 Tests: rendered skills mention the document path and the configured vocabulary, never a hardcoded relation name; `npx vitest run test/unit/procedures.test.ts test/unit/agents-doc.test.ts`

## 4. Integration

- [ ] 4.1 `openspec/specs/cli-contract` updated for the new queries; `npm run build && npm run typecheck && npx vitest run` green; `ctxr graph build` on a temp store prints counts and the document exists under the cache path
