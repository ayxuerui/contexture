## 1. Removal in the merge

- [x] 1.1 `src/core/json-config-merge.ts`: factor the hook identity out of `mergeHookEntries` into
      `isSameHook(a, b)` — same matcher, same script basename, blind to the path prefix — so the upsert
      and retirement removal cannot drift (D1).
- [x] 1.2 Same file: `removeHookEntries(existing, retired)` drops every entry matching one this release
      retired, leaving all others. `RemovePatch` widened from string-lists to `MergeListValue`, so it
      carries both vocabularies.
- [x] 1.3 Same file: the hook branch removes retired entries before upserting, and drops a list key
      emptied by retirement rather than leaving `[]` (D3).
- [x] 1.4 Same file: a top-level section emptied by retirement is dropped, unless it was already an
      empty object on disk — so a converged store has no vestigial `hooks: {}` and a fresh store gains
      no settings file at all (D3).

## 2. The adapter stops emitting

- [x] 2.1 `src/adapters/harness/claude-code.ts`: `permissionConfig.render` returns `{}`; the block's doc
      comment records why the gate is retired rather than repaired.
- [x] 2.2 Same file: `retiredRules` gains the hook entry as a third retired generation, keyed by
      `HOOK_TARGET_PATH` so removal matches on basename (D1).
- [x] 2.3 Same file: `hookFile` replaced by `retiredHookFiles: [HOOK_TARGET_PATH]`.

## 3. Deleting what only served the gate

- [x] 3.1 `src/core/hooks.ts`: `installTemplatedHookScript` replaced by `retireInstalledHookScript`
      (exact path only, absent-is-no-change) (D2).
- [x] 3.2 `src/commands/adapters-generate.ts`: installs nothing, retires the declared paths.
- [x] 3.3 Deleted: `src/commands/adapters-write-gate.ts`, its registration in `src/run.ts`,
      `templates/hooks/claude-code-write-gate.sh`, and both of its test files (D4).
- [x] 3.4 `src/core/write-lifecycle/path-gate.ts`: `isWriteInScope` and `WriteScopeResult` removed;
      `sanctionedPath` untouched — three other callers depend on it.
- [x] 3.5 `src/adapters/types.ts`: `mainRoot` removed from `PermissionConfigInput`, its doc replaced by
      a note on why there is no such input and what to prefer instead (D5).
      `src/commands/adapters-generate.ts` stops resolving `mainWorktreePath`.

## 4. Prose

- [x] 4.1 `templates/conventions/baseline-conventions.md`: the sentence on the permission config's
      absolute-path anchoring removed; the pre-push/override sentence beside it is untouched.
- [x] 4.2 `src/commands/init.ts`: the Claude Code harness description stops advertising the hook.

## 5. Tests

- [x] 5.1 A fresh store gets no `.claude/settings.json` and no hook script.
- [x] 5.2 A store carrying the hook from an earlier release converges: entry gone whatever absolute
      path it held, orphaned script deleted.
- [x] 5.3 An operator's own `PreToolUse` hook survives while contexture's is retired.
- [x] 5.4 The legacy-rule repair test keeps its `Bash(git …)` and hand-added-rule assertions, and now
      expects no `hooks` section at all.
- [x] 5.5 Idempotence tests assert the ABSENCE of the settings file is stable across runs, not just
      that its contents match.
- [x] 5.6 `test/unit/update-command.test.ts`: first-update changed-list no longer names
      `.claude/settings.json`.
- [x] 5.7 Removed: the `stabilize-write-gate-hook-path` describe block and the `isWriteInScope` suite —
      both specify behavior that no longer exists.

## 6. Verification

- [x] 6.1 `npm run typecheck` and `npm run build` clean.
- [x] 6.2 `npm test` green — 1050 passing.
- [x] 6.3 End-to-end on a real scratch store: a store seeded with another machine's hook path plus an
      operator's own hook converges in one `ctxr update` — contexture's entry and script gone, the
      operator's hook intact — and a fresh store gains no settings file.
