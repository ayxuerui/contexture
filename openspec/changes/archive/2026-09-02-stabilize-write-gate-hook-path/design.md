## Context

`generateAdapterOutputs(store)` (`src/commands/adapters-generate.ts`) builds a `PermissionConfigInput { root, worktreesPath, binPath }` from `store.root` and passes it to `claude-code.ts`'s `permissionConfig.render(input)`, which does `path.join(root, HOOK_TARGET_PATH)` to produce the hook's absolute command path. `store.root` is whatever checkout `openStore()` resolved for the current invocation — a session worktree in the overwhelming majority of real invocations, since nearly every write happens inside one.

The merge step (`mergeJsonArrayLists` → `mergeHookEntries`, `src/core/json-config-merge.ts`) already has an upsert-by-command mechanism intended to make regeneration idempotent: it finds an existing entry whose `hooks[0].command` exactly equals the incoming one's and replaces it in place, appending only if no match is found. This only behaves as "idempotent" when the command string is stable across runs — today it isn't, so every regeneration from a *different* checkout appends rather than replaces, which is the accumulation symptom (reproduced against a real store: two `PreToolUse` entries after two `ctxr update` runs from two different, both since-deleted, session worktrees).

`mainWorktreePath(git, cwd)` (`src/core/git/worktree.ts`) already solves "resolve the one stable, persistent checkout regardless of which linked worktree is asking" — `session-land` uses it today for the same class of problem (fast-forwarding "the store's canonical clone itself... wherever the command was invoked from"). It reads `git worktree list --porcelain` and returns the first entry (git's own guarantee: the main worktree is always listed first), falling back to `cwd` when the list is empty — so a repository with no linked worktrees, or an invocation already running from the main worktree, behaves exactly as before.

## Goals / Non-Goals

**Goals:**
- The absolute path baked into the write-gate hook's command stays valid after the worktree that generated it is removed.
- A store that has already accumulated stale/duplicate hook entries (from before this change) converges to exactly one correct entry on its next `ctxr update`, with no separate migration step.
- The fix generalizes to any future harness-generation adapter that declares a `permissionConfig` with a `hookFile` — not a one-off patch specific to Claude Code's current file layout.

**Non-Goals:**
- Changing what the write-gate hook *decides* once invoked (`ctxr adapters write-gate`'s own logic) — untouched.
- A general "detect any silently-failed hook" mechanism — out of scope; this only removes one specific, known way the hook's own invocation path goes stale.

## Decisions

**1. Add a second, distinct field to `PermissionConfigInput` rather than redefining `root`.**

`PermissionConfigInput.root` (`store.root`) is also read by `retiredRules({root, worktreesPath})` to reconstruct an older, pre-hook, glob-based permission-rule format for removal — that reconstruction's fidelity depends on `root` continuing to mean "the checkout currently being reconciled," not "the main worktree." Redefining `root` in place would risk that older cleanup path silently no longer matching what a defunct generator actually wrote for a store still carrying it.

Instead, `generateAdapterOutputs` resolves `mainWorktreePath(env.git, store.root)` once and adds it as `PermissionConfigInput.mainRoot`. `claude-code.ts`'s `render()` uses `mainRoot` (not `root`) when building the hook's absolute command path; every other existing consumer of `root` is unchanged.

*Alternative considered*: redefine `root` to already be the main worktree path, computed once at the top of `generateAdapterOutputs`. Rejected — it silently changes the meaning of an existing, still-relevant field for every future adapter author reading `PermissionConfigInput`, for a saving of one field.

**2. Thread a `GitRunner` into `generateAdapterOutputs`, sourced from `RunEnv` at both call sites.**

`mainWorktreePath` needs a `GitRunner`. `update.ts`'s `execute(env, store)` already has `env.git` in scope. `adapters-generate.ts`'s own `execute(store)` does not take `env` today; `run.ts`'s `adapters generate` command already resolves a `RunEnv` (`runEnv`) before calling it, so this is a signature change at one call site (`adaptersGenerateCommand.execute(store)` → `execute(env, store)`), not a new resolution path.

*Alternative considered*: have `generateAdapterOutputs` re-derive a `GitRunner` internally (e.g. a default `simpleGitRunner()`). Rejected — every other command-layer function in this codebase receives its `GitRunner` from `RunEnv` rather than constructing one, and doing otherwise here would make this one function untestable with the fake runner the test suite otherwise uses uniformly.

**3. Fix the merge's matching key instead of adding a second removal mechanism.**

Change `mergeHookEntries`'s match predicate from exact `hooks[0].command` equality to `(matcher, path.basename(command))` equality. Once decision 1 makes the emitted command stable across runs from the same store, this single change gives two things at once: ordinary regeneration replaces-in-place (matcher + script basename match, full path is now irrelevant to the comparison), *and* a store that already carries one or more stale entries from before this change self-heals on its very next run — the newly-rendered entry's `(matcher, basename)` matches each of them, so the last one processed wins and the others are gone (only one entry survives per distinct `(matcher, basename)` pair, since `mergeHookEntries` replaces by index and the loop processes `existing` once). No new `RemovePatch` shape, no reconstruction of "what a past run would have emitted" the way `retiredRules` has to do for the older permission-rule format — self-healing falls out of matching on the part of the entry that's actually invariant.

Matching by script basename rather than full command is deliberately narrower than matching by `matcher` alone: two adapters (or an operator's own hook) sharing the same matcher but a genuinely different script would not collide, since `HOOK_TARGET_PATH`'s basename (`claude-code-write-gate.sh`) is specific to contexture's own generated file. This preserves the existing "a hand-added rule survives regeneration" guarantee for any hook that isn't literally named the same as contexture's own.

*Alternative considered*: keep `mergeHookEntries` as-is and add a `hookRemovePatch`-shaped extension to `retiredRules()` that reconstructs "any entry with this matcher and this script basename, except the exact one about to be written" for explicit removal. Rejected as more moving parts for the same outcome — it would need `retiredRules` to know the *current* run's own about-to-be-written entry (to avoid removing-then-immediately-re-adding the correct one), which the matching-key fix gets for free by construction.

**4. The physical hook script file's write location is unchanged.**

`installTemplatedHookScript(store.root, ...)` keeps writing `.claude/hooks/claude-code-write-gate.sh` at the checkout currently running the generator (a worktree, typically) — that checkout needs the file physically present to stage and commit it as part of its own session. Only the *absolute path baked into the settings.json command* changes to point at the main worktree. Once the session lands, the same tracked file is present at that same relative path in the main worktree too (ordinary git checkout inheritance), so the resolved command is valid by the time anyone but the generating session's own worktree would invoke it — including, in the interim, before landing, if the main worktree already carries the file from an earlier generation (the common case for every run after the very first).

## Risks / Trade-offs

- **First-ever generation, before its own PR lands**: if a store's very first `ctxr update` (fresh init, from within a worktree) runs before the main worktree has ever carried the hook script, the settings.json committed by that session points at a main-worktree path that doesn't yet have the file — until that session's own PR merges. During that window the hook script is absent at the path Claude Code would invoke, which the hook wrapper already treats as non-fatal (warns, exits 0) — no worse than today's steady-state failure mode, and it self-resolves the moment the PR lands. → Accepted; scoped to the one-time bootstrap window for a brand-new store, not steady-state operation.
- **Basename-collision false positive**: an operator's own unrelated hook happens to be literally named `claude-code-write-gate.sh` with the same matcher. → Accepted as effectively impossible in practice (the name is contexture-generated, not a common convention); not defended against further.
