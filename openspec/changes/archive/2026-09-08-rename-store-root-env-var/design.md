## Context

See proposal.md — Why. The constraints that shape the approach:

- Root resolution is one small module (`src/core/root.ts`) with two entry points — `resolveExistingRoot` for every command and `resolveRootForInit` for `init` — each reading the variable exactly once. The rename itself is trivial; everything interesting is about what happens to the old name.
- `harness-portability` requires the root be addressable by **exactly one** environment variable, with no alias. That rules out honoring both names, so a migration window that quietly accepts the old spelling is not available.
- The variable's value is a path, and the fallback when it is absent is *walking up from the current directory*. So an ignored variable does not fail — it resolves a different, plausible-looking store. This is the failure mode the design has to close.
- The variable has readers outside this codebase. `pkm` resolves it in `.claude/lib/vault_resolve.py` and an ingest script, and twelve of its skill documents instruct agents to use `$CONTEXTURE_ROOT` directly; `readyrun-context` sets it in `.docker/docker-compose.yml`. Those repositories migrate on their own schedule, so a partly-migrated environment is the expected state for a while, not an edge case.
- The shipped root-resolution sentence lives in `templates/agents/canonical.md` and is generated into every store's `AGENTS.md`, asserted byte-exact by `test/unit/agents-doc.test.ts`. Existing stores carry the old sentence until `ctxr update` reconciles the region.

## Goals / Non-Goals

**Goals:**

- One environment variable name, unambiguous against `.contexture/` at the point it is read, and a written rule for how the concept is spelled in every other register.
- A half-migrated environment fails loudly instead of operating on the wrong store.
- No store migration, no schema bump, no change to any store-resident file's name.

**Non-Goals:**

- Migrating the client stores, or coordinating a release with them.
- Renaming anything read inside a contexture-supplied context — internal identifiers, the `--root` flag, spec directory names.
- Sweeping existing prose to adopt "knowledge store." D6 makes the product noun available; which sentences actually change is editorial and carries its own diff.

## Decisions

### D1 — `CONTEXTURE_STORE_ROOT`: keep the prefix, add the noun

The defect is a missing noun, not an unwanted prefix. `.contexture/` is the tool's home directory *inside* the store, so "the contexture root" most literally denotes that directory, while the variable means its parent. Adding `STORE` disambiguates the two.

The prefix stays because the environment is the one namespace contexture does not own. A bare `STORE_ROOT` identifies no owner in `env` output, a Dockerfile, or a CI matrix, and collides with generic tooling; `CONTEXTURE_ALLOW_DEFAULT_BRANCH_PUSH` would also be left as the only prefixed member of a one-member family, which breaks "unset everything `CONTEXTURE_*`" as a debugging instruction.

Alternatives considered: **`STORE_ROOT`** — shorter, but unowned in a global namespace and inconsistent with the sibling variable. **`CONTEXT_STORE_ROOT`** — uses the project's own category noun, but a category prefix is exactly what a competing tool in the same space would also choose, and it shares seven leading characters with `CONTEXTURE_`, so the two read as typos of each other. **`CONTEXTURE_KNOWLEDGE_STORE_ROOT`** — 31 characters to distinguish the store from `.contexture/`, which `STORE` alone already does. **Leaving `CONTEXTURE_ROOT`** — the ambiguity is real and gets worse as more tool-owned files land under `.contexture/`.

### D2 — The old name is refused, never resolved

When `CONTEXTURE_ROOT` is set and `CONTEXTURE_STORE_ROOT` is not, root resolution exits non-zero naming both. It is never used as a root value, so the one-variable requirement holds — refusing is not resolving.

The alternative, ignoring it, is the dangerous one: resolution falls through to walking up from the current directory, which usually succeeds, so the operator gets no error and a different store. With `pkm`'s Python resolver reading the old name independently of the CLI, "ctxr resolves store A while a skill script resolves store B off the same shell" is a reachable state, and neither side reports anything wrong. A non-zero exit converts that into a one-line fix.

Honoring the old name with a deprecation warning was rejected: it violates the one-variable requirement outright, and it leaves the two-stores divergence open for the length of the deprecation window rather than closing it.

### D3 — An explicit `--root` suppresses the refusal

The refusal fires only when the environment would otherwise have been consulted. With `--root` given, precedence never reaches the environment, there is no ambiguity about which store is meant, and refusing would break working invocations for anyone who merely still has the old variable exported. This keeps the refusal targeted at the case it exists for.

