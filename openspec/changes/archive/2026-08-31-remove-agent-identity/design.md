## Context

See `proposal.md` — Why and Impact. Summary pointer only, not restated here.

## Goals / Non-Goals

**Goals:**
- Remove the `agent-identity` capability and every touchpoint that exists solely to serve it, leaving no half-retired surface (a config key nobody reads, a command that errors confusingly, a spec that references a deleted capability).
- Leave `ctxr session capture` correctly scoped to store notes only — a clean narrowing, not a stub with dead identity-shaped branches.
- Choose and justify a version number for the release that ships this.

**Non-Goals:**
- See `proposal.md`'s Non-Goals — no replacement mechanism, no migration tooling, no changes to how any downstream harness manages its own memory.

## Decisions

**Full removal, not a deprecation cycle.** contexture is pre-1.0 and has no stated backward-compatibility guarantee across minor versions yet (0.1.0 → 0.2.2 already shipped several breaking-shaped fixes, e.g. the CLI-version sync fix and the permission-anchor fix, without a deprecation window). A capability this narrowly scoped (three commands, one config block, one generated doc section) doesn't justify carrying dead code through a deprecation cycle for a project with, as far as this codebase's own history shows, a single real downstream store. Removing outright keeps the codebase and the spec set honest about what contexture actually does today.

**Version bump: 0.3.0, not a patch.** Every prior release this project has shipped (0.2.0, 0.2.1, 0.2.2) was additive or a pure bugfix; this is the first release that removes public surface (a command group, config keys, an adapter kind). Bumping the minor version signals "something you may depend on is gone" the way 0.2.0 signaled "something new arrived" — keeping the same signal-to-noise ratio a patch bump has held so far would bury a breaking change in a version number that looks routine.

**`session capture`'s narrowing is a real behavior change, not just an interface simplification.** Before this change, one proposal file could carry both store notes and identity deltas, applied atomically. After, a proposal carries store notes only. A caller that still submits `world_facts`/`user_facts` blocks in its proposal YAML needs those keys simply ignored or rejected — reject, loudly: silently ignoring a block the caller thought was being applied is a worse failure mode than a clear validation error naming the unsupported key. (Confirmed in `tasks.md`: `session capture` validates the proposal shape and errors on an unrecognized top-level key, rather than silently dropping it.)

**`AGENTS.md`'s identity section is dropped, not replaced with a placeholder.** A generated section that used to say "here are your identity files" has nothing accurate left to say once the capability is gone — leaving an empty or apologetic placeholder section would be worse than removing it outright. A store that still wants to point a harness at its own identity files documents that in its own operator-authored conventions, indexed the same way any other convention document already is.

**The `identity-injection` adapter kind is removed, not left as an unused but still-valid registration target.** Nothing in the adapters contract requires a kind to have zero registered instances to stay valid, but keeping a kind alive with no capability left to serve it is exactly the kind of stale surface this change exists to clean up. `adapters.spec.md`'s Purpose text (which lists the three kinds by name) is edited by hand after archive, since a delta cannot touch an existing capability's Purpose — see `tasks.md`.

**No `plan-debate`-equivalent process was run** (that's a downstream-vault convention, not one this project uses) — this decision was made directly by the project owner in conversation, after auditing real usage in a production store found the capability to be pure, driftable duplication with no independent value. That audit finding is the actual evidence behind this change, not a hypothetical architectural preference.

## Risks / Trade-offs

- **[Risk]** A downstream store with `identity` configured in `contexture.yaml` breaks on the next `ctxr doctor`/`ctxr update` after upgrading, since the config key it points at is now unrecognized. **[Mitigation]** This is a config-schema validation error, not a silent misbehavior — `doctor` names the unrecognized key. The fix is a one-line config edit (delete the `identity:` block); the identity files themselves are untouched and still readable by whatever was reading them before (a harness's own memory tool, if that's what was actually being used).
- **[Risk]** A store that genuinely relied on `AGENTS.md`'s generated identity section as its only place documenting where identity files live loses that pointer silently on `update`. **[Mitigation]** `update`'s own changelog/release notes for this version name the removal explicitly; this is a one-time, visible-in-the-diff change (the section disappears from `AGENTS.md`), not a silent behavior drift.
- **[Risk]** Removing the `identity-injection` adapter kind cannot be done without touching `AdapterKind`, `SUPPORTED_ADAPTER_INTERFACE_VERSION`, and `AdapterForKind` together — a partial removal (e.g. dropping the type but leaving the runtime enum) would type-check incorrectly or silently accept a now-meaningless kind string. **[Mitigation]** `tasks.md` groups these as one atomic task with a single verification step (typecheck + a grep for any remaining `identity-injection` string literal).
- Independently revertible: reverting restores every deleted file and requirement from git history; no data migration was performed, so there is nothing to reverse beyond the code and specs themselves.

## Migration Plan

No migration tooling ships with this change (per `proposal.md`'s Non-Goals). For an operator upgrading an existing store:
1. Remove the `identity:` block from `contexture.yaml`, if present.
2. Remove any operator-added reference to the generated `AGENTS.md` identity section (there is nothing to remove if the store never customized it).
3. If a harness-specific memory mechanism was actually in use (the common case, per this change's own motivating audit), nothing else changes — it keeps working exactly as it did, since contexture was never its write path.
4. Run `ctxr doctor` to confirm a clean config after the edit.

Rollback: revert to the prior contexture version; the identity files on disk (if any) are untouched throughout and remain readable.
