## Why

contexture ships eight migration modules, a `ctxr migrate` command, and five legacy-key transforms in `StoreConfigSchema` — roughly 830 lines of source and 1,080 lines of test — to carry existing stores across shipped-default changes. None of it has ever run against a store.

There are two stores. Both are at `schema_version: 10`, the current version. Neither carries a pre-rename key, a retired block, or a legacy directory. Both were kept current not by `ctxr migrate` but by their operator upgrading them as each release landed. `ctxr-cli` is nine days old and pre-1.0.

Issue #77 asks for a ninth migration, moving a pre-`d8c59e7` store from `.claude/skills/` to `.agents/skills/`. There is no such store. The incident the issue documents — a Hermes runtime finding no store skills, loading a generic Obsidian skill from its own bundle, and writing notes outside the gated path — happened on a store that then fixed itself by hand, in its own repository, in a single commit. A migration would have arrived after the fix and matched nothing.

The mechanism's real cost is not the modules. It is the leniency they require: every one of those legacy-key transforms exists so a stale config can be *read by the migration that is about to rewrite it*, and each one is a second live spelling for a key the specs say is named once. That is the part worth deleting.

What issue #77 identifies correctly is that no check can currently see the state it describes. `harness_portability.skills_bridge` short-circuits on `harnessDir === canonical` — the exact equality that defines the defect — so a store whose canonical skills path has drifted onto a harness's own branded directory passes `doctor` while every undeclared harness sees no skills at all. That gap outlives the migration question and is what this change closes instead.

## What Changes

- **BREAKING**: `ctxr migrate` is removed, along with `src/core/migrations/` and every shipped migration. contexture ships no migration mechanism. A change to the store's shape now bumps `schema_version` and ships a documented one-time fixup in the release notes.
- **BREAKING**: the pre-rename config spellings stop being read. `harness.procedures_path`, `harness.conventions_path`, and `organize.archive_path` are no longer accepted as inputs; `adapters[].kind: forge` is no longer silently filtered; the inbox-inside-capture-root rule applies at every version rather than only from schema 9. Each key now has exactly one live spelling, which is what the specs already claim.
- **Fixes a latent defect**: `adapters[].skills_dir` starts working. The forge filter is a pre-schema `z.object` that does not declare the key, and zod strips unknown keys, so the override is discarded before `AdapterDeclarationSchema` — which does declare it — ever sees it. `effectiveSkillsDir` has therefore never observed a store's override, and the adapters spec's "equal to the configured skills path means no bridge is created" has never been reachable from configuration. Removing the filter repairs it.
- **BREAKING**: the schema gate becomes both-directional. A store recorded at a version *older* than the running release is refused at config load, naming both versions — where it previously loaded onto legacy fallbacks and merely failed `doctor` with an instruction to run a command that no longer exists. The newer-version and missing-version refusals are unchanged.
- `store.schema_version_currency` is removed from `doctor`: a store behind the supported version no longer loads, so the check is unreachable.
- **New**: `lint` reports when the configured skills path is a declared harness's own branded skills directory. No bridge is created for such a harness, and any harness the store has not declared finds no skills there — the state issue #77 observed, which no existing check can express. Reported, never failed: a store that deliberately keeps a branded path is behaving exactly as `harness-portability`'s "A store predating this default keeps its own path" scenario permits.
- `SUPPORTED_SCHEMA_VERSION` stays at **10**. Nothing about a conforming store's shape changes, and a bump would invalidate the two stores that are already correct.

## Non-goals

