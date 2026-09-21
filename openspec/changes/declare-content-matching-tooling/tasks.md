Parked, not implemented. Implementation is a separate, separately-requested pass.

## 1. Config

- [ ] 1.1 `src/config/schema.ts`: add the declaration as one `.optional()` field on `RetrievalSchema` — the
      `ingest.required_capture_sections` / `serve.base_url` pattern, NOT `publish.path`, which carries a
      shipped default (D3). `retrieval` is already prefaulted on `StoreConfigSchema`, so that one field is
      the whole schema edit: no new block, and no `schema_version` bump.
- [ ] 1.2 `src/config/defaults.ts`: add nothing to `SHIPPED_DEFAULTS` — a `.default()` would need an entry
      there to pass `test/unit/single-source-literals.test.ts`, and defaulting to a tool asserts something
      about a store contexture has not looked at. Extend instead the comment enumerating what is
      deliberately absent from that object, beside `organize.mission_path` and `serve.base_url`.
- [ ] 1.3 Confirm nothing in `src/` reads the key to make a decision — the only consumer is the generated
      guidance in task 2.1. This is the property that keeps D2 deferred, so it is worth asserting rather
      than assuming.
- [ ] 1.4 Verify: `npx vitest run test/unit/config-schema.test.ts --exclude '**/.claude/**'`, with the
      absent/declared pair the other opt-in keys carry — a config omitting the key parses and resolves it
      undefined, a declared value survives the `renderStoreConfig` round trip, and a store declaring
      nothing renders no such key at all.

## 2. Surface it where the agent reads

- [ ] 2.1 `templates/agents/retrieval-leg-routing.md`: name the declared tool in the content-matching branch,
      which currently ends at "your own tooling". Use `substituteBlock`'s empty-list behavior so a store
      that declares nothing renders the section byte-identically to today — no stray line, no empty heading.
- [ ] 2.2 `test/unit/agents-doc.test.ts`: a store declaring a tool names it in the rendered section; a store
      declaring none renders exactly what it renders today.
- [ ] 2.3 Verify: `npx vitest run test/unit/agents-doc.test.ts --exclude '**/.claude/**'`; then in a scratch
      store, `ctxr init`, `ctxr update` twice, and confirm the second run reports nothing changed
      (byte-stability, both with and without the key declared).

## 3. Full verification

- [ ] 3.1 `npm run typecheck && npm run build`.
- [ ] 3.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [ ] 3.3 `openspec validate declare-content-matching-tooling --strict` and `openspec validate --specs` clean.
- [ ] 3.4 Confirm the CLI surface is unchanged: `ctxr --help` lists no new command, and
      `grep -rn "content_matching\|contentMatching" src/` shows the key read only by the guidance renderer.
