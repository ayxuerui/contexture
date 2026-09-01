## 1. Hook template and shipping

- [x] 1.1 Add `templates/hooks/claude-code-write-gate.sh`, mirroring `templates/hooks/pre-commit.sh`'s shape (`#!/bin/sh`, `set -eu`, `CONTEXTURE_BIN="__CONTEXTURE_BIN__"`, missing-binary warn-and-exit-0 guard), piping stdin to `ctxr adapters write-gate` and relaying its stdout/exit code unchanged.
- [x] 1.2 Generalize `src/core/hooks.ts`'s hook-spec list / `installHooks` (or add a sibling installer) so a harness adapter can declare an additional templated hook file to install and chmod, without duplicating the render/chmod/idempotence logic.
- [x] 1.3 Verify: `npm run build` succeeds and the new template resolves via the existing `templatesDir()` helper (no path errors at runtime).

## 2. The gate subcommand

- [x] 2.1 Add `ctxr adapters write-gate` to `src/run.ts`'s command registration, reading the PreToolUse JSON envelope from stdin.
- [x] 2.2 Add a worktree-scope predicate alongside `sanctionedPath` in `src/core/write-lifecycle/path-gate.ts` (a path is in-scope for editing when it resolves inside the active session worktree, or outside the store entirely; out-of-scope when it resolves inside the store root but outside the worktree), and use `sanctionedPath`'s existing resolution/symlink handling rather than re-deriving it.
- [x] 2.3 Implement the gate's decision logic per design.md's exit-code contract: deny (JSON `permissionDecision: "deny"` body, exit 0, reason names the store root and points at `ctxr session start`) for an out-of-scope path; exit 0 with no output for an in-scope path; nonzero-but-never-2 exit for unparseable stdin or no resolvable store.
- [x] 2.4 Verify: `ctxr adapters write-gate` run directly with a hand-built PreToolUse JSON envelope on stdin (one path inside a worktree, one path at the store root, one malformed) produces the three documented outcomes, checked via `echo '<json>' | node bin.js adapters write-gate; echo $?`.

## 3. Generator: new `render()` output and retirement

- [x] 3.1 Widen `permissionConfig`'s render input in `src/adapters/types.ts` (add whatever the hook-install step needs: the CLI bin path, the hook template to install) and add a `retiredRules(input)` method alongside `render()`.
- [x] 3.2 Rewrite `src/adapters/harness/claude-code.ts`'s `render()` to emit only `Bash(git push:*)` / `Bash(git commit:*)` in `permissions.deny` plus the `hooks.PreToolUse` entry pointing at the installed gate script; delete the `Write(...)`/`Edit(...)` deny and allow rules and the now-inaccurate header comment describing them.
- [x] 3.3 Implement `retiredRules()` to reconstruct the exact four legacy strings (`Write(//<absRoot>/**)`, `Edit(//<absRoot>/**)`, `Write(//<absRoot>/<seg>/**)`, `Edit(//<absRoot>/<seg>/**)`) from `{root, worktreesPath}`.
- [x] 3.4 Update `src/commands/adapters-generate.ts` to pass the widened render input, install the declared hook file, and pass `retiredRules()`'s output through to the merge writer.
- [x] 3.5 Verify: `npx vitest run test/unit/adapters-generate-command.test.ts` (after task 5's rewritten assertions) passes.

## 4. Merge writer: removal and object-array support

- [x] 4.1 Add a `remove` option to `mergeJsonArrayLists` (`src/core/json-config-merge.ts`) that deletes exact-string matches from each named list before the union runs, and drops a list key that becomes empty as a result of removal (but never a key that was already `[]` going in).
- [x] 4.2 Add a structural merge path for an object-array section (`hooks.PreToolUse`): find contexture's own entry by matching its `command` field, replace it in place; leave any other entry in the array untouched; if no matching entry exists yet, append one.
- [x] 4.3 Verify: `npx vitest run test/unit/json-config-merge.test.ts` passes, including the new cases from task 6.

## 5. Test updates: existing assertions

- [x] 5.1 In `test/unit/adapters-generate-command.test.ts`, rewrite the assertions at (current) lines 46-59 and 61-78 that check for `Write(//<root>/**)` in `deny` and `Write(//<root>/.worktrees/**)` in `allow`, replacing them with assertions on the new hook-based output (the `hooks.PreToolUse` entry's command path, and that `deny` contains only the two `Bash(...)` rules).
- [x] 5.2 Verify: `npx vitest run test/unit/adapters-generate-command.test.ts test/integration/adapters-and-entry-doc.test.ts test/unit/update-command.test.ts` passes.

## 6. New tests

- [x] 6.1 `json-config-merge.test.ts`: `remove` deletes exact matches only (a near-miss string with extra characters is untouched), preserves a hand-added entry with the same-shaped-but-different value, drops an emptied list key, and leaves a pre-existing intentional `[]` alone; two consecutive calls with the same `patch`+`remove` are idempotent (`changed: false` on the second).
- [x] 6.2 `json-config-merge.test.ts`: the object-array (`hooks.PreToolUse`) merge replaces contexture's own entry in place on a second run (no duplicate), and leaves an operator-added hook entry with a different `command` untouched.
- [x] 6.3 `adapters-generate-command.test.ts`: seed a `.claude/settings.json` containing the four legacy rules plus one unrelated hand-added deny rule; after `execute()`, assert the legacy rules are gone, the hand-added rule survives, the new hook block and the two `Bash` denies are present, and `permissions.allow` is absent; run `execute()` again and assert byte-identical output (`changed: false` for that file).
- [x] 6.4 New gate-command tests (co-located with existing `write-lifecycle` / `path-gate` tests): a path inside the active session worktree exits 0 with no stdout; a path under the store root but outside the worktree exits 0 with a deny JSON body naming the store root; a path outside the store entirely exits 0 with no stdout; a path that escapes through a symlink (reuse the existing symlink fixture pattern from `sanctionedPath`'s tests) is denied; malformed stdin exits nonzero and not 2.
- [x] 6.5 New integration test: after `ctxr adapters generate`, the hook script at `.claude/hooks/claude-code-write-gate.sh` exists and is executable (mode includes `0o111`); piping a real PreToolUse envelope for a store-root path through it via `sh` produces the documented deny JSON on stdout with exit 0.
- [x] 6.6 Verify: `npm test` (full suite) passes.

## 7. Manual end-to-end verification

- [x] 7.1 In a scratch directory, run `ctxr init && ctxr adapters generate`; inspect the generated `.claude/settings.json` and confirm it matches design.md's decisions (no `Write(...)` rules, `hooks.PreToolUse` present, two `Bash` denies only).
- [x] 7.2 Start a session (`ctxr session start`), launch Claude Code at the store root, attempt an edit to a root-level tracked file (expect denial with the gate's reason) and an edit to a file inside the session worktree (expect success) — the exact pair that is broken today.
- [x] 7.3 Verify: both outcomes in 7.2 match, confirming the fix holds outside the test suite.
