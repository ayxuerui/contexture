## 1. Store-independent render

- [ ] 1.1 MCP render with a generic configuration: each substituted value as a named `<…>` placeholder, generic text for the layer, cluster-depth and relation-grouping blocks; CLI render byte-identical
- [ ] 1.2 Preamble: placeholders are given under *This store* in the connector's instructions, AGENTS.md as the fallback, and how to choose between two contexture connectors
- [ ] 1.3 `npx vitest run test/unit/skills.test.ts` passes, including two configurations rendering byte-identically and the drift check

## 2. Server instructions

- [ ] 2.1 *This store* section in `templates/mcp/server-instructions.md`: every placeholder's value, layers with descriptions, relation vocabulary, CLI version, from the loaded configuration
- [ ] 2.2 `npx vitest run test/unit/mcp-protocol.test.ts test/integration/mcp-serve.test.ts` passes, including a configuration reload changing a value

## 3. General plugin build and the repository's marketplace

- [ ] 3.1 `ctxr plugin build` without a store: the Claude plugin (version = CLI version, no MCP entry) and the ChatGPT plugin, directories and archives
- [ ] 3.2 `npm run plugin` regenerating `plugins/contexture/`; `.claude-plugin/marketplace.json` at the repository root; a README and license for the plugin
- [ ] 3.3 Freshness test (byte comparison and version); `claude plugin validate .` and `claude plugin validate plugins/contexture` pass; `npx vitest run test/unit/plugin-build.test.ts` passes

## 4. Connect page

- [ ] 4.1 `/plugin/` as the connect page from `templates/plugin/page.html`: marketplace and plugin, the store's connector address and steps per app, the ChatGPT archive
- [ ] 4.2 `npx vitest run test/integration/mcp-serve.test.ts` passes for the page, its identity refusals and the archive

## 5. Whole suite and release

- [ ] 5.1 `npm run typecheck && npm run build && npm test` exit 0; README "Connecting chat apps" rewritten for the marketplace
- [ ] 5.2 The release checklist (release PR) runs `npm run plugin` with the version bump

## 6. Real clients (operator checkpoint)

- [ ] 6.1 After the release: add the marketplace in claude.ai with Sync automatically, install `contexture`, keep the pkm connector; remove `contexture-pkm`
- [ ] 6.2 In claude.ai and in ChatGPT: start a session, edit, submit with a written description, see it on the approval page, request changes, answer them, approve; confirm each call in `serve`'s log and that a placeholder value was taken from *This store* (carries 2026-11-01-serve-the-session-lifecycle-to-chat-apps task 9.2)
