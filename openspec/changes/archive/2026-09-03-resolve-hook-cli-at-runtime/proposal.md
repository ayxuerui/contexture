## Why

`ctxr adapters generate` renders `.claude/hooks/claude-code-write-gate.sh` with the generating
machine's absolute `dist/bin.js` path baked in (`resolveOwnBinPath()`, `src/core/hooks.ts:14`,
substituted at `src/commands/adapters-generate.ts:57,66`). That rendered file is version-controlled,
so the path ships to every clone, worktree, container, and collaborator — where it almost never
exists. When it's missing, the script fails open: it warns on stderr and exits 0, so the write gate
— the control that denies edits under the store root outside the active session worktree — silently
never runs. `templates/hooks/pre-commit.sh` (installed by `ctxr init`, also committed) has the
identical baked-path-plus-fail-open pattern, silently skipping `doctor --staged` validation on any
machine but the one that generated it. `openspec/specs/adapters/spec.md` already states the
enforcement principle this violates: "an enforcement primitive that cannot run MUST NOT cause the
edit it would have evaluated to be silently allowed" — the shipped script doesn't meet its own spec.

## What Changes

- Both generated hook scripts resolve the `ctxr` CLI at **runtime**, not at generate time: an
  explicit `CONTEXTURE_BIN` environment override if set, otherwise `ctxr` on `PATH`. No path is
  baked into the rendered file, so it is byte-identical on every machine — the property you want
  from something committed.
- **BREAKING** (hook behavior, not a public API): when neither resolves, the write-gate hook now
  denies the edit (a structured `permissionDecision: "deny"` body naming the fix) instead of warning
  and allowing it; the pre-commit hook now refuses the commit (exit 1, naming the fix) instead of
  skipping validation. Both replace a silent pass-through with the fail-closed behavior the
  enforcement they exist for was always supposed to have.
- `resolveOwnBinPath()` and the `binPath` field it fed (`PermissionConfigInput.binPath`) are removed
  — nothing computes an install-local path anymore.
- The two templates' identical resolution logic is factored into one shared partial inlined into
  both, so they can't independently drift on how they decide whether `ctxr` is available.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `adapters`: "A harness's generated permission config scopes writes to the active session
  worktree" gains the requirement that a generated enforcement primitive locates the CLI it invokes
  from the runtime environment, never from a path resolved on the generating machine, and that a
  primitive unable to locate the CLI denies the edit rather than allowing it.
- `write-lifecycle`: "Commits are validated before they are accepted" gains the same runtime
  resolution and fail-closed requirement for the pre-commit hook.

## Impact

- `templates/hooks/claude-code-write-gate.sh`, `templates/hooks/pre-commit.sh`: rewritten to resolve
  `ctxr` at runtime and fail closed.
- `templates/hooks/_resolve-ctxr.sh` (new): the shared resolution partial.
- `src/core/hooks.ts`: `resolveOwnBinPath()` removed; `renderHook()` and
  `installTemplatedHookScript()` inline the new partial via a `__RESOLVE_CTXR__` substitution.
- `src/commands/adapters-generate.ts`, `src/adapters/types.ts`: `binPath` dropped from
  `PermissionConfigInput` and its construction.
- `test/unit/hooks.test.ts`, `test/integration/hooks.test.ts`,
  `test/integration/adapters-write-gate.test.ts`, `test/unit/adapters-generate-command.test.ts`:
  updated for the removed substitution and the new fail-closed behavior; new tests cover byte-
  identical output across install paths and both fail-closed cases.
- Any store that regenerates (`ctxr update` / `ctxr adapters generate` / `ctxr init`) after this
  ships gets the portable hooks automatically — no migration step, since the existing
  render-and-compare write path (`writeRenderedScript`) already rewrites a hook whose content
  differs from a fresh render.

## Non-goals

- Changing what `ctxr adapters write-gate` decides once it runs, or its own documented
  never-exit-2 contract for its internal errors (`src/commands/adapters-write-gate.ts`) — this
  change only fixes the wrapper script that invokes it, not the decision logic itself.
- Adding `doctor` staleness detection / self-heal for `.claude/hooks/claude-code-write-gate.sh`
  (`detectStaleHooks()` today covers only `.githooks/*`). A real, adjacent gap — left for a
  separate change, same as issue #56 ("init --harness skips adapter generation entirely"), which
  this change does not touch either.
- Re-litigating `stabilize-write-gate-hook-path`'s decision to anchor the hook *command* path in
  `.claude/settings.json` at the store's main worktree (`mainRoot`) — unaffected; that path is a
  reference to the hook script itself (which stays byte-identical across machines), not to `ctxr`.
  After this change, that settings.json path is the only machine-anchored byte left in any
  generated output; whether Claude Code's `$CLAUDE_PROJECT_DIR` hook-command expansion could later
  remove even that (and with it, possibly `mainRoot` and the merge repair keyed on it) is a
  candidate follow-up, not decided or attempted here — see design.md's Risks section.
