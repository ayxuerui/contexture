## 1. The resting state

- [x] 1.1 `templates/skills/ctxr-session-lifecycle.md`: add a `## Between turns` section immediately after
      the `## Start` section, stating that a session is not a turn, that the worktree persists across
      exchanges, that ending a turn with uncommitted work on the branch is the normal resting state, and
      that `ctxr-submit` is what ends a session and waits to be asked — pointing at its entry condition
      rather than restating it.
- [x] 1.2 `test/unit/skills.test.ts`: in the existing session-lifecycle case, assert `## Between turns` is
      present and that the skill states a session is not a turn.
- [x] 1.3 Verify the guard is real — restore the pre-change skill and confirm the suite FAILS:
      `git show origin/__DEFAULT_BRANCH__:templates/skills/ctxr-session-lifecycle.md > templates/skills/ctxr-session-lifecycle.md`
      then `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'`, then restore the new file.

## 2. The upgrade skill's chaining

- [x] 2.1 `templates/skills/ctxr-upgrade.md`: reword step 6 so submitting the re-render and landing it read
      as two decisions, with land keeping its own confirmation.
- [x] 2.2 Verify: `grep -n "Follow \`ctxr-submit\`, then \`ctxr-land\`" templates/` returns nothing.

## 3. Full verification

- [x] 3.1 `npm run typecheck && npm run build`.
- [x] 3.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 3.3 `openspec validate lifecycle-names-the-resting-state --strict` and `openspec validate --specs` clean.
- [x] 3.4 Confirm the layered delta preserved the predecessor's entry condition rather than reverting it:
      `grep -c "state the entry condition that admits it" openspec/changes/lifecycle-names-the-resting-state/specs/harness-portability/spec.md`
      returns 1.
