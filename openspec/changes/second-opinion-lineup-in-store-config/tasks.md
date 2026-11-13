# Tasks

## 1. The lineup on the configuration schema (D1, D2)

- [x] 1.1 In `src/config/defaults.ts`, add the lineup as named constants and a `second_opinion` entry in `SHIPPED_DEFAULTS`: for `strong` and `fast`, `claude.model`, `codex.model`, `codex.effort` and `agy.model`, with the values `lineup.ts` holds today. No `claude.effort` entry.
- [x] 1.2 In `src/config/schema.ts`, add the `second_opinion` block:
  - strict objects for the block, each tier and each CLI;
  - every model, and `codex.effort`, `.default()` reading `SHIPPED_DEFAULTS`;
  - `claude.effort` `.optional()`; no `effort` on `agy`;
  - the block `.prefault({})` on `StoreConfigSchema`.
- [x] 1.3 Tests in `test/unit/config-schema.test.ts`:
  - a configuration with no block resolves to the shipped lineup;
  - one naming `second_opinion.strong.agy.model` resolves that cell and leaves the other five models at their defaults;
  - an unknown tier, an unknown CLI and `agy.effort` each fail to load, naming the key;
  - `renderStoreConfig` omits the block for a store that names nothing, and writes only the named cell otherwise.

  `npx vitest run test/unit/config-schema.test.ts test/unit/single-source-literals.test.ts` exits 0.
- [x] 1.4 Ship `Gemini 3.8 Flash (High)` as `strong.agy.model` (D7), and update the comment in `src/config/defaults.ts`, the README table and the tests that name the model. `npx vitest run test/unit/second-opinion.test.ts` exits 0.

## 2. Resolution and its source (D2, D3)

- [x] 2.1 In `src/core/second-opinion/lineup.ts`, replace `tiers()` with a resolver over the environment and a resolved `second_opinion` block. Each cell carries its value and its source: `environment`, `store` or `default`. An empty variable is unset. Remove every model-name literal from `src/core/second-opinion/`.
- [x] 2.2 In `src/core/second-opinion/modes.ts`, take the resolved block on the context, use the resolver wherever `tiers()` was called, print the source beside each model in `preflight`, and record it per CLI in the preflight data and in the critique and poll manifests.
- [x] 2.3 Stub-CLI tests in `test/unit/second-opinion.test.ts`, the stubs recording their `--model` and effort arguments:
  - a block naming one `strong` model reaches that CLI at the default tier, and not with `--tier fast`;
  - the environment wins over the block, in both tiers;
  - the manifest and `preflight` report `environment`, `store` and `default` correctly;
  - a stub that rejects its model is a failed critic, and no other model is asked for.

  `npx vitest run test/unit/second-opinion.test.ts` exits 0.

## 3. The command takes an optional store (D4)

- [x] 3.1 In `src/commands/second-opinion.ts` and `src/run.ts`, change `requires` to `{ store: 'optional' }` and pass the opened store's `second_opinion` block, or the schema's parse of an empty configuration when there is no store, into the context. Update the file's doc comment and `src/core/command.ts`'s, which name the commands with an optional store.
- [x] 3.2 Tests: the command run outside a store asks for the shipped defaults; run in a store fixture that names a model, it asks for that model; run in a store whose configuration carries an invalid lineup, it exits with the configuration error and no stub CLI starts. `npx vitest run test/unit/second-opinion.test.ts` exits 0.

## 4. Through the server (D5)

- [x] 4.1 In `src/core/mcp/tools/cli.ts`, give the second opinion's child the served checkout as `CONTEXTURE_STORE_ROOT`, keeping the temp folder as its working directory. Use the same served root whether or not the call names a session. If the view exposes a root that stays fixed for a snapshot, pass that one.
- [x] 4.2 Tests in `test/unit/mcp-second-opinion.test.ts`, with stub CLIs on `PATH`:
  - a served store naming a model reaches the stub through `ctxr`;
  - a session whose working copy names a different model does not: the stub is asked for the served commit's;
  - a lineup variable in the server's environment wins.

  `npx vitest run test/unit/mcp-second-opinion.test.ts test/unit/mcp-tool-alignment.test.ts` exits 0.

## 5. The skill, the plugin and the docs (D6)

- [x] 5.1 Reword `templates/skills/ctxr-second-opinion.md`: the store's `second_opinion` block for a lasting choice, the environment for one run, and a signed-in CLI that rejects its model as the store's lineup to change. Keep it free of the seven tier words and of flag attribution.
- [x] 5.2 Run `npm run plugin` and commit the regenerated `plugins/contexture/`. `npx vitest run test/unit/skills.test.ts test/unit/plugin-committed.test.ts` exits 0, and `claude plugin validate plugins/contexture` passes.
- [x] 5.3 README: the `second_opinion` block in the configuration reference with the shipped lineup, and the second-opinion section's resolution order and what `preflight` reports.
- [x] 5.4 Run `openspec validate second-opinion-lineup-in-store-config --strict`; it exits 0.
- [x] 5.5 Run `npm run typecheck && npm run build && npm test`; it exits 0.

## 6. Real CLIs (operator checkpoint)

- [ ] 6.1 After the release, in the `serve` of a store whose `agy` account is not offered `Gemini 4 Argon`, with no lineup variable set and no lineup in the store: `ctxr second-opinion preflight --require-confinement` exits 0 and reports all three CLIs up on the shipped default.

## Workflow follow-up

- Archive after `serve-the-second-opinion-to-chat-apps`, which adds the `remote-access` requirements this change's requirement sits beside.