- **Shipping the migration issue #77 asks for.** No store on this machine sits at `harness.skills_path: .claude/skills/`; both resolve to the shipped `.agents/skills/` with a working bridge. A module that matches nothing is cost without cover, and the check replaces what it would have caught — including for the next shipped-default flip, which a migration written for this one would miss.
- **Removing `schema_version`.** It stays as the store-state gate, and the refusals it drives get *stronger*, not weaker. Only its remedy changes: from "run this command" to "this release does not support this store." Deleting the field would leave a shape-only read with no way to say a store predates a release, and would touch every command that echoes it in its envelope.
- **Bumping `SUPPORTED_SCHEMA_VERSION`.** A bump signals that a conforming store must change. None must — the keys being dropped are input spellings no current store uses. Bumping would strand both live stores to advertise a change that does not affect them.
- **Making the new check an invariant.** `harness-portability` already blesses a store keeping its own skills path "with no relocation and no migration." A failing check would contradict a live scenario, and the correct response to a branded path is to know about it, not to be blocked by it.
- **Relaxing `.passthrough()` or `store.no_unrecognized_config_keys`.** The passthrough exists so an additive field in a later package version never forces a store through anything — a reason that survives the migration mechanism intact. The doctor check stays as its fail-closed half.
- **Making the two live stores current.** Both are conformant with the last *published* release; the gap between that release and `main` is a release-cutting matter, and each store's own configuration drift is a commit in its own repository. Neither is contexture's to make here.

## Capabilities

### New Capabilities

_None. Every requirement this change touches belongs to a capability that already exists._

### Modified Capabilities

- `store-lifecycle`: the migration requirement is removed outright; the schema-version gate covers both directions; the two requirements whose only migration content was a scenario are replaced under new names; and a new requirement states what a shipped-shape change does now that no migration mechanism exists.
- `context-store`: the written-configuration requirement stops naming migration write-back as a second writer — `init` is now the only one.
- `store-integrity`: the rationale for the loose config schema is restated without reference to migrations.
- `harness-portability`: a new requirement covers reporting a canonical skills path that sits on a declared harness's branded directory.

## Impact

Affected code:

- `src/core/migrations/` (10 files, 749 lines) and `src/commands/migrate.ts` (82 lines) — deleted. Nothing outside the command imports the directory.
- `src/run.ts` — the `migrate` import and command registration
- `src/config/schema.ts` — the legacy-key transforms in `HarnessSchema`, `OrganizeSchema`, and `AdaptersFieldSchema`; the `CAPTURE_TIER_SCHEMA_VERSION` constant and the `superRefine` branch that reads it; the ~45-line comment block recording which migration bumped the version to what
- `src/config/load.ts`, `src/core/errors.ts` — the both-directional gate and its new error; `CaptureRootUndeterminedError` is deleted
- `src/config/render.ts` — `redundantKeyPaths` is deleted; `withoutShippedDefaults` and `renderStoreConfig` stay, since `init` is still a writer
- `src/core/checks/integrity-checks.ts` — `schemaVersionCurrencyCheck` deleted; `store.no_unrecognized_config_keys`'s message reworded
- `src/core/checks/harness-portability-checks.ts`, `src/core/checks/manifest.ts` — the new observation check
- `test/unit/migrations.test.ts`, `test/unit/migration-add-explanation-craft-skill.test.ts`, `test/unit/migrate-command.test.ts` — deleted; `test/unit/config-schema.test.ts`, `test/unit/integrity-checks.test.ts`, `test/integration/schema-gate.test.ts`, `test/integration/migrate-and-doctor.test.ts`, `test/integration/cli-name.test.ts`, `test/unit/harness-portability-checks.test.ts` — revised
- `README.md` — the migrate block, the command-reference row, and the `schema_version` paragraph

No shipped template or generated document mentions `ctxr migrate`, so no store-resident prose changes.

Sequencing: `archive-destination-from-taxonomy` is implemented but unarchived, and its `context-organize` delta ADDS "An operator-set archive destination survives migration unchanged" — three scenarios that describe a migration this change deletes. Because that change has never been archived, the requirement has never reached the main spec. This change edits that delta to drop the ADDED block rather than archiving it first and then removing the requirement; the edit is part of this change's tasks, not unrelated drift.

Downstream: none. Both known stores are at `schema_version: 10` and carry no legacy spelling, so the removed leniency and the new refusal reach neither of them. The new check is silent for both — each resolves `harness.skills_path` to the shipped `.agents/skills/`.
