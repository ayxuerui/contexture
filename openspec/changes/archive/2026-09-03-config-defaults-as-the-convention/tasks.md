## 1. One source for the shipped defaults

- [x] 1.1 Add a structured `SHIPPED_DEFAULTS` to `src/config/defaults.ts`, mirroring the config shape, whose leaves are the existing `DEFAULT_*` constants — no new literals
- [x] 1.2 Classify every key per design D2 and record the classification beside `SHIPPED_DEFAULTS`: convention (defaulted), store fact (`git.default_branch`, `taxonomy.*`), derived (`organize.archive_destination`)
- [x] 1.3 Extend `test/unit/single-source-literals.test.ts` so a schema `.default(...)` whose value is not sourced from `SHIPPED_DEFAULTS` fails
- [x] 1.4 `npx vitest run test/unit/single-source-literals.test.ts`

## 2. Schema defaults

- [x] 2.1 Give every convention key its default in `src/config/schema.ts`, sourced from `SHIPPED_DEFAULTS`: `ingest.inbox_path`, `retrieval.exclude_paths`, `derived.paths`, `catalog.path`, `catalog.section_max_bytes`, `session.branch_prefix`, `session.worktrees_path`, `write_lifecycle.diff_size_ceiling_lines`, `adapters`, and the whole `derived` / `retrieval` / `session` / `write_lifecycle` / `catalog` / `ingest` / `harness` blocks
- [x] 2.2 Replace `HarnessSchema`'s inlined `'.contexture/guidance/'` literal and drop the `skills_path` custom error per design D6, keeping the `procedures_path` / `conventions_path` rename fallbacks
- [x] 2.3 Fold `harness.convention_max_bytes`'s read-site fallback into the schema, and remove the fallback from the doctor check that applies it
- [x] 2.4 Make `organize.archive_destination` required, removing its `DEFAULT_ARCHIVE_DESTINATION` fallback, and confirm the message names the key
- [x] 2.5 `npx vitest run test/unit/config-schema.test.ts test/unit/catalog-checks.test.ts test/unit/harness-portability-checks.test.ts`

## 3. Writing decisions, not resolved values

- [x] 3.1 Teach `renderStoreConfig` to omit any value deep-equal to its `SHIPPED_DEFAULTS` entry (design D3, D4), keeping the round-trip re-parse
- [x] 3.2 Test the three cases: a fully-conventional config renders to store facts only; a deviating key is written; a reordered array is written rather than treated as equal
- [x] 3.3 `npx vitest run test/unit/config-schema.test.ts test/unit/json-config-merge.test.ts`

## 4. Init

- [x] 4.1 Confirm `ctxr init`'s config literal is unchanged in shape — `renderStoreConfig` does the omitting — and that the generated file carries the store facts plus a header line saying an omitted key takes contexture's shipped default
- [x] 4.2 `npx vitest run test/integration/init-noninteractive.test.ts test/integration/init-idempotent.test.ts test/integration/init-profiles.test.ts test/unit/git-sequence.test.ts`

## 5. Migration

- [x] 5.1 Bump `SUPPORTED_SCHEMA_VERSION` and add `src/core/migrations/config-defaults-as-the-convention.ts`, registered in `registry.ts`, that prunes every key deep-equal to its shipped default
- [x] 5.2 `plan()` enumerates one delta per key it would remove, naming the value it equals; `apply()` writes through `renderStoreConfig`
- [x] 5.3 Test that pruning changes no resolved value: read the config before and after, and assert the two parse to equal objects
- [x] 5.4 `npx vitest run test/unit/migrations.test.ts test/unit/migrate-command.test.ts test/integration/migrate-and-doctor.test.ts test/integration/schema-gate.test.ts`

## 6. Documentation

- [x] 6.1 State the rule in `README.md`'s configuration section: an omitted key takes the shipped default, the file records decisions, and the three key classes that stay explicit
- [x] 6.2 `npx vitest run test/unit/templates.test.ts test/unit/agents-doc.test.ts`

## 7. Full verification

- [x] 7.1 `npm run typecheck && npm run build && npx vitest run`
- [x] 7.2 `npx openspec validate config-defaults-as-the-convention --strict`
- [x] 7.3 In a scratch directory: `ctxr init`, then read `contexture.yaml` and confirm it names the taxonomy, the default branch and the archive destination and omits the convention keys; run `ctxr doctor` (expect 0) and confirm `AGENTS.md` still renders the resolved inbox and capture paths
- [x] 7.4 In a second scratch store: write a full pre-migration config by hand, run `ctxr migrate --dry-run` and check it enumerates each removable key, then `ctxr migrate` and confirm `ctxr doctor` exits 0 and every path resolves as before
