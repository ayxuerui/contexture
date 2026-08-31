## Why

contexture calls the same thing two names. The concept is "skill" almost everywhere it is visible: the default path is `.claude/skills/` (`DEFAULT_PROCEDURES_PATH`, `src/config/defaults.ts:43`), the files are `SKILL.md`, the shipped canonical text lives in `templates/skills/`, the store copies are `ctxr-<slug>/SKILL.md`, and `openspec/specs/harness-portability/spec.md` opens by calling them "contexture-owned skills." "Procedure" survives in TypeScript identifiers, in one store-visible config key (`harness.procedures_path`), and in scattered requirement prose — including a requirement literally titled "Procedures are reachable at a skill-discovery path."

That is not a cosmetic inconsistency. `AGENTS.md` renders a `### Procedure index` heading pointing at a directory named `skills/`, so the store's own canonical entry document — the file an agent is required to be able to read alone and still operate the store — teaches two words for one thing. The naming should be unambiguous at the point it is read.

## What Changes

- **Config key**: `harness.procedures_path` → `harness.skills_path`. The default **value** is unchanged (`.claude/skills/`), so no store's files move — only the key in `contexture.yaml` changes.
- **Migration**: `SUPPORTED_SCHEMA_VERSION` goes 2 → 3, with a new named migration that rewrites the key in `contexture.yaml` and bumps the version. Existing stores keep working after `ctxr migrate`; the store-lifecycle spec's existing dry-run and resumability requirements govern it, as they did for the visibility-field rename.
- **Code**: `src/core/procedures.ts` → `src/core/skills.ts`; `ProcedureSeed`→`SkillSeed`, `PROCEDURES`→`SKILLS`, `scanProcedures`→`scanSkills`, `procedurePaths`→`skillPaths`, `renderProcedures`→`renderSkills`. `syncShippedSkills`, `skillDocument`, and `SKILL_FILE_NAME` already read correctly and are untouched.
- **Generated prose**: the `### Procedure index` heading and its intro sentence in `templates/agents/canonical.md`, plus `__PROCEDURES_PATH__` → `__SKILLS_PATH__`.
- **Specs**: the term of art is renamed across five capabilities. Two requirement headers change name (`The procedure index reflects the files on disk`, `Procedures are portable markdown reached by path`) and one is retitled away from its now-tautological phrasing.
- **Project context**: `openspec/config.yaml:30,79` says "procedure markdown" — it is injected into every future planning artifact, so leaving it stale would keep re-teaching the old term.
- **BREAKING**: yes, for stores on schema version 2. A store's `contexture.yaml` must be migrated before commands operate. This is the mechanism the schema-version gate exists for, and the migration is a single key rename with no file movement.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `harness-portability`: the requirements that name the indexed, portable, harness-discoverable unit call it a skill rather than a procedure — including two requirement renames. No behavior changes; this is the capability where the two vocabularies collide most directly.
- `context-store`: the tool-owned home-directory requirement calls the tracked subdirectory a skill pack rather than a procedure pack.
- `cli-contract`: the requirement that every command-naming surface says `ctxr` lists "shipped procedure seeds" among those surfaces.
- `context-organize`: the placement requirement calls its own decision document a procedure.
- `context-retrieval`: the leg-routing requirement calls the store's generated guidance "procedure documentation."

## Non-Goals

- **Moving any file in any store.** `DEFAULT_PROCEDURES_PATH` is already `.claude/skills/`; only the config key's spelling changes. Reason: a directory move would turn a one-line migration into a file-relocation migration with git-history and gitignore consequences, for zero naming benefit — the path already reads correctly.
- **Renaming "procedure" where it is ordinary English.** `harness-portability/spec.md:5` and `:85` say "decision procedures," and `:143` says "the capture procedure is invoked once" — these read correctly and a blind find-and-replace would degrade them. Reason: this change renames a term of art, not a word. Every remaining occurrence is reviewed individually.
- **Touching `extract-agents-doc-templates`'s scope.** That change must land first. Reason: its entire safety property is byte-identical rendered output, and this change deliberately changes that output; running them together would destroy the verification that makes a 200-line refactor of generated agent instructions reviewable. Sequencing also makes this change cheaper — afterwards the AGENTS.md prose being renamed lives in markdown templates, where the rename is a readable diff instead of edits to quoted TypeScript fragments.
- **Adding a per-migration spec requirement.** The store-lifecycle requirements for named, dry-runnable, resumable migrations already govern this one, exactly as they governed `rename-visibility-field`.

## Impact

- **Config and migration:** `src/config/schema.ts` (key + `SUPPORTED_SCHEMA_VERSION`), `src/config/defaults.ts`, `src/config/load.ts` (must still load a pre-migration config — see design.md), new `src/core/migrations/rename-procedures-path.ts`, `src/core/migrations/registry.ts`.
- **Code:** `src/core/procedures.ts` (renamed to `skills.ts`), `src/commands/verify.ts` (16 occurrences), `src/commands/init.ts`, `src/commands/entry-append.ts`, `src/core/agents-doc.ts`, `src/core/reconcile.ts`, `src/core/conventions.ts`, `src/core/notes/list.ts`, `src/core/write-lifecycle/path-gate.ts`, `src/run.ts:522`.
- **Templates:** `templates/agents/canonical.md`.
- **Tests:** `test/unit/procedures.test.ts` (renamed), ~40 test files carrying `procedures_path` in a config fixture, plus a new migration test.
- **Specs and project context:** five delta specs, plus `openspec/config.yaml`.
- **Sequencing risk:** `retrieval-legs-hardening` has an in-flight delta modifying the same `context-retrieval` requirement this change renames prose in, and `separate-scope-and-name-the-axes` is also active. Rebase rather than renaming underneath them.
