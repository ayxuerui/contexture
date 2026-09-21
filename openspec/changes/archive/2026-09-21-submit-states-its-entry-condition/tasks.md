## 1. The entry condition

- [x] 1.1 `templates/skills/ctxr-submit.md`: add a `## When` section after the intro paragraph stating the
      entry condition (explicit request to wrap up, or the operator's closing signal), the anti-triggers
      (finishing the assigned task, an outstanding question/error/follow-up, the agent's own summary), the
      two tells of an uninvited entry (rehearsing `ctxr doctor`/`ctxr lint`/`ctxr catalog check`; composing
      a "shall I open the pull request?" question), and that stopping without the signal is a normal end of
      turn. Add a `## Steps` heading before the numbered list so it does not read as part of `## When`.
- [x] 1.2 `templates/skills/ctxr-submit.md`: reword step 10 to report the pull request's number and url and
      name `ctxr-land`'s target, keeping land's own confirmation intact.
- [x] 1.3 Verify the guard is real before trusting it green — with 2.1 applied, restore the pre-change
      template and confirm the suite FAILS on the `## When` assertion:
      `git show origin/__DEFAULT_BRANCH__:templates/skills/ctxr-submit.md > templates/skills/ctxr-submit.md`
      then `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'`, then restore the new file.

## 2. The guard

- [x] 2.1 `test/unit/skills.test.ts`: in the existing submit case, assert the skill contains `## When` and
      `Anti-triggers`, that `## When` precedes `Re-scan (mandatory`, that it names the finished-task
      misread, and that the handoff names the pull request's number. Leave the
      `submit-is-its-own-consent` assertions untouched.
- [x] 2.2 Verify: `npx vitest run test/unit/skills.test.ts --exclude '**/.claude/**'` — green.

## 3. The rendered agent document

- [x] 3.1 `templates/agents/canonical.md`: reword the Write path paragraph so the worktree requirement stays
      unconditional while submit reads as operator-triggered.
- [x] 3.2 `test/unit/agents-doc.test.ts`: the exact-rendered-output golden pins that paragraph verbatim —
      update its expected line to match, keeping the file's literal em dash rather than a `\u2014` escape.
- [x] 3.3 Verify: `grep -n "then \`ctxr-submit\`" templates/agents/canonical.md` returns nothing, and
      `npx vitest run test/unit/agents-doc.test.ts --exclude '**/.claude/**'` is green.

## 4. Full verification

- [x] 4.1 `npm run typecheck && npm run build`.
- [x] 4.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 4.3 `openspec validate submit-states-its-entry-condition --strict` and `openspec validate --specs` clean.
- [x] 4.4 Confirm no shipped surface still presents submit as an unconditional step of the write path:
      `grep -rn "then \`ctxr-submit\`" templates/ src/` returns nothing.
