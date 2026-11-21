# Tasks

## 1. The lineup key and route resolution

- [x] 1.1 Add the optional `openrouter` key (non-empty string, no default, no `SHIPPED_DEFAULTS` entry) to each entry of `secondOpinionTier` in `src/config/schema.ts`; verify a unit test loads a configuration with it, refuses an unknown sibling key by name, and that `single-source-literals.test.ts` still passes.
- [x] 1.2 Extend `lineupCell` in `src/core/second-opinion/lineup.ts` to return the route (`cli` or `openrouter`) with the model or slug and its source, in the order design.md D2 gives; verify unit tests for each of the four steps, for an empty variable counting as unset, and for effort being dropped on the OpenRouter route.
- [x] 1.3 Raise a `SecondOpinionUsageError` naming both variables when `_OPENROUTER` and `_MODEL` are both set for one entry, in `resolveOptions` before anything starts; verify a test that no stub CLI ran and the exit code is the usage code.
- [x] 1.4 Verify `ctxr init` writes no `openrouter` key (extend the existing written-configuration test), then run `npx vitest run test/unit/second-opinion.test.ts test/unit/single-source-literals.test.ts && npm run typecheck` and confirm both exit 0.

## 2. The request

- [x] 2.1 Confirm against OpenRouter's current documentation the chat-completions path, the response fields read (`choices[0].message.content`, `model`), the error body's shape, and the provider-routing field that declines data collection (design.md D5); record what was confirmed, with the date, in the new module's header comment. If the field differs from D5, update design.md and the spec delta before writing code.
- [x] 2.2 Add `src/core/second-opinion/openrouter.ts`: one function that takes a slug, a prompt, a timeout, a key and a base address and resolves to the same `CliResult`-shaped outcome `runCli` gives, never rejecting; no tools, no identifying headers, aborts at the timeout; verify with a localhost stub server that records requests.
- [x] 2.3 Cover the failure causes with the stub: an error status with a message, a hung response past the timeout, a refused connection, an empty answer and an unreadable body; verify each is `ok: false` with a distinct cause and that no cause contains the stub key.
- [x] 2.4 Establish how Node 26's `fetch` treats `HTTPS_PROXY` (with and without `NODE_USE_ENV_PROXY`) by running a request through a local stub proxy; record the result in the module comment and in the skill's failure signatures (task 5.2), then run `npx vitest run test/unit/second-opinion-openrouter.test.ts` and confirm it exits 0.

## 3. Wiring the route into the command

- [x] 3.1 Add a test helper that starts the stub endpoint and returns its address for `CTXR_SECOND_OPINION_OPENROUTER_URL`; verify it by a critique in which one entry is routed, that entry's stub CLI is never started and the other two are.
- [x] 3.2 Route critique and poll in `src/core/second-opinion/modes.ts` through the request when an entry resolves to OpenRouter, skipping the `agy` argument-size limit and the confined run for it; add `route` to `CritiqueEntry` and `PollAnswer`; verify the manifest scenarios of the harness-portability delta (routed entry, other tier unaffected, blind answer, failed critic not replaced).
- [x] 3.3 Route `preflight` for an OpenRouter entry as a ping with the tier's slug and no help-text check, with `route` in `PreflightEntry` and the line format of design.md D6; verify the three preflight scenarios, including the failed-check exit for a missing key.
- [x] 3.4 Read the key at request time only; report a missing key as a failed critic naming `OPENROUTER_API_KEY`; add `OPENROUTER_` to `PROTECTED_PREFIXES` in `environment.ts`; verify stub CLIs never see the key, that naming it in the pass-through exits with the usage code, and that a detached run's folder, manifest, raw files and both output streams contain no occurrence of the stub key.
- [x] 3.5 Make `--require-confinement` refuse only when a requested entry resolves to its CLI, in `resolve` and in `validateDetached`; verify both scenarios of the cli-contract delta on a machine (or with a stub `setpriv`) that cannot confine.
- [x] 3.6 Update the help text in `src/commands/second-opinion.ts` to name the new variables; run `npx vitest run test/unit/second-opinion.test.ts test/unit/second-opinion-detach.test.ts test/unit/second-opinion-runs.test.ts && npm run typecheck` and confirm both exit 0.

## 4. The server's environment

- [x] 4.1 In `childEnv` (`src/core/mcp/tools/cli.ts`), withhold `OPENROUTER_API_KEY` unless the command is one of `SECOND_OPINION_COMMANDS`; verify with a stub command that records its environment, for `ctxr` with `["lint"]`, for `ctxr_write` in a session, and for a second opinion.
- [x] 4.2 Verify a member's session cannot change the route: a session that adds a slug in its working copy still runs every critic as its CLI through the `ctxr` tool, and the tool result of a routed run does not contain the key.
- [x] 4.3 Run `npx vitest run test/unit/mcp-second-opinion.test.ts` and confirm it exits 0.

## 5. The skill and the tool description

- [x] 5.1 Update `templates/skills/ctxr-second-opinion.md` per design.md D8 (preflight, the plan-from-someone-else paragraph, the lineup section with a placeholder slug, the disclosure in the report, the spending limit on the key); verify the rendered-skill test asserts each statement of the harness-portability delta's skill requirement and that the skill's banned-wording test passes.
- [x] 5.2 Add the failure signatures: a missing key, a slug OpenRouter refuses, a data-policy refusal, and the proxy behavior found in 2.4; verify by the same rendered-skill test.
- [x] 5.3 Update `templates/mcp/ctxr.md` only if its second-opinion line needs it (the key and route are the operator's on the server); verify the MCP render test passes.
- [x] 5.4 Add the `openrouter` key, the key's variable and the route variables to the README's two second-opinion paragraphs (the skills paragraph, which says the command only invokes model CLIs, and the lineup paragraph); run `npx vitest run test/unit/skills.test.ts test/unit/plugin-build.test.ts` and confirm it exits 0.

## 6. Integration

- [x] 6.1 Run `npm test` and `npm run typecheck`; confirm both exit 0.
- [x] 6.2 Run `openspec validate second-opinion-through-openrouter --strict` and confirm it reports the change valid.
- [ ] 6.3 With a real key on a host, in a scratch store that sets `second_opinion.strong.agy.openrouter`, run `node dist/bin.js second-opinion preflight --tier strong` and confirm the `agy` line reads `OK` through OpenRouter with the slug and `store configuration`; then run one critique of a three-step plan and confirm the manifest's `route` and `model_reported` for that critic.
- [x] 6.4 Rebuild the plugin with `npm run plugin` and confirm `git status` shows only the expected skill text changes under `plugins/contexture/`.

## Workflow follow-up

- Open a contexture-images change that passes `OPENROUTER_API_KEY` and the three `CTXR_SECOND_OPINION_<CLI>_OPENROUTER` variables to `serve`.
- The release note says to update `ctxr` on every host before a store sets the key, since an earlier `ctxr` refuses a lineup that carries it.
- Sync and archive after review, after the three earlier second-opinion changes if they are still open.
