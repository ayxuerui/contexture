## 1. Gate on the prerequisite

- [x] 1.1 Confirm `extract-agents-doc-templates` is landed: `test -f templates/agents/canonical.md && grep -q '__PROCEDURES_PATH__' templates/agents/canonical.md` — exit 0. If it is not, stop; this change edits files that change creates.
- [x] 1.2 Record the baseline occurrence count so the final gate is meaningful: `grep -rin procedure src/ test/ templates/ openspec/specs/ openspec/config.yaml | wc -l` — note the number.

## 2. Config schema accepts both keys, normalizes to the new one

- [x] 2.1 In `src/config/schema.ts`, make `harness.skills_path` and `harness.procedures_path` both optional and add the normalization from design.md (new key wins; old key falls back; neither is an error naming `ctxr migrate`), so the parsed `StoreConfig` always exposes `skills_path` and never `procedures_path`.
- [x] 2.2 Bump `SUPPORTED_SCHEMA_VERSION` to 3; rename `DEFAULT_PROCEDURES_PATH` to `DEFAULT_SKILLS_PATH` in `src/config/defaults.ts`, leaving its value `.claude/skills/` untouched.
- [x] 2.3 Add schema tests to `test/unit/config-schema.test.ts`: a v3 config with `skills_path` loads; a v2 config with only `procedures_path` loads and exposes `skills_path`; a config with both prefers `skills_path`; a config with neither fails with a message naming `ctxr migrate`.
- [x] 2.4 `npx vitest run test/unit/config-schema.test.ts` — passes.

## 3. Migration 0003

- [x] 3.1 Add `src/core/migrations/rename-procedures-path.ts` (`fromVersion: 2`, `toVersion: 3`) whose single `MigrationDelta` rewrites `contexture.yaml`: rename the key and set `schema_version: 3`. Match on the fixed historical literal `procedures_path` in the raw config, never on `config.harness.skills_path` — see design.md for why a resumed run breaks otherwise.
- [x] 3.2 Append it to `MIGRATIONS` in `src/core/migrations/registry.ts`.
- [x] 3.3 Add a `doctor` finding that reports a config still carrying the deprecated `procedures_path` key and names `ctxr migrate`.
- [x] 3.4 Add migration tests to `test/unit/migrations.test.ts` / `test/unit/migrate-command.test.ts`: `--dry-run` on a v2 store enumerates the one `contexture.yaml` delta and changes nothing; applying it renames the key and bumps to 3; re-running reports nothing pending; a v1 store runs `0002` then `0003` in order.
- [x] 3.5 `npx vitest run test/unit/migrations.test.ts test/unit/migrate-command.test.ts test/unit/check-command.test.ts` — all pass.

## 4. Rename the module and its identifiers

- [x] 4.1 `git mv src/core/procedures.ts src/core/skills.ts && git mv test/unit/procedures.test.ts test/unit/skills.test.ts` — preserves `git log --follow` across a file that just absorbed a large extraction.
- [x] 4.2 Rename the exports and their references: `ProcedureSeed`→`SkillSeed`, `PROCEDURES`→`SKILLS`, `scanProcedures`→`scanSkills`, `procedurePaths`→`skillPaths`, `renderProcedures`→`renderSkills`. Leave `syncShippedSkills`, `skillDocument`, and `SKILL_FILE_NAME` alone — already correct.
- [x] 4.3 Update every consumer to `config.harness.skills_path` and the new identifiers: `src/commands/verify.ts`, `src/commands/init.ts`, `src/commands/entry-append.ts`, `src/core/agents-doc.ts`, `src/core/reconcile.ts`, `src/core/conventions.ts`, `src/core/notes/list.ts`, `src/core/write-lifecycle/path-gate.ts`, `src/run.ts` (the `--portable` help text).
- [x] 4.4 Update the `procedures_path` config literal in every test fixture (~40 files, plus `test/fixtures/taxonomy/custom-runbook.yaml`) to `skills_path`.
- [x] 4.5 `npx tsc --noEmit -p . && npm run build` — both clean.

## 5. Generated prose

- [x] 5.1 In `templates/agents/canonical.md`: `### Procedure index` → `### Skill index`, rename the intro sentence's term, and `__PROCEDURES_PATH__` → `__SKILLS_PATH__`; update the matching substitution in `src/core/agents-doc.ts`.
- [x] 5.2 Update the exact-output assertions in `test/unit/agents-doc.test.ts` that `extract-agents-doc-templates` added — they are expected to fail here, which is the guard working.
- [x] 5.3 Add or extend a convergence check: generating the canonical section twice over an already-updated store reports `changed: false` on the second run.
- [x] 5.4 `npx vitest run test/unit/agents-doc.test.ts test/unit/update-command.test.ts test/integration/adapters-and-entry-doc.test.ts` — all pass.

## 6. Specs and project context

- [x] 6.1 Re-derive `specs/context-retrieval/spec.md` in this change from the *then-current* `openspec/specs/context-retrieval/spec.md`, in case `retrieval-legs-hardening` landed first and changed the requirement body underneath this delta.
- [x] 6.2 Rename the term in `openspec/config.yaml:30,79` ("procedure markdown" → "skill markdown") so future planning artifacts stop inheriting the old vocabulary.
- [x] 6.3 `openspec validate rename-procedures-to-skills --type change` — exits 0.

## 7. Full verification

- [x] 7.1 `grep -rin procedure src/ test/ templates/ openspec/config.yaml` (main `openspec/specs/` excluded — this project's apply/archive split means main specs update when the change is archived, not applied; this change's own delta specs already read correctly and were validated in 6.3) returns only deliberate ordinary-English uses or deliberate references to the historical `procedures_path` literal in the migration/fallback code and its tests. Beyond the two ordinary-English uses named in design.md, this surfaced and fixed three real misses: a stale `scanProcedures`/`procedures.ts` reference in `conventions.ts` and `templates.ts` (both modules had been renamed), and a wrong "AGENTS.md is a CLI-generated procedure document" description in `notes/list.ts`.
- [x] 7.2 `npm run build && npx tsc --noEmit -p .` — both clean.
- [x] 7.3 `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` — full suite green.
- [x] 7.4 `openspec validate --changes` — every active change still valid after the spec edits.

## 8. Land it

- [x] 8.1 Neither `retrieval-legs-hardening` nor `separate-scope-and-name-the-axes` has landed (both are still proposal-only change directories in this tree, not merged branches) - no rebase was needed. Committed. Not pushed.
