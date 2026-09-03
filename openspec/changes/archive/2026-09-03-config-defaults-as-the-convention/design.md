## Context

See proposal.md — Why. The constraints that shape the approach:

- `readConfig` (`src/config/load.ts`) runs the full schema over a store pinned at *any* older version, so the schema must stay permissive enough for every config contexture has ever written.
- `renderStoreConfig` (`src/config/render.ts`) is the only writer. Init and every migration go through it, and it round-trips its output through the schema before returning — a render that does not parse is caught before a byte reaches disk.
- Three patterns for "this key has a shipped value" already coexist: a schema default (`publish.path`), a fallback applied at the read site (`harness.convention_max_bytes`), and a required key with an unused `DEFAULT_*` constant (`ingest.inbox_path`). `HarnessSchema` even inlines `'.contexture/guidance/'` as a literal instead of reading `DEFAULT_GUIDANCE_PATH`.
- `noUnrecognizedConfigKeysCheck` derives its known-key set from the schema's shape, not from which keys are required, so making keys optional does not weaken it.

## Goals / Non-Goals

**Goals:**

- One way for a key to have a shipped value, declared once.
- A `contexture.yaml` a reader can take at face value: everything in it is a decision.
- A shipped default that can be improved later without rewriting files whose operators never chose the old value.

**Non-Goals:**

- Enforcing any particular value, reporting deviation, or changing what any key resolves to (proposal.md — Non-goals).
- Trimming `AGENTS.md`. The config records decisions; the entry document states what is true. Different jobs, and the agent-facing one keeps every resolved value.

## Decisions

**D1 — One structured `SHIPPED_DEFAULTS`, read by both the schema and the renderer.** `defaults.ts` grows a single object mirroring the config's shape, whose leaves are today's `DEFAULT_*` constants. `StoreConfigSchema` takes its `.default(...)` values from it, and `renderStoreConfig` walks it to decide what to omit. Rejected: letting each site keep its own constant reference — the schema and the renderer would then be two independent opinions about what the default is, and the first one to drift produces a file that omits a key whose resolved value is not what was omitted. The existing `single-source-literals` test is the natural place to hold this closed.

**D2 — A key gets a default only if its correct value depends on nothing.** The test, applied per key:

| Depends on | Class | Treatment |
|---|---|---|
| nothing | convention | schema default; omitted when equal |
| this store's environment | store fact | required; always written |
| another configured key | derived | required; always written |
| nothing, but absence is itself a value | opt-in | optional, no default; written only when set |

The fourth row is the one that is easy to get wrong, because such a key often *has* a shipped constant. `organize.mission_path` is the case: `DEFAULT_MISSION_PATH` exists and `init` seeds it, but six call sites branch on the key's presence (`if (store.config.organize.mission_path)`) to decide whether the store has a mission mechanism at all. Giving it a schema default would silently switch that mechanism on for every store predating it, pointing at a document none of them has. An opt-in key keeps its constant for the writer that seeds it and stays absent for everyone else.

`git.default_branch` is a store fact — it records the branch `git init` actually created, and `GitSchema`'s own comment already forbids hardcoding it. `taxonomy.profile` and `taxonomy.layers` are store facts chosen at init. `organize.archive_destination` is derived: `OrganizeSchema` today falls back to `DEFAULT_ARCHIVE_DESTINATION`, which is a live bug of exactly the kind this change must not spread — a PARA store omitting the key would resolve to `archive/` while its own taxonomy declares `archives/`, which is the defect `archive-destination-from-taxonomy` was written to fix. Making that fallback a *documented* default would bless it. It becomes required instead, and the schema reports its absence.

**D3 — Omission happens in `renderStoreConfig`, not in `init`.** Init could write a minimal literal, but the next migration's write-back re-materializes the full parsed shape and undoes it. Putting the rule in the single writer is what makes the property survive every future migration without each one remembering.

**D4 — Only an exactly-equal value is omitted.** Deep equality, order-sensitive. A store whose `exclude_paths` holds the same entries in a different order keeps its file as written: treating that as equal would silently reorder an operator's list, and the gain — omitting one more key — is not worth a write nobody asked for.

**D5 — The migration prunes, and cannot tell an echo from a deliberate agreement.** A key whose value equals the shipped default is removed whether `init` wrote it or an operator typed it. That is the intended semantic: agreeing with the convention is not a decision that needs recording, and after pruning the store still resolves the identical value. An operator who wants to pin a value against a future default change re-declares it — which is now a meaningful act rather than noise indistinguishable from the 40 lines around it.

**D6 — `harness.skills_path`'s custom "run `ctxr migrate`" error is dropped.** It only ever fired when both `skills_path` and the pre-rename `procedures_path` were absent — but an unmigrated store *has* `procedures_path`, and the transform reads it as a fallback before reaching the error. The diagnostic never caught the case it names; what it actually rejected was a config that declines to name a skills path, which is now a config that accepts the default.

**D7 — Schema version bump, because pending-ness needs one.** The new shape is strictly more permissive, so no old config stops parsing and the bump buys nothing at load time. It buys the migration a `schema_version <` predicate, which is how every migration in this repo decides whether it still has work — the rule `0002`, `0004`, `0005`, `0006` and `0009` all record.

## Risks / Trade-offs

- **A shipped default can now change under a store that liked the old value** → This is the trade being accepted deliberately, and it is the whole point: propagation without a migration. The mitigations are that a default change is a release note, and that any store can pin a value by declaring it. What is no longer possible is a store *accidentally* pinned to an old default by a line `init` wrote on its behalf.
- **A near-empty `contexture.yaml` may read as a broken store** → The file keeps its header comment, which should say where the defaults live and that omission means agreement. `AGENTS.md` and `ctxr doctor` continue to show fully resolved values, so nothing an agent or operator reads becomes less informative.
- **The migration rewrites files whose operators did not ask for a rewrite** → It is dry-runnable like every migration here, `--dry-run` enumerates each key it would remove, and no removal changes a resolved value. A store that prefers its file verbatim can decline to migrate; the schema accepts the explicit form indefinitely.
- **`SHIPPED_DEFAULTS` becomes a second place to forget a key** → A key added to the schema with a `.default(...)` that is not sourced from `SHIPPED_DEFAULTS` is a drift the `single-source-literals` test can catch, since it already reads `src/` looking for exactly this class of duplication.
- **Test fixtures across ~37 files build a full `StoreConfig` literal** → They can now build the required facts and let the schema supply the rest, but only where a fixture goes through the schema; several construct the `StoreConfig` type directly and must keep every key to type-check. Both shapes are fine — this change does not require the fixtures to be reworked, and reworking them is not counted as part of it.

## Migration Plan

1. `ctxr migrate --dry-run` enumerates each key it would remove, with the value it equals.
2. The migration removes those keys and writes through `renderStoreConfig`, whose round-trip re-parse proves the pruned file still resolves.
3. Nothing outside `contexture.yaml` is touched; no note, no derived artifact, no directory.
4. Rollback is reverting the migration commit — the pre-migration file is a valid config, then and afterwards.

## Open Questions

- Whether `ctxr update` should prune keys that become redundant *later* — a store that declared a value which a subsequent release adopts as the shipped default. Deferrable: it changes no requirement here, and the migration handles every key that is redundant at the moment this change lands.
