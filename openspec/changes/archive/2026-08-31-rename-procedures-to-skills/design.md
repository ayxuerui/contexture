## Context

See `proposal.md` — Why and What Changes. Four facts shape the approach:

1. **The specs never bound the config key.** Every requirement says "the configured procedures path," never the literal `procedures_path`. So the key's spelling is a code-and-config concern; the spec deltas are prose only.
2. **The visibility-rename precedent does not fully transfer.** `rename-visibility-field.ts` changed a *value* (`fields.visibility`), so a pre-migration config still satisfied the schema. This change renames a *key*, and `procedures_path: z.string().min(1)` (`src/config/schema.ts:146`) is required with no default — so the moment the schema demands `skills_path`, every command against an unmigrated v2 store fails Zod validation before it can tell the operator to migrate.
3. **The migration itself is small.** `DEFAULT_PROCEDURES_PATH` is already `.claude/skills/`, so no store's files move. The only on-disk delta is one line of `contexture.yaml` plus the version bump.
4. **`pendingMigrations` already sequences correctly.** Its `m.fromVersion >= fromVersion` filter returns `0002` and `0003` for a v1 store, `0003` alone for a v2 store, and nothing for v3. Appending to `MIGRATIONS` is the whole registration.

## Goals / Non-Goals

**Goals:**
- One vocabulary for the concept across code, config, generated prose, specs, and project context.
- An unmigrated store gets a message naming `ctxr migrate`, never a Zod stack trace.
- One internal name after load: the rest of the codebase reads `config.harness.skills_path` and never learns the old key existed.
- Git history survives the module rename.

**Non-Goals:**
- See `proposal.md`'s Non-Goals (no file movement, no blind find-and-replace, no per-migration spec requirement, and `extract-agents-doc-templates` lands first).
- Renaming `conventions_path` or any other `harness.*` key. Only the one term is wrong.

## Decisions

### The schema accepts both keys for one version, and normalizes to the new one

`harness.skills_path` and `harness.procedures_path` both become optional in the Zod object, with a `superRefine`/`transform` that resolves them:

- `skills_path` present → use it (a migrated store; ignore any stale `procedures_path`).
- only `procedures_path` present → use its value, so the store keeps working until migrated.
- neither → fail with a message naming the missing key and `ctxr migrate`.

The parsed `StoreConfig` always exposes `skills_path`, so `agents-doc.ts`, `verify.ts`, `notes/list.ts`, `path-gate.ts`, and every other consumer see exactly one name.

*Alternative considered — hard-require `skills_path` and have the migration read raw YAML:* the migration itself would work (it can parse the file directly), but every *other* command against an unmigrated store would fail inside Zod with a message about an unrecognised object shape rather than "this store is on schema 2, run `ctxr migrate`." Rejected: the schema-version gate exists precisely so version skew produces a legible instruction.

*Alternative considered — keep both keys permanently as aliases:* rejected. It preserves the ambiguity this change exists to remove. The fallback is a migration window; a follow-up change drops it once stores have moved, in a one-line diff.

### The migration is `0003`, single-delta, and matches on the historical literal

`src/core/migrations/rename-procedures-path.ts`, `fromVersion: 2`, `toVersion: 3`, appended to `MIGRATIONS`. `SUPPORTED_SCHEMA_VERSION` goes to 3.

One `MigrationDelta` against `contexture.yaml`: rename the key, set `schema_version: 3`. No note rewrites — unlike the visibility migration, which touched every note's frontmatter.

Follow `rename-visibility-field.ts`'s stated rule: decide what to change by matching the **fixed historical literal** `procedures_path` in the raw config, never by reading the live `config.harness.skills_path` field — that field is exactly what the migration's own last step settles, so deriving "is this done?" from it would make a resumed run misread an already-migrated store. Done-ness is "the literal `procedures_path` key is absent," which is naturally idempotent.

### `git mv` for the module, and the rename is reviewed rather than executed

`git mv src/core/procedures.ts src/core/skills.ts` (and the same for `test/unit/procedures.test.ts`) so `git log --follow` keeps working on a 740-line file that has just been through a large extraction.

The identifier renames are mechanical (`ProcedureSeed`→`SkillSeed`, `PROCEDURES`→`SKILLS`, `scanProcedures`→`scanSkills`, `procedurePaths`→`skillPaths`, `renderProcedures`→`renderSkills`), but the **prose** renames are not. These occurrences stay as they are, because "procedure" is the correct English word there and a global replace would degrade them:

- `openspec/specs/harness-portability/spec.md:5` and its requirement "The shipped skills carry decision procedures" — a skill *contains* a decision procedure; the two words are doing different work in the same sentence.
- The `REMOVED Requirements` block in this change's own delta, which must quote the old requirement names exactly.

Every other occurrence is reviewed individually against a final `grep -rin procedure`, which is a task-level gate rather than a promise.

### Generated prose changes, so byte-stability is asserted differently

`### Procedure index` → `### Skill index` in `templates/agents/canonical.md`, with `__PROCEDURES_PATH__` → `__SKILLS_PATH__`. Because this deliberately changes generated output, the exact-output assertions that `extract-agents-doc-templates` adds will fail and must be updated in the same commit — that is the mechanism working, not a problem. What must still hold is *convergence*: `ctxr update` on a store rewrites the region once and reports nothing changed on a second run.

## Risks / Trade-offs

- **[Risk]** An operator on schema 2 runs a v3 CLI, the config loads via the fallback, and they never migrate — so `contexture.yaml` keeps the old key indefinitely and the ambiguity persists in the one file operators actually read. → **Mitigation:** `doctor` reports the deprecated key as a finding naming `ctxr migrate`, so the fallback is visible rather than silent.
- **[Risk]** The rename lands under `retrieval-legs-hardening` (which has an in-flight MODIFIED of the same `context-retrieval` requirement) or `separate-scope-and-name-the-axes`, producing a conflict or a silently stale delta. → **Mitigation:** a task re-derives the `context-retrieval` delta from the then-current main spec immediately before landing, rather than trusting the copy made today.
- **[Risk]** A missed occurrence leaves a store's `AGENTS.md` saying "procedure" while its directory says `skills/` — the exact defect this change exists to remove, now harder to spot because most of it is fixed. → **Mitigation:** the final `grep -rin procedure src/ test/ templates/ openspec/specs/` gate, whose only permitted hits are the enumerated ordinary-English ones.
- **[Trade-off]** REMOVED + ADDED for three requirements, rather than RENAMED, makes the archive diff look like a deletion. Forced by the tooling: a RENAMED delta cannot relabel scenarios, and three requirements carried the old term in their scenario titles too. The REMOVED blocks state explicitly that behavior is unchanged.

## Migration Plan

1. Land `extract-agents-doc-templates` first.
2. Schema: both keys optional with normalization; `SUPPORTED_SCHEMA_VERSION` → 3.
3. Migration `0003` + registry entry + `doctor` finding for the deprecated key.
4. `git mv` the module and its test; rename identifiers; update every consumer and test fixture.
5. Generated prose and spec deltas; re-derive the `context-retrieval` delta against the then-current main spec.
6. Verify: full suite, a v2→v3 migration test including a resumed run, and the `grep` gate.

Rollback: revert the commit. A store already migrated to schema 3 would then be refused by the reverted CLI as "newer than supported" — the schema-version gate behaving correctly. Recovery is to roll forward, or hand-edit the two lines back; this is the ordinary cost of any schema bump and is why the change is one commit.
