## 1. The invocation

- [x] 1.1 `src/adapters/harness/claude-code.ts`: `PROJECT_DIR_PLACEHOLDER` — Claude Code's
      `${CLAUDE_PROJECT_DIR}` token, held as a plain literal and joined to `HOOK_TARGET_PATH` with `/`
      rather than `path.join` (D2: `path.join` would backslash it on Windows into something the harness
      no longer recognizes).
- [x] 1.2 Same file: `permissionConfig.render` emits
      `${CLAUDE_PROJECT_DIR}/.claude/hooks/claude-code-write-gate.sh` and no longer destructures
      `mainRoot`. Comment records why the predecessor's main-worktree anchoring is being replaced
      (it fixed staleness but not portability, and the file is committed), and why a bare relative path
      is not the answer (D1 — it would resolve against the hook's working directory, which the harness
      does not promise is the project root, and would fail open).
- [x] 1.3 `src/adapters/types.ts`: `mainRoot`'s doc comment retightened — it is the FALLBACK for a
      harness that publishes no placeholder, not the default (D3). Field itself kept: the spec still
      requires that fallback, which is unimplementable without it.

## 2. Convergence

- [x] 2.1 Nothing added to `retiredRules` (D4). `mergeHookEntries` already matches a hook entry by
      `(matcher, hook script basename)` and is deliberately blind to the path prefix, so the new command
      replaces the old in place, drops further stale copies, and leaves an operator's own hook alone.
      Verified rather than assumed — see 4.4.

## 3. The prose stores read

- [x] 3.1 `templates/conventions/baseline-conventions.md`: the sentence on the generated permission
      config stops presenting main-worktree anchoring as the rule and states the placeholder, with the
      absolute path named as the fallback for a harness that publishes none.

## 4. Tests

- [x] 4.1 `test/unit/adapters-generate-command.test.ts`: every command assertion moved from
      `path.join(<root>, HOOK_TARGET_PATH)` to the placeholder form. The one assertion that stays
      absolute is the hook *script*'s own location on disk, which is a real file path.
- [x] 4.2 New: the generated command carries no filesystem path — not absolute, does not contain the
      store root, starts with the placeholder.
- [x] 4.3 New: two stores at different filesystem locations generate a byte-identical command.
- [x] 4.4 New: a config carrying an absolute path a previous release resolved converges to exactly one
      entry in the placeholder form, with the foreign path absent.
- [x] 4.5 The `stabilize-write-gate-hook-path` block's first test restated: its guarantee (a command
      that outlives the worktree that generated it) now holds for a stronger reason, so it asserts the
      command names neither the generating worktree nor the main worktree.

## 5. Verification

- [x] 5.1 `npm run typecheck` and `npm run build` clean.
- [x] 5.2 `npm test` green — 1077 passing.
- [x] 5.3 End-to-end on a real scratch store: `ctxr update` emits the placeholder; seeding the config
      with another machine's absolute path plus an operator's own unrelated hook and re-running
      converges to exactly two entries — contexture's, in placeholder form, and the operator's,
      untouched — with the foreign path gone.
