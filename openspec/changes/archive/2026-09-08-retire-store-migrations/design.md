## Context

See proposal.md — Why. What matters for the approach is the shape of what is being removed.

`src/core/migrations/` holds eight migration modules behind a `Migration { plan, apply }` interface, a registry selecting on `fromVersion >= current`, and `ctxr migrate`. The import boundary is clean: nothing outside `src/commands/migrate.ts` imports the directory, and `src/index.ts` does not re-export it. Deleting it compiles.

The part that does not delete cleanly is in `src/config/schema.ts`. Five separate accommodations exist there so a stale configuration could be *parsed by the migration about to rewrite it*:

- `HarnessSchema` accepts `procedures_path` and `conventions_path` as inputs and resolves them through `??` fallbacks
- `OrganizeSchema` accepts `archive_path` and resolves it the same way; its missing-key error tells the operator to run `ctxr migrate`
- `AdaptersFieldSchema` filters out `kind: forge` before the strict declaration schema sees it
- `StoreConfigSchema.superRefine` skips the inbox-inside-capture-root rule when `schema_version < CAPTURE_TIER_SCHEMA_VERSION`
- roughly 45 lines of comment above `SUPPORTED_SCHEMA_VERSION` recording which migration bumped it to what

Each is a second live spelling for a key the specs bind once, and each exists only because a migration had to read the file first.

Two constraints shape the delta specs. `openspec validate --strict` refuses to drop or rename a scenario inside a `## MODIFIED` block, and refuses the same requirement name in both `## REMOVED` and `## ADDED` — so a requirement whose only migration content is a scenario cannot be edited in place. And `harness-portability` carries a live scenario, *"A store predating this default keeps its own path"*, ending "with no relocation and no migration", which explicitly blesses the state issue #77 reports.

## Goals / Non-Goals

**Goals:**

- Leave exactly one live spelling for every configuration key, enforced by the schema rather than by convention.
- Make an unsupported store fail at one place, with one legible message, rather than at a zod shape error several layers in.
- Give the store a way to *notice* a branded skills path — the durable half of #77 — without making it a failure.
- Delete the tests along with what they tested, rather than leaving assertions about a mechanism that no longer exists.

**Non-Goals:**

- Any behavior change for a store at the supported schema version. Every deletion here is reachable only from a configuration no conforming store has.
- A replacement upgrade mechanism of any kind — no `--force`, no `--reinit`, no config rewriter behind another name.
- Re-deriving what `.agents/skills/` should be. The canonical location and the bridge are untouched; only the reporting of a path that has drifted onto a harness brand is new.

## Decisions

### D1 — Delete the leniency, not just the modules

Removing `src/core/migrations/` alone would leave the five accommodations in `schema.ts` reading superseded spellings forever, with nothing that could ever act on them. Their cost is not size — it is that `harness.skills_path` and `harness.procedures_path` are both live inputs, which contradicts this project's rule that a key a specification depends on is named in exactly one place.

Alternative considered: keep the fallbacks as permanent backward compatibility, delete only the modules. Rejected — a fallback with no migration behind it is a silent second contract. A store on `procedures_path` would load indefinitely onto a key no spec names, and no check would ever say so.

### D2 — Keep `schema_version`, and refuse in both directions

`schema_version` survives because it is the only thing that lets contexture say "this store predates this release" at all. What changes is the older-version branch. Today it loads (onto the D1 fallbacks) and fails `doctor` with "Run `ctxr migrate`" — an instruction to a command that will not exist.

Three options:

1. Leave the load lenient and reword the doctor check. Rejected: with the fallbacks gone, a schema-3 config has `procedures_path` and no `archive_destination`, so it would not load anyway — it would raise a zod shape error naming keys the operator never wrote, several layers away from the real cause.
2. Refuse at configuration load, naming both versions. **Chosen.** One gate, one message, symmetric with the newer-version refusal already there, and it happens before any command can half-operate.
3. Delete `schema_version` entirely. Rejected as a Non-Goal in the proposal — it would touch every command's envelope and remove the only way to distinguish "predates this release" from "malformed".

