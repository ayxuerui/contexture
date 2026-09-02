## 1. The skill

- [x] 1.1 `templates/skills/ctxr-submit.md`: delete step 8 (the fire gate); renumber the following steps
      (9→8, 10→9, 11→10) so the branch rename is followed directly by the push and `gh pr create`.
- [x] 1.2 Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'` — expected to FAIL
      on the `plan consent … is not fire consent` guard until 2.1 lands, confirming the guard is real.

## 2. The guard

- [x] 2.1 `test/unit/skills.test.ts`: replace the fire-gate assertion in the submit case with one that
      asserts the ungated ordering (branch rename, then `git push`, then `gh pr create`, with no
      confirmation sentence between them); update that test's name and the stale `// the fire-gated
      external side effect` comment. Leave the land case's gate assertions untouched.
- [x] 2.2 Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'` — green.

## 3. Full verification

- [x] 3.1 `npm run typecheck && npm run build`.
- [x] 3.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 3.3 `openspec validate submit-is-its-own-consent --strict` and `openspec validate --specs` clean.
- [x] 3.4 Confirm no other shipped surface still describes submit as gated:
      `grep -rn "fire consent\|fire gate" templates/ src/ test/` returns only land's own gate and
      `prompter.ts`'s comment (which names the merge and the worktree removal, not the push).
