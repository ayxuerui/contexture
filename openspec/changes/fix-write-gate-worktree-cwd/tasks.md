## 1. Detection primitive

- [x] 1.1 Add `isLinkedWorktreeRoot(root)` to `src/core/git/repo.ts`: sync, fs-only, returns `true` when `<root>/.git` exists, is a regular file, and its content starts with `gitdir: `; returns `false` on any stat/read failure or when `.git` is a directory (the main working tree).
- [x] 1.2 Verify: `npm run build` succeeds with the new export.

## 2. Wire the carve-out into the gate

- [x] 2.1 In `isWriteInScope` (`src/core/write-lifecycle/path-gate.ts`), add a branch after the worktrees-prefix check and before the final denial: `if (isLinkedWorktreeRoot(root)) return { inScope: true }`. Document why in a comment on the function (the `resolveExistingRoot` walk-up finding a worktree's own `contexture.yaml` is the root cause).
- [x] 2.2 Verify: reproduce the bug against the pre-fix build (`echo '<envelope with cwd inside a worktree>' | node dist/bin.js adapters write-gate` denies), rebuild, repeat, confirm it now allows.

## 3. Tests

- [x] 3.1 `test/unit/path-gate.test.ts`: a root whose `.git` is a linked-worktree file is in scope for an ordinary content path.
- [x] 3.2 `test/unit/path-gate.test.ts`: a symlink escape from inside a linked-worktree root is still denied (the carve-out doesn't bypass the absolute symlink rule).
- [x] 3.3 `test/unit/path-gate.test.ts`: a root whose `.git` is a directory (the main working tree, simulated) is unaffected — still denied outside the worktrees prefix.
- [x] 3.4 Verify: `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` — full suite passes.

## 4. Spec

- [x] 4.1 `specs/adapters/spec.md`: add a scenario to the existing "scopes writes to the active session worktree" requirement covering a session whose `cwd` is already the worktree.
