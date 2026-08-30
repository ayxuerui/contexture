## 1. Skill content (src/core/procedures.ts only)

- [ ] 1.1 Expand `ctxr-placement` with the ordered decision procedure, the taxonomy-derived termination test, sub-item-with-promotion-trigger, visibility-as-input and the collision merge test, perishable-vs-durable routing, sibling-style matching
- [ ] 1.2 Add `ctxr-connection-proposal` (link discovery: read → extract → search → read candidates → propose by configured relation vocabulary → confirm → write → report orphans)
- [ ] 1.3 Add `ctxr-rollup` (resolve-never-create, non-entity refusal, minimum-source pushback, read-all, default section template with skip-when-empty, provenance rules)
- [ ] 1.4 Add `ctxr-session-lifecycle` (re-scan, capture pass, surgical staging, fire gates, submit, land or its manual equivalent, verify-before-retry, conflict playbook, multi-PR sequencing)
- [ ] 1.5 Add `ctxr-session-capture` (trigger/anti-trigger taxonomy, durable checklist, three-block per-item proposal, secret-marker pass, identity blast-radius rule, report from actual writes)
- [ ] 1.6 Add `ctxr-derived-artifacts` (check-before-build, count read-back, fence hand-edit rule, derived artifacts out of content commits, path-scoped commits, verify the remote)
- [ ] 1.7 Extend `ctxr-organize-audit` (move-don't-tag, visibility unchanged on retirement, verify tracked renames) and `ctxr-ingest-orchestration` (read the cluster first, decision table, hub/bridge checks via `graph query`, thesis-change rule)

## 2. Verify

- [ ] 2.1 Content tests: for each skill, assert the presence of its load-bearing rule (collision merge test; read-before-propose; refuse-to-create; fire gate; three-block proposal; check-before-build) and the absence of every shipped profile layer name and of any real context name
- [ ] 2.2 Taxonomy-derived test: a store with a terminating layer renders the termination test in `ctxr-placement`; a zero-layer store does not
- [ ] 2.3 Integration: `ctxr init` in a temp store writes all nine owned skills; `ctxr update` on a store seeded by the previous release reports the new/changed copies, and a second `update` reports nothing changed; `npm run build && npm run typecheck && npx vitest run` all green
