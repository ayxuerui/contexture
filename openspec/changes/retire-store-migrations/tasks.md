## 1. Delete the migration mechanism

- [x] 1.1 Delete `src/core/migrations/` in full — the eight migration modules, `registry.ts`, and `types.ts`.
- [x] 1.2 Delete `src/commands/migrate.ts`.
- [x] 1.3 Remove the `migrate` import and the `program.command('migrate')` registration from `src/run.ts`.
- [x] 1.4 Delete `redundantKeyPaths` from `src/config/render.ts` and `CaptureRootUndeterminedError` from `src/core/errors.ts`. Leave `withoutShippedDefaults` and `renderStoreConfig` — `init` is still a writer (design D7).
- [x] 1.5 Delete `test/unit/migrations.test.ts`, `test/unit/migration-add-explanation-craft-skill.test.ts`, and `test/unit/migrate-command.test.ts`.
- [x] 1.6 `npm run typecheck` exits 0 — nothing outside the deleted files imported them.

## 2. Collapse the config schema to one spelling per key

- [x] 2.1 In `HarnessSchema` (`src/config/schema.ts`), drop the `procedures_path` and `conventions_path` inputs and the `??` fallbacks that read them; `skills_path` and `guidance_path` resolve from their own key or the shipped default only.
- [x] 2.2 In `OrganizeSchema`, drop the `archive_path` input and its fallback; reword the missing-`archive_destination` message so it no longer names `ctxr migrate`.
- [x] 2.3 In `AdaptersFieldSchema`, drop the `kind !== 'forge'` filter so every unrecognized adapter kind fails uniformly against `AdapterDeclarationSchema` — and so `adapters[].skills_dir` survives config load at all, which the pre-schema `z.object` has always stripped (design D8).
- [x] 2.4 Delete `CAPTURE_TIER_SCHEMA_VERSION` and the `schema_version <` early return in `StoreConfigSchema.superRefine`; the inbox-inside-capture-root rule now applies to every configuration that loads (design D2).
- [x] 2.5 Replace the migration-changelog comment block above `SUPPORTED_SCHEMA_VERSION` with a statement of what the version means now; leave the value at **10** (design D3).
- [x] 2.6 Reword `store.no_unrecognized_config_keys`'s finding message in `src/core/checks/integrity-checks.ts` so it no longer points at "a migration note", and restate the `.passthrough()` rationale comment without the word.
- [x] 2.7 Remove the legacy-key back-compat cases from `test/unit/config-schema.test.ts` — the `archive_path` case, the `procedures_path`/`conventions_path` cases, and the forge / `workspaces_external` leniency cases.
- [x] 2.8 Add a regression test asserting a configured `adapters[].skills_dir` survives `readConfig` and is returned by `effectiveSkillsDir`, so the strip cannot come back.
- [x] 2.9 `npx vitest run test/unit/config-schema.test.ts test/unit/harness-bridge.test.ts` exits 0.

## 3. Make the schema-version gate both-directional

- [x] 3.1 Add `SchemaVersionBehindError` to `src/core/errors.ts` (code `config.schema_version.behind`, usage exit code), naming the store's version, the supported version, and that this release carries no upgrade path.
- [x] 3.2 In `readConfig` (`src/config/load.ts`), refuse when the peeked `schema_version` is lower than `SUPPORTED_SCHEMA_VERSION`, alongside the existing newer- and missing-version refusals, before the strict `safeParse` runs.
- [x] 3.3 Delete `schemaVersionCurrencyCheck` from `src/core/checks/integrity-checks.ts`, drop it from the checks manifest, and remove its cases from `test/unit/integrity-checks.test.ts`.
- [x] 3.4 Extend `test/integration/schema-gate.test.ts` with the behind-version case: a store recorded at an older version exits non-zero naming both versions, and the message is the new error rather than a zod shape error.
- [x] 3.5 Rework `test/integration/migrate-and-doctor.test.ts` into a doctor-only test, or fold its surviving assertions into an existing doctor integration test and delete it.
- [x] 3.6 Drop `migrate` from the command-name regex in `test/integration/cli-name.test.ts`.
- [x] 3.7 `npx vitest run test/integration/schema-gate.test.ts test/integration/cli-name.test.ts` exits 0.

## 4. Report a skills path sitting on a harness's brand

- [x] 4.1 Add `harness_portability.skills_path_is_harness_branded` to `src/core/checks/harness-portability-checks.ts` with severity `observation`, store scope, capability `harness-portability`.
- [x] 4.2 For each configured harness-generation adapter, compare `config.harness.skills_path` against that adapter's own declared `skillsDir` — not `effectiveSkillsDir(...)`, so a store-declared `adapters[].skills_dir` override never fires it (design D4). Emit a finding naming the harness and the cross-harness canonical location.
- [x] 4.3 Register the check in `src/core/checks/manifest.ts`.
- [x] 4.4 Cover all three delta-spec scenarios in `test/unit/harness-portability-checks.test.ts`: a branded configured path reports; the cross-harness canonical path does not; a store override equal to the configured path does not.
- [x] 4.5 `npx vitest run test/unit/harness-portability-checks.test.ts` exits 0.

## 5. Documentation and spec housekeeping

- [x] 5.1 Update `README.md`: remove the `ctxr migrate` / `--dry-run` block and the command-reference row; rewrite the `schema_version` paragraph to state the refusal in both directions; drop the sentence claiming `ctxr migrate` removes keys that restate a default.
- [x] 5.2 Drop the `## ADDED Requirements` block ("An operator-set archive destination survives migration unchanged") from `openspec/changes/archive-destination-from-taxonomy/specs/context-organize/spec.md`, leaving its `## MODIFIED` block untouched (design D6).
- [x] 5.3 `grep -rn "ctxr migrate\|contexture migrate" src templates README.md` returns no matches, and `npx openspec validate archive-destination-from-taxonomy --strict` exits 0.

## 6. Verify end to end

- [x] 6.1 `npm run typecheck && npm test` — the full suite passes with the migration-only files gone.
- [x] 6.2 `npx openspec validate retire-store-migrations --strict` exits 0.
- [x] 6.3 `npm run build && node dist/bin.js --help` — the output lists no `migrate` command.
- [x] 6.4 Behind-version gate by hand: create a scratch store, set `schema_version` below the supported version in its `contexture.yaml`, then `node dist/bin.js --root <scratch> doctor` exits non-zero naming both versions, with no zod shape error in the output.
- [x] 6.5 `node dist/bin.js --root ~/workspace/pkm lint` and `node dist/bin.js --root ~/workspace/readyrun-brain lint` report no `skills_path_is_harness_branded` finding — both stores resolve to the cross-harness canonical location.
- [x] 6.6 `node dist/bin.js --root ~/workspace/readyrun-brain doctor` — both live stores report the identical check set before and after the change. Each exits 3 on a pre-existing `derived_artifacts.stale` (their catalog/graph caches lag ordinary edits); the published 0.9.0 fails the same check on the same stores, so nothing removed here was load-bearing for a conforming store.
