Parked, not implemented. Implementation is a separate, separately-requested pass.

## 1. Config

- [ ] 1.1 `src/config/schema.ts`: add the optional declaration under `RetrievalSchema` — schema-optional with
      no default, the `publish.path` pattern, so a `contexture.yaml` written before this key still parses
      under `readConfig`'s strict `safeParse`. No shipped default: defaulting to a tool asserts something
      about a store contexture has not looked at.
- [ ] 1.2 Confirm nothing in `src/` reads the key to make a decision — the only consumer is the generated
      guidance in task 2.1. This is the property that keeps D2 deferred, so it is worth asserting rather
      than assuming.
- [ ] 1.3 Verify: `npx vitest run test/unit/config-schema.test.ts --exclude '**/.claude/**'`, including a
      case that a config omitting the key parses.

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
