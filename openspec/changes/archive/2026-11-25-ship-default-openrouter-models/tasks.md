# Tasks

The design changed three times while this was being built: the critics were renamed, the route moved to the configuration alone, and then the lineup became family first with a default route and a fourth critic. The tasks below describe the work as it stands.

## 1. Shipped models

- [x] 1.1 Check each OpenRouter slug in proposal.md's table against its model's own description in OpenRouter's public list, and settle the plain or `-pro` GPT slugs; record the outcome in design.md D5.
- [x] 1.2 In `src/config/defaults.ts`, hold the tools' models and the one shipped effort as one table by family then tier, and the OpenRouter slugs as another, with the review date in its comment; verify a unit test that every family has a `<vendor>/<model>` slug at every tier and every tool a model.
- [x] 1.3 Run `npx vitest run test/unit/second-opinion-openrouter.test.ts && npm run typecheck` and confirm both exit 0.

## 2. The lineup block

- [x] 2.1 In `src/config/schema.ts`, make `second_opinion` a strict object keyed by `claude`, `gpt`, `gemini` and `grok`, each with optional `via`, `strong`, `fast` and, for `claude` and `gpt`, `effort`; no key has a default and none has a `SHIPPED_DEFAULTS` value beyond the empty block.
- [x] 2.2 Refuse at load: `cli` as Grok's route, a model with no `cli` or `openrouter` route beside it, and a model for OpenRouter that is not a slug; verify a unit test for each, naming the key.
- [x] 2.3 Refuse the 0.45.0 keys with their replacement: `strong` and `fast` at the top of the block, and `codex` and `agy`; verify a unit test for each.
- [x] 2.4 Verify `ctxr init` and `renderStoreConfig` write no lineup when none is named, and only what a store named otherwise; run `npx vitest run test/unit/config-schema.test.ts` and confirm it exits 0.

## 3. Critics, routes and models

- [x] 3.1 In `src/core/second-opinion/lineup.ts`, name the critics `claude`, `gpt`, `gemini` and `grok`, and add the one table that gives the tool of each of the first three; start, sign in and describe a tool by that table.
- [x] 3.2 Add `criticRoute` and `lineupCritics`: a written `via` wins, `off` leaves a critic out, and with nothing written the route is OpenRouter where the key variable is set and the tool otherwise, with Grok out where there is no key; verify unit tests for each case and for an empty key.
- [x] 3.3 Resolve the model in `lineupCell`: through OpenRouter, the written model for the tier or the shipped slug; on a tool, the model variable, then the written model, then the shipped one, with effort likewise; verify unit tests for both routes at both tiers.
- [x] 3.4 Add the `verifier` role for Grok in `ROLE_CLI` and its persona in `templates/second-opinion/personas/verifier.md`; verify a critique with four critics writes four letters and sends each critic its own persona.
- [x] 3.5 In `resolveOptions` (`modes.ts`), take the lineup on this machine as the default set, refuse a critic in `--only` that is off or has no route here with the reason, and refuse a lineup of fewer than two; verify tests for each.
- [x] 3.6 Run `npm run build && npx vitest run test/unit/second-opinion.test.ts test/unit/second-opinion-openrouter.test.ts` and confirm it exits 0.

## 4. Refusals for one run

- [x] 4.1 Refuse, before anything starts, a non-empty `CTXR_SECOND_OPINION_CODEX_*` or `_AGY_*` model or effort variable with its new name, and a non-empty `CTXR_SECOND_OPINION_*_OPENROUTER` variable under any critic name with `second_opinion.<critic>.via`; an empty one is ignored; verify tests.
- [x] 4.2 Refuse `codex` and `agy` in `--only` with the new name; verify a test.
- [x] 4.3 Refuse a non-empty `_MODEL` variable for a critic that goes through OpenRouter, written or by default; verify that the variable still names the model of a critic on its tool.
- [x] 4.4 Drop the route variable from the help text in `src/run.ts`, and say there what the key variable does to the default; run `npx vitest run test/unit/second-opinion.test.ts` and confirm it exits 0.

