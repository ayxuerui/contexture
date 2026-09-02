## Why

The Claude Code harness adapter's generated permission config bakes the write-gate hook's command as an absolute path under whichever checkout ran `ctxr adapters generate` / `ctxr update` — almost always a session worktree, since that is where nearly every write happens. Once that worktree is cleaned up (the normal end of its lifecycle), the baked-in path no longer resolves. The hook script itself treats a missing target as non-fatal (prints a warning to stderr, exits 0), so the failure is silent: the deny-edits-outside-the-active-worktree protection this hook exists to provide simply stops firing, with no error surfaced anywhere. Separately, because each regeneration from a different worktree appends a new hook entry rather than replacing the previous one (the existing repair mechanism only recognizes an old, pre-hook permission-rule format, not a stale hook-command entry from a prior run of the same generator version), a store accumulates one dead entry per worktree that has ever run the generator — confirmed against a real store, whose permission config held two `PreToolUse` hook entries pointing at two different, both-since-deleted worktrees after two ordinary `ctxr update` runs.

## What Changes

- The Claude Code adapter's permission config renders the write-gate hook's absolute command path against the store's main/canonical worktree, resolved via the existing `mainWorktreePath()` helper (`src/core/git/worktree.ts`, already used by `session-land` for the same "resolve the canonical checkout regardless of where this command runs" need) — not `store.root`, which is whichever checkout is currently running the generator.
- `ctxr adapters generate` / `ctxr update` prune any existing hook entry matching this adapter's matcher and hook-script basename that no longer matches the freshly rendered one, before writing the current entry — so a store carrying one or more stale entries (from before this change, or from any future edge case) converges to exactly one correct entry on its next run, rather than accumulating.
- The physical hook script file itself continues to be written at the currently-running checkout's own root (unchanged) — only the absolute path baked into the permission config's hook *command* changes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `adapters`: "A harness's generated permission config scopes writes to the active session worktree" gains the requirement that the enforcement primitive's own command path stays valid regardless of which checkout generated it, so the deny-by-default protection cannot silently lapse when a worktree is cleaned up. "Regenerating a permission config repairs a previously generated one" extends repair to cover a stale hook-command entry left by a prior run of the *same* generator version against a different checkout, not only a rule format an older generator version no longer emits.

## Impact

- `src/adapters/harness/claude-code.ts`: `permissionConfig.render()` resolves the hook's absolute path against the main worktree instead of the input `root`.
- `src/core/git/worktree.ts`: no change — `mainWorktreePath()` is reused as-is.
- `src/commands/adapters-generate.ts`: `generateAdapterOutputs` needs a `GitRunner` to call `mainWorktreePath`, and its stale-entry pruning needs to recognize a hook-command entry regardless of which absolute path it carries.
- `src/commands/update.ts`, `src/run.ts` (the `adapters generate` command wiring): thread `env`/`env.git` through to `generateAdapterOutputs`, which currently takes only `store`.
- Any store whose `.claude/settings.json` already carries one or more stale hook entries (like the one this was found against) self-heals on its next `ctxr update` — no manual cleanup step required.

## Non-goals

- Changing the write-gate hook script's own runtime behavior (`ctxr adapters write-gate`'s decision logic) — this change only fixes how its *own invocation path* is generated, not what it decides once invoked.
- Extending this fix to any other harness's permission config mechanism — no other shipped harness-generation adapter declares a `permissionConfig` today, so there is nothing else to change.
- Retroactively rewriting `retiredRules()`'s existing glob-based cleanup for the pre-hook permission-rule format — that repair path is unrelated and stays as-is; this change adds a second, independent repair path for the hook-command format.
