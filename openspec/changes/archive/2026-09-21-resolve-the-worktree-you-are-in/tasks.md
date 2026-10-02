## 1. Deciding "worktree of this store"

- [x] 1.1 `src/core/git/repo.ts`: `linkedWorktreeGitDir(root)` — returns the administrative directory
      a linked worktree's `.git` file points at, or null when `root` is not a linked worktree. Reads
      only the first line, requires the `gitdir:` prefix, and resolves the pointer against `root` so
      that a relative pointer (`git worktree add --relative-paths`, git 2.48+) works as well as an
      absolute one. Beside `isLinkedWorktreeRoot`, which already answers the unqualified form of the
      same question by the same technique.
- [x] 1.2 Same file: `isWorktreeOf(candidate, owner)` — whether `candidate` is a linked worktree of
      the repository whose main working tree is `owner`, true exactly when the pointer resolves
      inside `<owner>/.git/worktrees/`. Containment via `path.relative` (non-empty, no `..`, not
      absolute), never `startsWith` (D3). Comments cite D2 for why no git subprocess and D3 for why
      no `realpath`.

## 2. The resolution step

- [x] 2.1 `src/core/root.ts`: extract the existing cwd walk into `findRootFromCwd(cwd)` returning
      `string | null`, so both the new step and the existing fallback ask it rather than repeating
      the loop.
- [x] 2.2 Same file: in `resolveExistingRoot`, when `CONTEXTURE_STORE_ROOT` is set and no `--root`
      was given, redirect to the cwd's store when it differs from the named store and
      `isWorktreeOf(here, named)` holds; otherwise resolve the variable exactly as before. The
      superseded-name refusal, the `--root` branch, and the no-env walk are untouched.
- [x] 2.3 Same file: doc comment states the new precedence and why the step exists — the variable
      answers which store, a worktree raises which checkout — and why it is gated on the variable
      resolving (with it unset, the walk already reaches the same directory).
- [x] 2.4 `resolveRootForInit` deliberately NOT changed (D6).

## 3. The prose stores read

- [x] 3.1 `templates/agents/canonical.md`: the "Root resolution" paragraph states the worktree step
      in the precedence list, followed by a paragraph naming what it means in practice, that a
      different store still pins, and the `--root "$CONTEXTURE_STORE_ROOT"` form for deliberately
      targeting the canonical clone from inside a worktree.
- [x] 3.2 `test/unit/agents-doc.test.ts`: the exact-output golden for the canonical section updated
      to the new prose.

## 4. Tests

- [x] 4.1 `test/unit/root.test.ts`: a helper building a canonical store plus a linked worktree laid
      out as git lays one out — `.git` a FILE reading `gitdir: <owner>/.git/worktrees/<name>`, both
      checkouts carrying `contexture.yaml`.
- [x] 4.2 Same file: redirect holds from the worktree root and from a subdirectory of it; a relative
      `gitdir:` pointer is accepted.
- [x] 4.3 Same file: the negatives — `--root` still wins; a worktree of a DIFFERENT store does not
      redirect (cross-store pinning preserved); the main working tree does not redirect to itself; a
      `.git/worktrees-backup/x` decoy does not match the `.git/worktrees` prefix; a cwd store that is
      not a git checkout falls back to the variable; the no-env cwd walk is unchanged.
- [x] 4.4 Same file: `resolveRootForInit` never redirects into a linked worktree (D6).

## 5. Verification

- [x] 5.1 `npm run typecheck` and `npm run build` clean.
- [x] 5.2 `npm test` green.
- [x] 5.3 Exercised against a real store: `ctxr doctor` from inside a real `ctxr session start`
      worktree with `CONTEXTURE_STORE_ROOT` exported resolves the worktree, and `--json` reports
      `store.root` as the worktree; from the canonical clone it still reports the canonical clone.