`store.schema_version_currency` is deleted rather than reworded: once a behind-version store cannot load, `doctor` can never observe one.

### D3 — Do not bump `SUPPORTED_SCHEMA_VERSION`

The bump reflex is wrong here. A version bump means "a conforming store must change"; nothing about a conforming store's shape changes. The keys being dropped are *input* spellings — no store at version 10 has written one, because `renderStoreConfig` has only ever emitted the current names. Bumping would refuse both known stores at load to advertise a change that does not touch them.

This is also why the removal is marked BREAKING in the proposal but requires no store-side action: the break is to configurations that the schema gate already refuses.

### D4 — The #77 check compares against the adapter's declared directory, and observes rather than fails

Two sub-decisions, both about not contradicting existing behavior.

*What it compares.* `effectiveSkillsDir(config, id, adapterDefault)` returns the store's `adapters[].skills_dir` override when one exists. Comparing the configured skills path against *that* would fire on a store that deliberately set the override equal to canonical to opt out of bridging — which the adapters spec supports by name. The check compares against the adapter's own declared `skillsDir` instead, so it fires on canonical drifting onto a harness's *brand*, never on a store's declared intent.

*Severity.* `observation`, so it surfaces through `lint` and never affects an exit code. `harness-portability`'s "A store predating this default keeps its own path" scenario ends "with no relocation and no migration" — an invariant check would contradict a scenario that is still live, and would fail `doctor` for a single-harness store that is working perfectly well. Issue #77 asks for "a check that flags", and flagging is what an observation does. The severity is one field; if the branded path later proves to be a genuine invariant, promoting it means changing that field and rewriting the blessing scenario, and that argument can be had on its own.

This is deliberately a second check rather than a repair of `harness_portability.skills_bridge`. That check exists to detect a *broken* bridge and short-circuits on `harnessDir === canonical` because a harness needing no bridge has no bridge to break. That short-circuit is correct for its own question; the branded-path question is a different one and gets its own check rather than a conditional bolted into the first.

### D5 — A check instead of migration 0011

Issue #77's fix and its check are not equivalent in reach. A migration would move stores that today sit on the previous shipped default, of which there are none; the check catches the *class* — canonical drifting onto any declared harness's brand — including the next shipped-default flip, which a migration written for this one would not see.

Alternative considered: ship 0011 first, then delete the mechanism in a second change. Rejected — it adds a module, its tests, and a schema bump that would refuse both live stores, to carry zero stores, and then deletes all of it.

### D6 — Edit the unarchived `archive-destination-from-taxonomy` delta

That change is implemented but unarchived, and its `context-organize` delta ADDs *"An operator-set archive destination survives migration unchanged"* — three scenarios describing a migration this change deletes. Because it has never been archived, the requirement has never reached the main spec.

Chosen: drop that delta's `## ADDED Requirements` block as part of this change's tasks. Alternative — archive it first, then REMOVE the requirement here — costs a spec sync, an archive commit, and a REMOVED block, to add and then delete the same requirement. Dropping the block is recorded in this change's proposal so the edit reads as intentional rather than as drift in someone else's change.

### D7 — What survives, and why

`.passthrough()` on `StoreConfigSchema` and `store.no_unrecognized_config_keys` both stay. Their reason — an additive field in a later package version must not fail an existing store's config load, with `doctor` as the fail-closed half — has nothing to do with migrations; the requirement's wording merely borrowed the word. Only the wording changes.

`withoutShippedDefaults` stays, because `renderStoreConfig` uses it for `init`. `redundantKeyPaths` goes, because its only production caller was the pruning migration and its doc comment describes itself as "what a migration reports it is about to remove".

### D8 — Removing the forge filter repairs `adapters[].skills_dir`, which this change's own specs depend on

