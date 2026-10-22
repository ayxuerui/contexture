## 1. One shared reading of send copies

- [x] 1.1 Move `sendCopiesAtPageRoot` and the name check out of `src/commands/publish-check.ts` into `src/core/publish/send-copies.ts` as exported `sendCopiesAtPageRoot(dir)` and `sendCopyNameProblem(fileName)` (design.md D4); `publish check` calls them, its output unchanged
- [x] 1.2 Run `npx vitest run test/unit/publish-check-command.test.ts` — all pass, unchanged

## 2. Rename scores on staged files

- [x] 2.1 Add `renameScore?: number` to `StagedFile` (`src/core/checks/types.ts`); `getStagedFiles` parses it from `R<score>` status codes (D2)
- [x] 2.2 Unit test the parse: `R100` → 100, `R087` → 87, `M` → undefined
- [x] 2.3 Run the staged-files tests — all pass

## 3. The staged check

- [x] 3.1 Add `stagedSendCopiesCheck` (`staged.send_copies`, invariant, `staged` scope) to `src/core/checks/write-lifecycle-checks.ts` and `WRITE_LIFECYCLE_CHECKS`: a staged file is a send copy when its extension is a send-copy extension and its folder holds `index.html` in the resulting tree (D3); emit `staged.send_copies.undated` for an added or renamed-in send copy without a dated name, and `staged.send_copies.modified` for status `M` or a rename with `renameScore` below 100 or undefined; skip deletions and subfolder files; each message names the fix (D5)
- [x] 3.2 Tests, one per scenario in `specs/write-lifecycle/spec.md`: undated add refused; dated add passes; in-place change refused; pure move passes (between pages and from outside the publish path); rename with change refused; deletion of a page passes; changed `assets/kickoff.pdf` passes; plus a page and its first send copy staged together is checked
- [x] 3.3 An integration test through the real hook: in a temp store, `git commit` of an undated `brief.pdf` beside a page's `index.html` is refused and names `staged.send_copies.undated`
- [x] 3.4 Run the write-lifecycle unit and hook integration tests — all pass

## 4. The lint report

- [x] 4.1 Add `sendCopyNameCheck` (`organize.send_copy_name`, observation, `store` scope) to `src/core/checks/organize-checks.ts` and `ORGANIZE_CHECKS`, walking `publishedPageFolders` and reporting each undated send copy with its page folder
- [x] 4.2 Tests: an undated `model.xlsx` is reported and lint's exit code is unchanged; a store with only dated send copies reports nothing; `assets/` and `.csv` files are not reported
- [x] 4.3 Run the organize-checks tests — all pass

## 5. Publish skill

- [x] 5.1 In `templates/skills/ctxr-publish.md` step 8, add that the commit is refused when it adds an undated send copy or changes one already committed, and that a new send is a new dated file; ASD-STE100 for the touched sentences, each reason a `Why:` sentence; check the tier-word and flag-attribution guards
- [x] 5.2 Assert it in `test/unit/skills.test.ts`; run `npx vitest run test/unit/skills.test.ts` — all pass

## 6. Whole suite

- [x] 6.1 Run `npm run build && npm run typecheck && npm test` — all pass
- [x] 6.2 Run the new checks against the three downstream stores' `origin/main` in throwaway worktrees with the built CLI: `ctxr lint` reports no `organize.send_copy_name` in any of them
- [x] 6.3 Run `openspec validate send-copies-gated-at-commit --strict` — valid