### D4 — No companion variable for `.contexture/`

A `CONTEXTURE_CONFIG_ROOT` naming the tool home was considered and rejected on three grounds. The name misleads: `contexture.yaml` sits at the store root, beside `.contexture/`, not within it, so an operator would reasonably point it at the store root — the other variable. The referent is not addressable: nothing resolves `.contexture/` as a unit; it is the default prefix of four independently configured keys, and `context-store` has a scenario for stores whose paths predate it and sit at root level. And layout belongs in configuration, not the environment — `context-store` requires every component read these locations from configuration so the store stays self-describing, which is what lets an agent in CI and a human at a terminal agree about where the catalog is.

### D5 — No migration module, no schema bump

Nothing in `contexture.yaml` references the variable; it is operator environment, not store state. Unlike `rename-conventions-path`, there is no stored value to rewrite, so `src/core/migrations/` gains nothing and `SUPPORTED_SCHEMA_VERSION` does not move. The only store-resident text that changes is the generated `AGENTS.md` paragraph, which the existing generated-region reconcile already handles.

### D6 — The naming split by register: prefixed in the environment, bare everywhere else

The same concept carries two spellings on purpose. In the environment it is `CONTEXTURE_STORE_ROOT`; in `contexture.yaml`, in code, and in any flag or key added later it is bare `store_root` / `storeRoot`. The rule is point-of-use clarity, not global consistency: a name read in a namespace contexture does not own must identify its owner, and a name read inside a file, module, or command contexture already supplies must not repeat what the surrounding context has established.

The config side has a precedent rather than an invention — `ingest.capture_root` is already bare snake_case in `contexture.yaml`, and `store_root` follows it exactly. There is no root config key today and this change does not add one (the root is *how* the config file is found, so it cannot be declared inside it); the convention is recorded for whatever key, flag, or field names the concept next.

Recording it in `openspec/config.yaml` follows cli-distribution-identity, which put its `ctxr`/`contexture` split in the project context "so future specs do not drift between the two names." The same hazard applies here: without the rule written down, the next spec to touch the root has to re-derive whether to prefix it.

Separately, **"knowledge store" is available as the product noun in prose** — the README, the pitch, what an agent says about what it is doing. That register is not governed by the identifier rule and does not feed back into it. Naming the contents "knowledge" while the container is a "store" is the same split the harness-portability boundary statement already draws when it says the store holds knowledge and skills.

## Risks / Trade-offs

- **An operator with the old variable exported hits a hard failure on the next command.** → Intended, and the message names both spellings so the fix is a single rename. This is the trade the change is making: a loud failure now instead of a silent wrong-store later.
- **`pkm` and `readyrun-context` break until migrated.** → The refusal makes the breakage immediate and self-describing rather than latent. Their migration is scoped in proposal.md — Impact and is the operator's follow-up.
- **Refusal logic could itself become a permanent alias-shaped fixture.** → It is scoped to one superseded name and asserted by scenarios in the delta; whether to drop it after the clients migrate is left to a later change, and it carries no resolution behavior in the meantime.
- **Stores keep serving the old sentence in `AGENTS.md` until reconciled.** → `ctxr update` rewrites the generated region; a store that never updates keeps documented instructions that no longer match the CLI, which is the same staleness any generated-region change carries.
- **Conflict with the unmerged `isolate-the-portability-test` change**, which names the variable in its scrubbed child environment. → Land that change first and absorb the rename here; the overlap is a handful of lines in one module and two planning files.

## Migration Plan

1. Land `isolate-the-portability-test` first, so the scrubbed-environment code exists with the old name and is renamed once.
2. Rename in `src/core/root.ts`, add the refusal check and its error, update `src/core/errors.ts` and the `--root` help text.
3. Update `templates/agents/canonical.md` and the byte-exact assertion that guards it, then `README.md` and `scripts/verify-phase0.sh`.
4. Update the `harness-portability` spec and retire the deferred-noun line in `openspec/config.yaml`.
5. Release, then migrate `readyrun-context` (2 files) and `pkm` (18 files), running `ctxr update` in each to reconcile the generated `AGENTS.md` region.

Rollback: revert the commit. Nothing persisted changes, so no store is left in an intermediate state — an operator who has already renamed their export would need to rename it back.

## Open Questions

- Whether the refusal check stays permanently or is removed once both client stores have migrated. It can be answered after the clients land without changing these specs or this approach, since removing it only narrows behavior that the delta already scopes to a named superseded variable.
