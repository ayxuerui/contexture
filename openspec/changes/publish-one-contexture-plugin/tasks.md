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

- [x] 5.1 `npm run typecheck && npm run build && npm test` exit 0; README "Connecting chat apps" rewritten for the marketplace
- [x] 5.2 The release checklist (release PR) runs `npm run plugin` with the version bump

## 7. Plugin name, commands and the checkout rule

- [x] 7.1 Rename the plugin to `ctxr` (renamed back to `contexture` in revision 11, task 7.6): `plugins/ctxr/`, plugin.json name and displayName, build output `<out>/ctxr/` and `ctxr-claude.zip` with its ignore rule; the marketplace stays `contexture` with entry `ctxr`; the per-store ChatGPT plugin keeps `contexture-<store>`; update README, CONTRIBUTING, the connect page and tests
- [x] 7.2 Command map module (command → skill) and generated `commands/<name>.md`: full skill render plus `$ARGUMENTS`, typed-shortcut description, frontmatter `description` only; check that each maps to a carried skill and matches its render
- [x] 7.3 (superseded by 8.1) Preamble's first rule: in a checkout (a `contexture.yaml` at the root, a shell running `ctxr`), the `ctxr:`-namespaced entries are the plugin's, so invoke the un-namespaced `ctxr-<name>` skill from the store's skills folder; test its wording and that it is first
- [x] 7.4 `npm run plugin`; `claude plugin validate .` and `claude plugin validate plugins/ctxr` pass; `npm run typecheck && npm run build && npm test` exit 0
- [x] 7.6 Rename the plugin to `contexture` (revision 11): `plugins/contexture/`, `contexture-claude.zip`, commands `/contexture:<name>`, the checkout rule naming `contexture:`; MIT license text; regenerate, validate, full suite
- [ ] 7.5 Operator gate before the release PR merges: upload the built `contexture-claude.zip` to claude.ai; it installs, `/contexture:capture` is offered, and a natural request loads `ctxr-capture`

## 8. One skill text for both surfaces (D7)

- [ ] 8.1 Replace the MCP preamble and the checkout rule with one shared opening section in `templates/skills/`, included in both renders of the 11 shared skills, in this order (revision 14): which store (several connectors, ask when unclear); where (a checkout of that store means the shell, even with its connector attached; else its connector); through the server: `ctxr session <verb>` → `session_<verb>`, other `ctxr` → `ctxr`/`ctxr_write` with `args`, options as fields, `session` (always for `ctxr_write`), `input` and `@input`, paths under the session root, commits only in `session_submit`; sessions across conversations; steps not done through the server (landing, upgrading, mounts); older server; *This store*
- [ ] 8.2 Reword the remaining steps: the canonical-clone refresh in `ctxr-session-lifecycle` becomes `ctxr sync`, and it and `ctxr shared-stores sync` each say at the step to skip it through the store's server (both stay listed as unavailable in the mapping module); `git mv` in `ctxr-placement` names `Move` in the same sentence
- [ ] 8.3 The store render and the plugin render differ only in values: a test replaces each store value by its placeholder and compares; the drift check forbids a `git`/`gh` step in a shared skill unless its sentence names the server-side tool, and requires every unavailable command to carry its skip at the step
- [ ] 8.4 `npm run plugin`; `claude plugin validate`; `npm run typecheck && npm run build && npm test` exit 0

## 6. Real clients (operator checkpoint)

- [ ] 6.1 After the release: add the marketplace in claude.ai with Sync automatically, install `contexture`, keep the pkm connector; remove `contexture-pkm`; type `/contexture:capture` and check that a natural request loads the skill, not the command; in Claude Code with the plugin synced, check that a checkout follows the store's own skills
- [ ] 6.2 In claude.ai and in ChatGPT: start a session, edit, submit with a written description, see it on the approval page, request changes, answer them, approve; confirm each call in `serve`'s log and that a placeholder value was taken from *This store*; then check the updated plugin against a server one release behind, and with two stores connected at once (carries 2026-11-01-serve-the-session-lifecycle-to-chat-apps task 9.2)
