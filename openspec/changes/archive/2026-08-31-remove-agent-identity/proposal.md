## Why

Identity and cross-session memory (a persona, durable facts about the world, durable facts about the user) is a harness-level concern — the harness an agent runs in either already owns this well (Hermes's `MEMORY.md`/`SOUL.md`/`USER.md`, backed by a live `memory` tool with character caps and unique-match edits; Claude Code's own memory mechanism) or doesn't need it at all. A context store's job is retrieval and organization of content, not modeling durable agent identity — the two are orthogonal concerns that happened to get coupled together at bootstrap.

Real-world validation, from auditing a production store (a personal knowledge vault migrated onto contexture): `.contexture/identity/*.md` turned out to be a pure, byte-identical, manually-refreshed duplicate of files a harness (Hermes) already owns and already colocates in that same store (`twin/SOUL.md`, `twin/memory/{MEMORY,USER}.md`). It was never the write target, was not independently useful for anything contexture itself does, and carried a real staleness risk (nothing kept the snapshot in sync with the live source).

## What Changes

- **BREAKING**: removes the `ctxr identity add|replace|remove` command group entirely.
- **BREAKING**: removes `identity` from `contexture.yaml`'s schema (`identity.path`, `identity.files`, `identity.entry_delimiter`) — a store with this key configured needs it dropped on upgrade; `doctor`/`init` do not migrate it automatically.
- **BREAKING**: removes the `identity-injection` adapter kind from the adapters contract — a third-party identity-injection adapter has nothing left to register against.
- Removes `AGENTS.md`'s generated "Agent identity — load at session start" section; `init` and `update` no longer create, manage, or reference identity files.
- `ctxr session capture --proposal <file>` narrows to store notes only — the identity-delta handling it previously applied (world-facts/user-facts entries) is removed from its contract. A store that wants durable-fact capture routes it through its own harness's memory mechanism, outside contexture entirely.
- The write-path gate (`path-gate.ts`) no longer excludes an identity region, since there is nothing left to exclude.
- Version bump: this removes public command surface and configuration keys. The project is pre-1.0 and has so far bumped the minor version for additive feature releases (0.1.0 → 0.2.0) and the patch version for fixes; a removal of this size should not read as a patch. Confirmed direction in `design.md`.

## Capabilities

### New Capabilities
_None._

### Modified Capabilities
- `agent-identity`: every requirement is removed. The capability itself is retired — no successor requirement replaces it.
- `adapters`: the contract narrows from three adapter kinds (harness-generation, identity-injection, forge) to two (harness-generation, forge).
- `write-lifecycle`: the session-capture command's contract narrows to store notes only; drops identity-delta handling and the "unique identity match" validation step.
- `harness-portability`: the session-capture skill's contract narrows to match — drops the world-facts/user-facts proposal blocks and the "names the identity files by their resolved paths" requirement.

## Non-Goals

- Building a replacement identity/memory mechanism in contexture. This is a removal, not a redesign — if a future need for store-level identity emerges, it gets its own proposal argued on its own merits, not a revival of this one.
- Changing how any specific downstream store's harness (e.g., Hermes) manages its own identity or memory files. That machinery is entirely out of contexture's scope already; this change just stops contexture from duplicating a piece of it.
- Migrating existing stores' `.contexture/identity/*` content anywhere. A store that had identity files configured simply stops having contexture manage them after upgrading; the files themselves are untouched, ownership just reverts fully to the operator (or their harness, if any).

## Impact

Affected code (agent-identity-specific `identity` usage only — `source identity`/`node identity`/git-author-identity elsewhere in the codebase are unrelated and untouched):
- Deleted: `src/commands/identity.ts`, `src/core/identity.ts`, `src/core/checks/identity-checks.ts`.
- Modified: `src/run.ts` (drop the `identity` command group and its import, update the `adapters` command's description), `src/adapters/types.ts` (drop `IdentityInjectionAdapter`, drop `'identity-injection'` from `AdapterKind`/`SUPPORTED_ADAPTER_INTERFACE_VERSION`/`AdapterForKind`), `src/adapters/builtin/index.ts` (drop the now-stale comment about identity-injection), `src/commands/adapters-generate.ts` (drop identity-injection adapter generation), `src/config/schema.ts` (drop `IdentitySchema` and the `identity:` config field, drop `'identity-injection'` from `AdapterKindSchema`), `src/config/defaults.ts` (drop identity path defaults), `src/commands/init.ts` (drop `ensureIdentityFiles` call and identity config default), `src/core/agents-doc.ts` (drop the generated identity section), `src/core/write-lifecycle/path-gate.ts` (drop the identity exclusion), `src/commands/session-capture.ts` (drop Blocks B/C, narrow to store notes), `src/core/procedures.ts` (drop identity content from the session-capture skill template and the shipped-skills description), `src/core/errors.ts` (drop `identity.entry_match`/`identity.unknown_role` error codes), `src/core/reconcile.ts` (drop `ensureIdentityFiles` from the update/reconcile flow), `src/core/checks/manifest.ts` (drop the `IDENTITY_CHECKS` registration).
- Tests affected (delete or trim): `test/integration/agent-identity-and-adapters.test.ts`, `test/unit/identity.test.ts`, `test/unit/identity-checks.test.ts`, `test/unit/identity-command.test.ts`, `test/unit/session-capture.test.ts`, `test/unit/adapters-registry.test.ts`, `test/unit/path-gate.test.ts`, `test/unit/procedures.test.ts`, `test/unit/agents-doc.test.ts`, `test/unit/git-sequence.test.ts`.
- `openspec/specs/agent-identity/spec.md`: deleted entirely after archive (a capability with zero requirements is not a valid spec state).
- No downstream store migration tooling is added — see Non-Goals.
