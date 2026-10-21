## 1. One list of send-copy formats in `publish check`

- [x] 1.1 In `src/commands/publish-check.ts`, add `SEND_COPY_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.pptx']` and a helper that matches a file name's lower-cased extension against it (design.md D1); export the list for serve to reuse
- [x] 1.2 Rename `pdfsAtPageRoot` → `sendCopiesAtPageRoot`, `checkPdfNames` → `checkSendCopyNames`, the check id `pdf-name` → `send-copy-name`, `PublishCheckPdf` → `PublishCheckSendCopy`, and the data field `pdfs` → `send_copies` (D2); the name check strips whichever of the four extensions the file carries before `parseLeadingDate`; the summary reads "N send copy(ies)."
- [x] 1.3 Widen the path-argument redirect from `.pdf` to any send-copy extension
- [x] 1.4 Update the `file-pdfs-beside-their-page D4` comment in `src/core/publish/lifespan.ts` to name a send copy's file name
- [x] 1.5 In `test/unit/publish-check-command.test.ts`, carry the existing PDF cases over to the new names, and add one case per scenario in `specs/publish/spec.md` that the PDF cases do not cover: all four formats dated pass and are listed; `model.xlsx` fails with every other check reported; `2026-02-30-brief.docx` fails; `Brief.PDF` fails; `assets/source-data.xlsx` ignored; `data.csv` at the root ignored and unlisted; an `.xlsx` path argument checks its page
- [x] 1.6 Run `npx vitest run test/unit/publish-check-command.test.ts test/unit/publish-lifespan.test.ts` — all pass

## 2. Serve each format with its content type

- [x] 2.1 Add the three `application/vnd.openxmlformats-officedocument.*` entries to `CONTENT_TYPES` in `src/commands/serve.ts` (D4)
- [x] 2.2 Extend the PDF case in `test/integration/serve-command.test.ts` to an `.xlsx` on the publish route and a `.docx` on a worktree preview route, each `200`, the exact content type, body byte-identical
- [x] 2.3 Run `npm run build && npx vitest run test/integration/serve-command.test.ts` — all pass

## 3. Publish skill

- [x] 3.1 In `templates/skills/ctxr-publish.md` step 8, widen "A PDF of the page" to send copies: name the four formats; keep each existing rule (beside `index.html`, dated, never a page on its own, a new file per send, inputs in `assets/`, the store chooses how to make it); add that an office file that is itself the source stays beside its note, undated, unpublished, and that a dated copy sent from it is a send copy (D5). Step 6's check bullet and step 4's naming note follow the rename. Rewrite only the touched sentences toward ASD-STE100, each reason as its own `Why:` sentence; check the tier-word and flag-attribution guards
- [x] 3.2 Update the `file-pdfs-beside-their-page` test in `test/unit/skills.test.ts` to the new wording, and assert each scenario in `specs/harness-portability/spec.md`, including the hand-edited workbook rule and `send-copy-name`
- [x] 3.3 Run `npx vitest run test/unit/skills.test.ts` — all pass

## 4. Whole suite

- [x] 4.1 Run `grep -rn "pdf-name\|\.pdfs\b\|pdfs:" src templates test` — no output
- [x] 4.2 Run `npm run build && npm run typecheck && npm test` — all pass
- [x] 4.3 Run `openspec validate send-copies-beside-their-page --strict` — valid
