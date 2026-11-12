## 1. Presence

- [x] 1.1 `sweep.mjs`: count ids found by `git grep --untracked` in every local worktree except the runner's own;
  report meetings held only there under UNPUSHED.
- [x] 1.2 `ctxr-capture-circleback.md`: what counts as present, and UNPUSHED in the report.

## 2. Verification

- [x] 2.1 Integration test: an uncommitted capture in a session worktree is not retrieved and is listed under
  UNPUSHED; a second run still retrieves what its own review worktree holds.
- [x] 2.2 Run `npm run typecheck && npm test` and `openspec validate capture-circleback-sees-local-worktrees --strict`,
  and confirm both exit 0.