## 5. Reports

- [x] 5.1 Add `route_source` (`store` or `default`) beside `route` in the critique and poll manifests and in `PreflightEntry`; verify the report scenarios of the harness-portability delta.
- [x] 5.2 Verify `preflight`'s lines for a written route, a default route with a key, and a shipped model; run `npx vitest run test/unit/second-opinion.test.ts` and confirm it exits 0.

## 6. Servers

- [x] 6.1 Update the tool description for `only`, the tool templates under `templates/mcp/`, the consent text and the second-opinion plugin's texts for four critics and the new names.
- [x] 6.2 Convert the server tests to the new block (`mcp-second-opinion`, `second-opinion-serve`, `second-opinion-detach`, `mcp-cli`), keeping the scenario that a session's working copy does not choose a route.
- [x] 6.3 Run `npm run build && npx vitest run test/unit/mcp-second-opinion.test.ts test/unit/second-opinion-serve.test.ts test/unit/second-opinion-detach.test.ts test/unit/mcp-cli.test.ts test/unit/mcp-oauth.test.ts test/integration/mcp-serve.test.ts` and confirm it exits 0.

## 7. The scheduled check

- [x] 7.1 Add `scripts/check-openrouter-models.mjs`: it reads the OpenRouter table from `src/config/defaults.ts` by pattern, so it needs no install and no build, fetches OpenRouter's public model list with no key and no identifying header, and exits non-zero naming each missing slug with its family and tier; a `--list-file` option reads the list from a file in place of the network; verify a unit test with one complete and one incomplete list file, and that the pattern reads the real table.
- [x] 7.2 Add a weekly workflow beside `vendor-check.yml` that runs the script and keeps one tracking issue open while it fails, with read-only contents permission.
- [x] 7.3 Run `node scripts/check-openrouter-models.mjs` and confirm it exits 0 against the live list.

## 8. Skill and README

- [x] 8.1 Rewrite the lineup guidance in `templates/skills/ctxr-second-opinion.md` as design.md D10 gives: the layout, the default route with and without a key, that no model is written, which tool each critic runs, the fourth stance, what to report, and the 0.45.0 spellings. Each changed step is in controlled English with a `Why:` sentence. Print no shipped slug.
- [x] 8.2 Rewrite the lineup section of `README.md` to match, with a "Coming from 0.45.0" paragraph.
- [x] 8.3 Add the rendered-skill tests for the two skill requirements; run `npm run plugin` and commit both regenerated plugins.
- [x] 8.4 Run `npx vitest run test/unit/skills.test.ts test/unit/plugin-committed.test.ts` and confirm it exits 0.

## 9. Verify

- [x] 9.1 Run `npm test && npm run typecheck` and confirm both exit 0.
- [x] 9.2 Run `openspec validate ship-default-openrouter-models --strict` and confirm it exits 0.
- [x] 9.3 Live check on one store with a real key and no lineup written: run `ctxr second-opinion preflight` and confirm four lines, each with a shipped slug and `through OpenRouter`; then run one critique and confirm four letters.

## Follow-ups outside this change

- **Release note:** the new block and what refuses the old one; that a machine holding a key now sends every critic through OpenRouter and adds Grok; each family's slugs; and to update `ctxr` on every host before a store writes the new block.
- **contexture-images:** rename the model and effort variables the compose file passes to `serve` (`_CODEX_` to `_GPT_`, `_AGY_` to `_GEMINI_`), drop the three `_OPENROUTER` ones, and update the README.
- **Sync order (done at archive, 2026-11-25):** the five earlier second-opinion changes and `publish-one-contexture-plugin` were synced first, in merge order. This change's delta then removes three of their requirements (the tier-first lineup, the `openrouter` key, the route variable) and rewords five others.
