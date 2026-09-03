## Why

`src/config/defaults.ts` holds a shipped value for nearly every configuration key, and `StoreConfigSchema` refuses a config that omits one. The two disagree about what a default is: the code knows the convention, the schema will not apply it.

`PublishSchema` already names the inconsistency in its own doc comment — "unlike every other tool-owned path field, this one is schema-optional with a default" — and treats itself as the exception. It is the only field that got the treatment right. `retrieval.graph.*`, `retrieval.relations`, `write_lifecycle.writable_paths`, `skills.vendored`, `ingest.tracking_params`, `ingest.capture_root` and `organize.rollup_stale_days` have since drifted the same way, one at a time, each for its own local reason. Meanwhile `ingest.inbox_path`, `retrieval.exclude_paths`, `derived.paths`, `catalog.path`, `catalog.section_max_bytes`, `session.branch_prefix`, `session.worktrees_path` and `write_lifecycle.diff_size_ceiling_lines` are still hard-required, each with a `DEFAULT_*` constant sitting unused beside it. Three patterns now coexist for the same problem: schema default, optional-with-fallback-at-the-read-site (`harness.convention_max_bytes`), and required-with-a-constant-nobody-consults.

The cost is not only that a hand-written `contexture.yaml` is rejected instead of completed. Because `init` writes every resolved value into the file, **a store cannot express that it simply agrees with contexture.** Every store restates the whole convention verbatim, so changing a shipped default reaches existing stores only through a migration that rewrites files whose operators never chose those values — and a reader cannot tell, from any store's config, which lines are decisions and which are echoes. `retain-captures-as-provenance` made this concrete: adding one key forced a migration for propagation and edits to 37 test fixtures that had to spell out a value none of them cared about.

## What Changes

- Every configuration key whose right value is a shipped convention SHALL have that value as a schema default, so a config omitting the key parses and resolves to the convention. This replaces the three coexisting patterns with one.
- **Not every key can be defaulted, and those stay required.** Three kinds are excluded, and the distinction is the design's core: `git.default_branch` records whatever branch `git init` actually created and is never hardcoded; `taxonomy.profile` and `taxonomy.layers` are chosen at init; `organize.archive_destination` resolves *through* the taxonomy profile, so its correct value is a function of another key rather than a constant — the schema cannot see the profile, and defaulting it to the flat constant would silently give every PARA store `archive/` where its own taxonomy declares `archives/`, the exact defect `archive-destination-from-taxonomy` fixed.
- **BREAKING**: `ctxr init` writes only what the store actually chose — the store facts above, plus any value that differs from the shipped default. A generated `contexture.yaml` becomes a diff against the convention: everything in it is a decision.
- `renderStoreConfig` omits a value equal to its shipped default when writing. Without this, every migration's write-back re-materializes the full resolved shape and undoes the change on the next `ctxr migrate`.
- A migration prunes keys whose value already equals the shipped default, so existing stores reach the same shape. Semantics are unchanged for every store: what was written explicitly and what is now resolved are the same value.
- **The propagation rule changes.** Today a changed shipped default must ship a migration, because every store restates the value. After this, a store that never overrode the default follows it automatically at the next release, and a migration is needed only when a store's *own* recorded choice has to move.
- `harness.skills_path`'s absence stops being a custom "run `ctxr migrate`" error and resolves to the shipped default like every other convention key. The diagnostic only ever fired when both it and the pre-rename `procedures_path` were absent, which is now simply a config that declines to name a skills path.

## Non-goals

- **Requiring any store to adopt a particular value.** `raw/` and `raw/inbox/` are the recommended convention and the shipped default; they are not enforced. An operator-chosen value is preserved verbatim, as `archive-destination-from-taxonomy` established, and the only structural rule remains the one already in the schema: the inbox sits inside the capture root.
- **Reporting deviation.** No check is added for a store whose config differs from the shipped defaults. Deviation is the point of a config file, and a lint finding that fires forever on a deliberate choice is noise. After this change deviation is already legible — it is what the file contains.
- **Rewriting values.** The migration removes redundant lines; it never changes what any key resolves to. A store's behavior before and after is identical.
- **Trimming `AGENTS.md`.** The generated entry document keeps rendering fully resolved values. An agent reading it must see what the store actually does, not what the store had an opinion about.
- **Migrating the stores on this machine.** `~/workspace/pkm` and `~/workspace/readyrun-context` each run `ctxr migrate` in their own repos, as their own changes.

## Capabilities

### New Capabilities

_None._ This is how `context-store` already describes configuration; the change makes the schema match.

### Modified Capabilities

- `context-store`: a configuration key with a shipped default may be omitted and resolves to that default; the classes of key that cannot be defaulted are stated, rather than left as an accident of which schema fields happen to be required.
- `store-lifecycle`: `init` records the store's decisions rather than the whole resolved config, and a changed shipped default propagates to a store that never overrode it without requiring a migration.

## Impact

- **Config**: `src/config/schema.ts` (defaults on every convention key, one pattern), `src/config/render.ts` (omit values equal to the default), `src/config/defaults.ts` (the constants become the schema's source, including the `'.contexture/guidance/'` literal `HarnessSchema` currently inlines instead of reading), schema version bump plus one migration.
- **CLI**: `ctxr init`'s generated `contexture.yaml` is materially shorter; `ctxr migrate` prunes redundant keys.
- **Tests**: the `StoreConfig` fixture literal repeated across ~37 test files can collapse to a shared helper carrying the store facts, which is the same duplication this change removes from real stores.
