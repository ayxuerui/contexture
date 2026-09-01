## Why

`remove-agent-identity` deleted contexture's identity capability because a real store's `.contexture/identity/*.md` had become a byte-identical duplicate of files a harness (Hermes) already owned. That store is now finishing the handback: `SOUL.md`/`MEMORY.md`/`USER.md` move fully into the harness's own config directory, out of the store's git tree entirely. Auditing those files before the move turns up three facts that are genuinely store-shaped, not identity, and would otherwise be lost rather than generalized:

1. The store had no documented statement that identity/memory is out of scope — an operator or agent reading `AGENTS.md` alone has no way to know this was ever a settled question, so the next store can repeat the mistake `remove-agent-identity` just paid down.
2. One store's session lifecycle is owned by an external agent runtime (worktrees created/removed by a WebUI, not by `ctxr`), a real operating mode `store-lifecycle` has no config for today.
3. A "what's active right now" mission map — priorities, active builds, back burner, sunset candidates, debt — was hand-maintained inside the harness's persona file, drifting from the project notes it was meant to summarize, because the store had nowhere for it to live.

## What Changes

- Extends the generated `AGENTS.md` canonical section (`renderCanonicalSection` in `src/core/agents-doc.ts`) with a short paragraph stating that agent identity, persona, and durable cross-session memory are a harness concern, not this store's — the documentation counterpart to `remove-agent-identity`.
- Adds optional `session.workspaces_external: boolean` (default `false`). When true, the rendered `ctxr-session-lifecycle` skill states that worktrees are provided externally and must not be created, switched, unlocked, removed, or pruned by the procedure, and `ctxr session reap` refuses to run.
- Adds optional `organize.mission_path` naming a store's standing current-state document. When set, the canonical `AGENTS.md` section names it as a load-at-session-start document. Content is written and its staleness reported through the existing rollup mechanism (`ctxr rollup write` / `ctxr rollup stale`), extended with a time-based staleness rule for this one path (the mission document has no natural backlinks to compare against, unlike an entity rollup).
- Adds a new contexture-owned skill, `ctxr-mission`, carrying the judgment content for maintaining that document: keep it current from recent work and the store's taxonomy layers; every active priority states status, purpose, and next action; back-burner items say why they're dormant; carry sunset candidates and debt as their own sections.

## Capabilities

### New Capabilities
_None._ Delta C extends `context-organize`'s existing rollup mechanism rather than introducing a parallel one.

### Modified Capabilities
- `harness-portability`: `AGENTS.md`'s canonical section gains the identity-boundary statement and, when configured, the mission-document pointer; the shipped-skills requirement gains `ctxr-mission`; the session-lifecycle skill's rendering gains an external-workspace-ownership branch.
- `write-lifecycle`: adds the `session.workspaces_external` config key and `ctxr session reap`'s refusal when it is set — this is the capability that already governs session worktrees and `ctxr session reap` (not `store-lifecycle`, which covers `init`/schema/migrations only).
- `context-organize`: adds a time-based staleness rule for the configured mission path, alongside (not replacing) the existing backlink-based rule for entity rollups.

## Non-Goals

- Reviving contexture's deleted identity capability. No `identity` config block, no identity command group, no adapter kind — the boundary statement is prose pointing away from the store, not a mechanism for storing identity.
- Making the CLI synthesize mission content. `ctxr rollup write` writes bytes an agent already produced, exactly as it does for entity rollups today; deciding what counts as a top priority versus back burner stays procedure-markdown judgment (`ctxr-mission`), never CLI logic.
- Migrating any specific downstream store's existing persona file. This proposal generalizes the *mechanism*; moving one store's content into it is that store's own change, out of contexture's scope.
- Enforcing that an agent actually reads the mission document or the boundary statement. Per this project's enforcement rule, the only assertable guarantees here are the `session reap` refusal and `rollup stale` reporting a stale/missing mission document — both checks that exit non-zero or list a finding, never an instruction an agent could silently skip.

## Impact

Affected code:
- `src/config/schema.ts`, `src/config/defaults.ts` — `session.workspaces_external`, `organize.mission_path`.
- `src/core/agents-doc.ts` — `renderCanonicalSection` gains the boundary paragraph and the conditional mission pointer.
- `src/core/procedures.ts`, `templates/skills/ctxr-session-lifecycle.md` — external-workspace rendering.
- `src/core/procedures.ts`, new `templates/skills/ctxr-mission.md` — new owned skill, added to `PROCEDURES`.
- `src/commands/session-reap.ts` — refuses when `workspaces_external` is true.
- `src/core/rollup.ts`, `src/commands/rollup-stale.ts` — time-based staleness branch for `organize.mission_path`.
- Tests: `test/unit/agents-doc.test.ts`, `test/unit/procedures.test.ts`, `test/unit/schema.test.ts` (or equivalent config tests), `test/unit/rollup.test.ts`, `test/unit/session-reap.test.ts` or its integration equivalent.

No breaking changes: both new config keys are optional and default to the prior behavior (`workspaces_external: false`, `mission_path` unset). `schema_version` stays 2.