Found while auditing a live store, not by reading the code. `AdaptersFieldSchema` pipes through a pre-schema
`z.object({ id, kind, module? })` to filter `kind: forge` before the strict declaration schema runs. That object does
not declare `skills_dir`, and zod strips unknown keys by default, so a store's override is discarded at config load.
`effectiveSkillsDir` then falls through to the adapter's own declared directory every time.

The key is not decorative: `AdapterDeclarationSchema` declares it, `effectiveSkillsDir` reads it, and the adapters spec
states that setting it equal to the configured skills path means no bridge is created. None of that has ever been
reachable from a `contexture.yaml`. Verified against a real store — declaring a harness with `skills_dir` pinned to the
canonical path still produced a broken-bridge doctor failure for the branded directory.

This lands here rather than as its own change because the filter is migration leniency (it exists so a store still
declaring `kind: forge` could be read by the migration that would rewrite it), so deleting it is already task 2.3. What
D8 adds is that the repair is load-bearing for this change rather than incidental: the new harness-portability
requirement's third scenario — a store-declared override is not reported — cannot be satisfied while the override is
stripped. It therefore needs a regression test of its own, not just the check's test.

## Risks / Trade-offs

**A store exists that nobody knows about, below schema 10, and is bricked by D2.** → `ctxr-cli` first published 2026-08-30 and is at 0.9.0; the download counts cannot distinguish a real install from a registry mirror, so this cannot be ruled out by data. Mitigation: the refusal message names both versions and points at the release notes, so the operator learns what happened rather than seeing a shape error; the store's contents are markdown and git, unaffected and readable without the CLI; and reinitializing over an existing directory is `init`'s documented idempotent path. This is a deliberate pre-1.0 trade: the cost of being wrong is one operator editing one YAML file.

**Deleting the `superRefine` version guard makes the inbox-inside-capture-root rule unconditional.** → Correct by construction once a below-version store cannot load: every configuration that reaches the refinement is at the supported version, which is exactly the condition the guard tested for. The guard was load-bearing only while migrations had to write configurations at older versions back to disk.

**An `observation` check is quiet enough to be missed.** → Accepted, and it is the same reach the existing orphan and broken-link observations have. The alternative fails `doctor` for a legitimately configured single-harness store, which is a worse error. If the state proves to recur, D4 records exactly what promoting it costs.

**Three requirements are removed and re-added under new names, which reads like churn in the archived spec.** → Forced by `openspec validate --strict`, not chosen: a MODIFIED block cannot drop a scenario, and each of the three carries a migration-only scenario. Each REMOVED block states the substantive behavior is unchanged and names its replacement, so the archived history reads as a rename rather than a retraction.

**A future breaking store-shape change now has no automated path.** → That is the point, but it has a cost: the next such change must write a fixup into its release notes and its own change's tasks, and no code enforces that it did. Mitigated by the new store-lifecycle requirement stating the obligation explicitly, and by the gate that makes an unmigrated store fail loudly rather than half-work — which is what makes the manual path safe.

## Migration Plan

No store migration — that is the change.

Deploy: this lands as an ordinary release. Both known stores are at `schema_version: 10` with no legacy spelling, so neither is affected by the removed leniency or the new refusal, and the new check is silent for both (each resolves its skills path to the cross-harness canonical location).

Rollback: revert the commit. Nothing on disk in any store changes, so there is no state to undo — the removed migrations were the only thing that ever wrote to a store's configuration outside `init`, and they will not have run.

Sequencing: `archive-destination-from-taxonomy` must not be archived between this change's authoring and its application, or its migration requirement lands in the main `context-organize` spec and D6's delta edit no longer suffices — a REMOVED block would be needed instead. The three other open changes (`declare-content-matching-tooling`, `exclude-candidate-from-source-check`, `rename-store-root-env-var`) declare no migration and need nothing.
