## 1. Store-independent render

- [x] 1.1 MCP render with no configuration input: one static map from each substituted value to a named `<…>` placeholder, generic text for the layer, cluster-depth and relation-grouping blocks; CLI render byte-identical
- [x] 1.2 Preamble: placeholders are given under *This store* in the connector's instructions, with AGENTS.md as the fallback; how to choose between two contexture connectors; what to do when a step names a tool or command the connector lacks (an older server: say so, skip or use the nearest offered step, never improvise a write)
- [x] 1.3 `npx vitest run test/unit/skills.test.ts` passes, including that the MCP render carries no value from the shipped defaults, and the drift check

## 2. Server instructions

- [x] 2.1 *This store* section in `templates/mcp/server-instructions.md`: every placeholder's value, layers with descriptions, relation vocabulary, CLI version, from the loaded configuration
- [x] 2.2 `npx vitest run test/unit/mcp-protocol.test.ts test/integration/mcp-serve.test.ts` passes, including a configuration reload changing a value

## 3. General plugin build and the repository's marketplace

- [x] 3.1 `ctxr plugin build`: without a store, the Claude plugin (version = CLI version, no MCP entry); in a store with `mcp`, also that store's ChatGPT plugin with its connector, as today
- [x] 3.2 `npm run plugin` regenerating `plugins/contexture/` (the Claude plugin directory, README and license rendered from `templates/plugin/`; archives not committed); `.claude-plugin/marketplace.json` at the repository root
- [x] 3.3 Freshness test (byte comparison of the plugin directory only, and the version); `claude plugin validate .` and `claude plugin validate plugins/contexture` pass; `npx vitest run test/unit/plugin-build.test.ts` passes

## 4. Connect page

- [x] 4.1 `/plugin/` as the connect page from `templates/plugin/page.html`: marketplace and plugin, the store's connector address and steps per app, the store's ChatGPT archive; no Claude archive
- [x] 4.2 `npx vitest run test/integration/mcp-serve.test.ts` passes for the page, its identity refusals and the archive

## 5. Whole suite and release

- [ ] 5.1 `npm run typecheck && npm run build && npm test` exit 0; README "Connecting chat apps" rewritten for the marketplace
- [ ] 5.2 The release checklist (release PR) runs `npm run plugin` with the version bump

## 6. Real clients (operator checkpoint)

- [ ] 6.1 After the release: add the marketplace in claude.ai with Sync automatically, install `contexture`, keep the pkm connector; remove `contexture-pkm`
- [ ] 6.2 In claude.ai and in ChatGPT: start a session, edit, submit with a written description, see it on the approval page, request changes, answer them, approve; confirm each call in `serve`'s log and that a placeholder value was taken from *This store*; then check the updated plugin against a server one release behind, and with two stores connected at once (carries 2026-11-01-serve-the-session-lifecycle-to-chat-apps task 9.2)
