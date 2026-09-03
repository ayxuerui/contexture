## 1. Configuration and schema

- [x] 1.1 Add `DEFAULT_CAPTURE_ROOT = 'raw/'` and change `DEFAULT_INBOX_PATH` to `raw/inbox/` in `src/config/defaults.ts`, replacing the doc comment that calls the inbox "a normal, retrievable directory, not an exclusion"
- [x] 1.2 Add `ingest.capture_root` to the config schema and bump `SUPPORTED_SCHEMA_VERSION` to 9 (`src/config/schema.ts:40`)
- [x] 1.3 Validate in the schema that `ingest.inbox_path` resolves under `ingest.capture_root` (design D7), with a refusal message naming both values
- [x] 1.4 `npx vitest run test/unit/config-schema.test.ts test/unit/single-source-literals.test.ts`

## 2. Migration

- [x] 2.1 Add `src/core/migrations/retain-captures-as-provenance.ts` modelled on `archive-destination-from-taxonomy.ts`: add `capture_root`; adopt `raw/inbox/` and rename the directory only where `inbox_path` still held `inbox/`; append `raw/` to `retrieval.exclude_paths` when absent
- [x] 2.2 Handle the operator-customized inbox per design D7: set `capture_root` to the inbox's parent when nested at least one level, and refuse before writing anything when it is a non-default root-level directory
- [x] 2.3 Register it in `src/core/migrations/registry.ts` and confirm `--dry-run` enumerates every change it would make
- [x] 2.4 `npx vitest run test/unit/migrations.test.ts test/unit/migrate-command.test.ts test/integration/migrate-and-doctor.test.ts test/integration/schema-gate.test.ts`

## 3. Write-lifecycle path gate

- [x] 3.1 Replace `config.ingest.inbox_path` with `config.ingest.capture_root` in `sanctionedPrefixesFor` (`src/core/write-lifecycle/path-gate.ts:88-95`), so a retained capture outside the inbox is sanctioned
- [x] 3.2 Test the new scenario: with `writable_paths` declared, a path under the capture root's dated directory passes the gate
- [x] 3.3 `npx vitest run test/unit/path-gate.test.ts test/unit/write-lifecycle-checks.test.ts test/unit/session-capture.test.ts`

## 4. Capture-tier enumeration and the dedupe index

- [x] 4.1 Add a capture lister to `src/core/notes/list.ts` reusing `walk` and the existing prefix helpers, scoped to the capture root rather than excluding it (design D2)
- [x] 4.2 Change `evaluateSourceCheck` in `src/core/ingest/model.ts` to take identity records rather than notes, leaving the two-stage order and all five verdicts unchanged
- [x] 4.3 Build the index in `src/commands/source-check.ts` as the union of captures and notes still carrying identity fields, so a pre-capture-tier note is still found
- [x] 4.4 `npx vitest run test/unit/ingest-model.test.ts test/unit/list-notes.test.ts test/unit/records.test.ts`

## 5. Hashing a binary capture

- [x] 5.1 Add `contentHashOfBytes` beside `contentHash` in `src/core/content/canonicalize.ts` — no frontmatter stripping, no text canonicalization
- [x] 5.2 Read a binary capture's hash from its markdown sidecar, resolved by the file the sidecar names
- [x] 5.3 `npx vitest run test/unit/canonicalize.test.ts test/unit/ingest-identity.test.ts`

## 6. Ingest

- [x] 6.1 Add a required `--into <note>` to `ctxr ingest` in `src/run.ts` and `src/commands/ingest.ts`; refuse a capture that already carries a source hash or ingested date
- [x] 6.2 Stamp identity onto the capture, move it from the inbox to `<capture_root>/YYYYMM/` creating the month directory lazily, and append the resulting path to the destination note's `sources` list
- [x] 6.3 Keep the catalog rebuild, now covering the destination note; confirm the retained capture takes no entry
- [x] 6.4 Retarget `ctxr source stamp` and `ctxr source add-alt` at a capture, still accepting a legacy note
- [x] 6.5 `npx vitest run test/unit/ingest-command.test.ts test/unit/source-mutations.test.ts test/integration/ingest.test.ts`

## 7. Lint observation

- [x] 7.1 Rewrite `uningestedInboxCheck` (`src/core/checks/organize-checks.ts:64-86`) to read the inbox directory rather than filter `ctx.notes()`, reporting by location and not by frontmatter
- [x] 7.2 `npx vitest run test/unit/organize-checks.test.ts test/unit/lint-command.test.ts test/integration/organize.test.ts`

## 8. Init

- [x] 8.1 Seed `ingest.capture_root` and append `raw/` to `retrieval.exclude_paths` in the config `init` writes (`src/commands/init.ts:306`)
- [x] 8.2 Create the inbox directory with a `.gitkeep`, alongside the layer directories already created at `src/commands/init.ts:349-353`, and confirm the capture root reaches neither `derived.paths` nor a generated ignore region
- [x] 8.3 `npx vitest run test/integration/init-noninteractive.test.ts test/integration/init-idempotent.test.ts test/integration/init-profiles.test.ts`

## 9. Shipped prose

- [x] 9.1 Rewrite `templates/agents/capture-and-ingest.md` for the capture tier, the two fields ingest owns, and the `--into` form; add a capture-root token beside `__INBOX_PATH__` and render it in `src/core/agents-doc.ts:94`
- [x] 9.2 Rewrite steps 1, 5 and 6 of `templates/skills/ctxr-ingest-orchestration.md` so every row of its decision table ends in an ingest that records provenance
- [x] 9.3 Update the capture, retrieve and organize sections of `README.md`, including the store-layout tree
- [x] 9.4 `npx vitest run test/unit/agents-doc.test.ts test/unit/skills.test.ts test/unit/templates.test.ts test/integration/adapters-and-entry-doc.test.ts`

## 10. Full verification

- [x] 10.1 `npm run typecheck && npm run build && npx vitest run`
- [x] 10.2 `npx openspec validate retain-captures-as-provenance --strict`
- [x] 10.3 In a scratch directory: `ctxr init`, write a capture into `raw/inbox/`, `ctxr source check` it (expect `new`), write a destination note, `ctxr ingest <capture> --into <note>`, then confirm the capture sits under `raw/YYYYMM/` with its identity, the note cites it, `ctxr source check` now reports `already_ingested`, `ctxr lint` no longer reports it, and `ctxr doctor` exits 0
