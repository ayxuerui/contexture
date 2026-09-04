## 1. Shared resolution partial

- [x] 1.1 Add `templates/hooks/_resolve-ctxr.sh`: if `$CONTEXTURE_BIN` is set, resolve it (dispatching through `node` when it names a non-executable `.js`/`.mjs`/`.cjs` file and `node` is on `PATH`; otherwise invoking it directly), calling the caller-defined `ctxr_unavailable "<reason>"` if it names a nonexistent path or an unexecutable file with no `node` available — never falling through to `PATH` once `CONTEXTURE_BIN` is set. If unset, resolve `ctxr` via `command -v` on `PATH`, else call `ctxr_unavailable`. Leaves the resolved command in `"$@"`. Underscore-prefixed so it's never treated as an installable hook itself.
- [x] 1.2 In `src/core/hooks.ts`, add a `__RESOLVE_CTXR__` substitution — read the partial once and inline it (stripping its own trailing newline so the token's line ending is authoritative) — to both `renderHook()` and `installTemplatedHookScript()`, so every hook template gets it without repeating the read.

## 2. Rewrite the two hook templates

- [x] 2.1 `templates/hooks/claude-code-write-gate.sh`: define `ctxr_unavailable()` above `__RESOLVE_CTXR__` — emits the same `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",...}}` shape `ctxr adapters write-gate` emits for an out-of-scope edit, reason naming the resolution failure and how to fix it (install `ctxr-cli` or set `CONTEXTURE_BIN`), then `exit 0`. Replace the old `CONTEXTURE_BIN="__CONTEXTURE_BIN__"` / `-f` check / warn-and-exit-0 block with `__RESOLVE_CTXR__`. Invoke by capturing output rather than `exec` (`out=$("$@" adapters write-gate) || status=$?`); if the resulting status is 126 or 127 (the resolved command itself failed to execute — a dangling symlink, a lost executable bit), call `ctxr_unavailable` instead of relaying it; otherwise relay `$out` and `$status` unchanged.
- [x] 2.2 `templates/hooks/pre-commit.sh`: define `ctxr_unavailable()` above `__RESOLVE_CTXR__` — writes a stderr message naming the fix (install `ctxr-cli` or set `CONTEXTURE_BIN`) and the `--no-verify` bypass, then `exit 1`. Replace the old block with `__RESOLVE_CTXR__`; the existing `"$@" doctor --staged --json` invocation is otherwise unchanged (no 126/127 mapping needed here — a nonzero exit already refuses the commit either way).
- [x] 2.3 Leave `templates/hooks/pre-push.sh` untouched (it never invokes the CLI).

## 3. Remove the generate-time path

- [x] 3.1 Delete `resolveOwnBinPath()` from `src/core/hooks.ts` and its now-unused `fileURLToPath`/`URL` usage if nothing else in the file needs them.
- [x] 3.2 In `src/commands/adapters-generate.ts`, drop the `resolveOwnBinPath` import, drop `binPath` from the `PermissionConfigInput` object literal, and pass an empty substitutions object (or omit the parameter, per whatever `installTemplatedHookScript`'s signature ends up requiring) to `installTemplatedHookScript` for the write-gate hook.
- [x] 3.3 In `src/adapters/types.ts`, remove `binPath` from `PermissionConfigInput` and its doc-comment paragraph. Leave `root`, `mainRoot`, `worktreesPath` and their documentation untouched. Note `PermissionConfigInput` is transitively reachable from the public `./adapter` subpath export (`src/adapter.ts` re-exports `HarnessGenerationAdapter`, whose `permissionConfig.render` signature references it) — removing a field here is a narrowing an external adapter author could in principle depend on; accepted per design.md's decision 5 (no interface-version bump: only the built-in Claude Code adapter implements `permissionConfig` today).
- [x] 3.4 Confirm no other file references `resolveOwnBinPath`, `binPath` (on `PermissionConfigInput`), or `__CONTEXTURE_BIN__` (`grep -rn` across `src/`, `templates/`, `test/`).

## 4. Test harness: pin CONTEXTURE_BIN so integration tests stay hermetic

- [x] 4.1 In `test/helpers/git-env.ts`, add `CONTEXTURE_BIN` (pointing at the real built `dist/bin.js`) to `hermeticGitEnv()`'s default environment — once hooks resolve via `PATH`/`CONTEXTURE_BIN` instead of a baked path, any integration test that shells out to a rendered hook without pinning this would silently resolve whichever `ctxr` happens to be on the test runner's own `PATH`, passing or failing based on developer machine state rather than the build under test. Resolve the `dist/bin.js` path via a small shared helper (e.g. `test/helpers/dist-bin.ts`) reused by `test/helpers/run-cli.ts` to avoid duplicating the path computation.
- [x] 4.2 Every existing and new integration test in `test/integration/hooks.test.ts` and `test/integration/adapters-write-gate.test.ts` that exercises a hook end to end relies on this default; a test that specifically wants to exercise the `PATH`-only resolution rung explicitly unsets `CONTEXTURE_BIN` and provides its own shim directory on `PATH` instead (see 6.3/6.4 below).

## 5. Update existing tests for the new contract

- [x] 5.1 `test/unit/hooks.test.ts`: remove the `resolveOwnBinPath` describe block; update the `installHooks` assertions (currently `expect(preCommit).toContain(resolveOwnBinPath())` / `not.toContain('__CONTEXTURE_BIN__')`) to assert the rendered pre-commit hook contains no `__CONTEXTURE_BIN__`/`__RESOLVE_CTXR__` placeholder and no absolute filesystem path, and does contain the shared partial's `command -v ctxr` line.
- [x] 5.2 `test/integration/hooks.test.ts`: update the assertion that `preCommit` contains `DIST_BIN` — invert to assert it contains no absolute path and no reference to any build's `dist/bin.js`; retitle the test accordingly.
- [x] 5.3 `test/integration/adapters-write-gate.test.ts`: keep the existing "no `__CONTEXTURE_BIN__`" assertion; add that the rendered script also contains no absolute filesystem path.
- [x] 5.4 `test/unit/adapters-generate-command.test.ts`: update the hook-script assertions (currently checking substitution of the bin path) for the new resolution-ladder content; retitle any test whose title references "bin path substituted". The `mainRoot`-anchoring block (settings.json command path) is unaffected and must keep passing unmodified.

## 6. New tests for the fixed behavior

- [x] 6.1 Unit test: the rendered write-gate script and the rendered pre-commit hook, installed into two different tmp store roots, are byte-identical, and neither contains its own store root, the package's own checkout directory, or the substring `dist/bin.js` — the direct portability regression guard for #67.
- [x] 6.2 Unit test: neither rendered hook contains an unsubstituted `__[A-Z_]+__`-shaped placeholder (a generic check that survives future template changes, not just this one).
- [x] 6.3 Integration test: with `CONTEXTURE_BIN` unset (overriding the harness default from task 4.1) and `PATH` reduced to a fixed nonexistent-`ctxr` state, run the real generated write-gate script; assert stdout is the `permissionDecision: "deny"` JSON body, exit code is 0, and the reason does **not** contain the store root (proving it's the resolution deny, not a scope deny).
- [x] 6.4 Integration test: same script with `CONTEXTURE_BIN` pointed at a copy of `dist/bin.js` made non-executable (mode 0o644, so the branch is exercised deterministically regardless of the real file's mode) and no `ctxr` on `PATH`; assert it gates normally (deny for a store-root path, silent exit 0 for a worktree path) — proves the `.js`-dispatch-through-`node` branch works.
- [x] 6.5 Integration test: `CONTEXTURE_BIN` set to a path that does not exist, while a working `ctxr` shim *is* present on `PATH`; assert the hook still denies via the resolution-failure path — proves rung 1 is terminal and never silently falls through to rung 2.
- [x] 6.6 Integration test: parse the deny body from 6.3 and the deny body the TS `execute()` in `adapters-write-gate.ts` produces for an out-of-scope path; assert both share `hookSpecificOutput.hookEventName` and `permissionDecision`, and both reasons are non-empty — keeps the shell-side and TS-side deny shapes from silently drifting apart.
- [x] 6.7 Integration test: `.githooks/pre-commit` run with `CONTEXTURE_BIN` unset and no resolvable `ctxr` on `PATH` exits 1 and its stderr names `ctxr` and the `--no-verify` bypass.
- [x] 6.8 Unit test: `detectStaleHooks()` reports nothing stale comparing a freshly rendered hook against one already on disk from an earlier render in this same process — guards byte-stability at the detection layer, not just the render layer.

## 7. Verification

- [x] 7.1 `openspec validate resolve-hook-cli-at-runtime --strict`
- [x] 7.2 `npm run typecheck && npm run build && npm test`
- [x] 7.3 Manual repro of the original issue: `ctxr init` a scratch store, run `ctxr adapters generate`, confirm `.claude/hooks/claude-code-write-gate.sh` contains no filesystem path outside its shebang/comments; run it with `env -i PATH=/usr/bin:/bin sh <path> </dev/null` and confirm a deny JSON body on stdout rather than the old skip warning.
- [x] 7.4 Manual migration check: hand-edit a scratch store's `.claude/hooks/claude-code-write-gate.sh` and `.githooks/pre-commit` to restore the old `__CONTEXTURE_BIN__`-style baked path, then run `ctxr adapters generate` and `ctxr doctor` (or `ctxr init` again) respectively; confirm both are rewritten to the portable form with no separate migration command, and a second run makes no further change.
