## 1. Merge matching key

- [x] 1.1 In `src/core/json-config-merge.ts`, change `mergeHookEntries`'s match predicate from exact `hooks[0].command` equality to `(matcher, path.basename(command))` equality — an existing entry sharing both with an incoming entry is replaced in place; otherwise the incoming entry is appended, as today.
- [x] 1.2 Update the function's doc comment to describe the new matching key and why it makes regeneration idempotent across different checkouts, not only within the same one.

## 2. Resolve the main worktree for the hook path

- [x] 2.1 Add `mainRoot: string` to `PermissionConfigInput` (`src/adapters/types.ts`), documented as "the store's main/canonical worktree, resolved once per generation run — use this for any absolute path an enforcement primitive invokes; use `root` for the checkout currently being reconciled."
- [x] 2.2 In `src/commands/adapters-generate.ts`, change `generateAdapterOutputs` to accept a `GitRunner` (or the relevant slice of `RunEnv`) as a parameter, resolve `mainWorktreePath(git, store.root)` once per call, and include it as `mainRoot` in the `PermissionConfigInput` passed to each adapter's `render()`/`retiredRules()`.
- [x] 2.3 In `src/adapters/harness/claude-code.ts`, change `permissionConfig.render()` to build the hook's absolute command path from `mainRoot` instead of `root`.

## 3. Thread the git runner through both call sites

- [x] 3.1 Update `src/commands/adapters-generate.ts`'s own `execute()` to accept `env: RunEnv` (in addition to `store`) and pass `env.git` through to `generateAdapterOutputs`.
- [x] 3.2 Update `src/run.ts`'s `adapters generate` command action to pass its already-resolved `runEnv` to `adaptersGenerateCommand.execute`.
- [x] 3.3 Update `src/commands/update.ts` to pass `env.git` through to `generateAdapterOutputs` (it already has `env` in scope).

## 4. Tests

- [x] 4.1 Unit test for `mergeHookEntries`'s new matching key: an existing entry with a different `command` but the same `matcher` and script basename as the incoming entry is replaced, not duplicated.
- [x] 4.2 Unit test: an existing hook entry with the same `matcher` but a *different* script basename (simulating an operator's own unrelated hook) is left untouched when a new contexture-generated entry is merged in.
- [x] 4.3 Unit or integration test: `generateAdapterOutputs`/`adapters generate`, run against a store whose `store.root` is a linked worktree, writes a hook command path rooted at the *main* worktree, not the worktree it was run from.
- [x] 4.4 Integration test reproducing the original bug end to end: run `adapters generate` (or `update`) from two different session worktrees in sequence against the same store, and assert the resulting `.claude/settings.json` carries exactly one `PreToolUse` entry for the write-gate hook, pointing at the main worktree, not two.
- [x] 4.5 Regression test: a store with no linked worktrees (only the main checkout) generates the same hook path as before this change (covers `mainWorktreePath`'s existing empty-list fallback to `cwd`).

## 5. Verification

- [x] 5.1 `npm run typecheck && npm run build && npm test`
- [x] 5.2 Manually reproduce against a scratch store: `ctxr session start`, `ctxr update` inside the worktree, inspect `.claude/settings.json`'s hook command — confirm it names the main worktree's absolute path, not the session worktree's.
- [x] 5.3 Manually confirm self-healing: seed a scratch store's `.claude/settings.json` with two stale `PreToolUse` entries (different commands, same matcher and script basename), run `ctxr update`, confirm exactly one entry remains afterward.
