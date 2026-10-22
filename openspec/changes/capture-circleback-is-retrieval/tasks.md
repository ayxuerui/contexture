## 1. Capture

- [x] 1.1 `templates/skills/ctxr-capture.md`: step 1 retrieves through a `ctxr-capture-<source>` skill and continues
  at step 2; step 2's speaker rule covers generic labels and a summary that swaps people.

## 2. The Circleback skill

- [x] 2.1 Rename `ctxr-circleback` to `ctxr-capture-circleback` (templates, seed, worktree path, tests, README).
- [x] 2.2 Rewrite the skill as retrieval that hands back to `ctxr-capture` at step 2, stopping at review only in a
  scheduled run; drop its own judgment rules.
- [x] 2.3 The runner's report labels its output RETRIEVED.

## 3. Verification

- [x] 3.1 Tests: the hand-off, capture's delegation naming no source, and the renamed skill through the existing
  guards and the runner integration test.
- [x] 3.2 Run `npm run typecheck && npm test` and `openspec validate capture-circleback-is-retrieval --strict`, and
  confirm both exit 0.
