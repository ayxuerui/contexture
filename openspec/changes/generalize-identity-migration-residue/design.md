## Context

Three independent-but-related additions, all following directly from `remove-agent-identity` (archived, PR #15) and from auditing a real store completing its identity handback to its harness. See `proposal.md` for the motivating "why" of each. This document covers implementation approach for all three, since they touch overlapping files (`agents-doc.ts`, `procedures.ts`, `schema.ts`, `defaults.ts`) and should land as one reviewable unit.

Relevant existing mechanics this design builds on, not around:
- `renderCanonicalSection()` (`src/core/agents-doc.ts`) already renders four pieces into one fenced region (`AGENTS_MD_CANONICAL_FENCE`): root resolution, frontmatter schema, write path, procedure index.
- `ProcedureSeed.body` (`src/core/procedures.ts`) is a `(config) => string[]` function; several existing skills (`ctxr-placement`, `ctxr-submit`, `ctxr-session-lifecycle`) already render per-store by loading a template file and substituting a placeholder token.
- `ctxr rollup write`/`ctxr rollup stale` (`src/commands/rollup-{write,stale}.ts`, `src/core/rollup.ts`) already implement an idempotent fenced write (`ROLLUP_FENCE`) that stamps a `rolled_up:` frontmatter timestamp on real change, and a staleness check comparing that timestamp against the newest backlinking note's last commit, bounded by `organize.rollup_stale_days`.
- `session-reap.ts` already filters worktrees by `isSessionBranch`/`isSessionWorktreePath` and removes/deletes only merged, clean ones.

## Goals / Non-Goals

**Goals:**
- Each of the three deltas is additive and optional; a store that configures neither `session.workspaces_external` nor `organize.mission_path` sees byte-identical `AGENTS.md` output and byte-identical command behavior, except for the one new, unconditional boundary paragraph (Delta A).
- The mission mechanism reuses `rollup write`'s write path exactly — no new command, no new fenced-region marker.

**Non-Goals:**
- Backfilling a `ctxr doctor` check for a `session.workspaces_external`/`organize.mission_path` value that points at something invalid (e.g., a `mission_path` whose file doesn't exist). See Open Questions.
- Gating `ctxr session land --reap` the same way as standalone `ctxr session reap`. See Open Questions.
- Any change to `ctxr rollup gather`/`ctxr rollup write`'s command signature. The mission document is written through them completely unchanged — it is simply a note whose `--entity` happens to equal `store.config.organize.mission_path`.

## Decisions

### D1: The identity-boundary paragraph is unconditional, not gated by config
Every store gets the boundary statement, regardless of whether it configures `organize.mission_path` or `session.workspaces_external`. Rationale: the statement documents a fact about contexture's own scope (identity is not this project's concern), not something specific to one store's setup — gating it on a config key would wrongly imply stores that don't set that key have some other identity story. Alternative considered: fold it into the existing frontmatter-schema bullet list instead of its own paragraph — rejected because identity is orthogonal to frontmatter and deserves to read as its own statement, matching how `remove-agent-identity`'s proposal itself treated the concern as freestanding.

### D2: `ctxr-mission` generalizes trapped skill content instead of writing new rules from scratch
The skill's maintenance rules are lifted from a real, currently-shipping agent-persona document's own self-maintenance instructions for its priority map — content already proven at the "keep this current" level, just captured in the wrong repository. Alternative considered: write a fresh, more elaborate maintenance procedure — rejected as scope creep; the existing rules are sufficient and match the size of every other owned skill.

### D3: Mission content rides `ctxr rollup write` unmodified; only `ctxr rollup stale` gains a branch
Treating the mission document as literally an entity — write it via the same `--entity <mission_path> --content-file <file>` invocation any entity uses — costs zero new write-path code and keeps one fenced-region marker (`ROLLUP_FENCE`) and one frontmatter field (`rolled_up:`) meaning the same thing everywhere in the store. The only genuinely new logic is staleness: `checkRollupStaleness`'s existing rule is backlink-driven (`backlinksFor` walks notes for wikilinks to the entity's stem) and a store-wide mission document has no natural backlink set — nothing wikilinks "the mission." A new, self-contained `checkMissionStaleness(note, staleDays, now)` compares elapsed time since `rolled_up:` against `organize.rollup_stale_days` directly, with no backlink computation and no git log call. `findStaleRollups` gains an optional `missionPath` (and a `now` clock, threaded from `env.now()` the same way `rollup-write.ts` already does) so it can include that one path as a candidate even when it has no `ROLLUP_FENCE` yet (an unwritten mission document must be reported "stale" — i.e., needs its first write — even though `hasRollupSection` would otherwise exclude it from the entity scan). Alternative considered: a parallel `ctxr mission stale` command — rejected; `rollup stale`'s existing output shape and call sites (the `context-organize` lint finding, the CLI's own reporting) already generalize cleanly to a second candidate source.

### D4: The `PROCEDURES` list order places `ctxr-mission` next to `ctxr-rollup`
Matches the file's own existing convention (procedures are listed in a rough dependency/topic order, not alphabetically) and reflects that mission content is written through the rollup command.

## Risks / Trade-offs

- **[Risk]** A store operator sets `organize.mission_path` to a path that collides with an existing entity note already carrying a `ROLLUP_FENCE` for unrelated reasons → the mission-staleness branch and the entity-staleness branch would both evaluate that same note, potentially double-reporting it in `rollup stale`'s output. **Mitigation**: `findStaleRollups` de-duplicates by path before returning — a note matching both the entity scan and the configured `missionPath` is reported once, using the mission (time-based) rule, since that is the operator's explicit configuration choice for that specific path.
- **[Risk]** `session.workspaces_external: true` on a store where an operator still runs `ctxr session start` normally → `session reap` now refuses to clean up worktrees `ctxr` itself created. **Mitigation**: this is the intended, narrow contract — the config key is an explicit opt-in the operator sets specifically because *something else* owns worktree lifecycle; a store that wants `ctxr` to keep reaping should not set it. `ctxr session start`/`submit`/`land` (minus `--reap`) are all unaffected by this key.
- **[Trade-off]** Reusing `ROLLUP_FENCE`/`rolled_up:` for the mission document means a store's `rollup stale` output cannot distinguish "an entity's rollup is stale" from "the mission document is stale" purely from the `StaleRollupEntry` shape — both look like `{ entity: path, rolledUp, newestBacklink }`, with the mission entry's `newestBacklink` always `null`. Accepted: `null` for `newestBacklink` cannot occur in a *stale* entity entry under the pre-existing backlink rule (an entity with no backlinks is never reported stale today), so a `null` `newestBacklink` unambiguously identifies a mission-rule entry to any caller that cares, without a new field.

## Open Questions

- Should `ctxr session land --reap` also refuse under `session.workspaces_external: true`? It removes a worktree under a narrower, already-conservative condition (created by `session start`, clean, PR merged) than standalone `reap`'s worktree-path-based filter, but the underlying concern — `ctxr` should not touch a worktree an external process owns — applies to both. Deferred to a follow-up change once real usage under `workspaces_external: true` shows whether `land --reap` is actually invoked in that mode.
- Should `ctxr doctor` flag a configured `organize.mission_path` (or `session.workspaces_external` is set alongside a store that has never run `session start`, though that combination is harmless — see Non-Goals) whose file does not exist? Left unhandled here; `rollup stale` simply has nothing to report until the file exists, which is a soft failure mode (the mission pointer in `AGENTS.md` documents the path either way).
