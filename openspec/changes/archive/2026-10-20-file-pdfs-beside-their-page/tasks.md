## 1. Shared date reader

- [x] 1.1 Rename `parseDisposableDate` to `parseLeadingDate` in `src/core/publish/lifespan.ts` and update its callers (`publish-check.ts`, `organize-checks.ts`) and `test/unit/publish-lifespan.test.ts`; behaviour unchanged (design.md D4)
- [x] 1.2 Run `npx vitest run test/unit/publish-lifespan.test.ts test/unit/publish-lifespan-lint.test.ts test/unit/publish-check-command.test.ts` — all pass

## 2. `publish check` reads a page's PDFs

- [x] 2.1 Add the `pdf-name` check: for each `.pdf` directly in the page folder (not in a subfolder), fail when the name without `.pdf` has no `parseLeadingDate` match, naming the file; for both lifespans
- [x] 2.2 Add `pdfs: { path, served_at }[]` to `PublishCheckData`, sorted by file name, `served_at` from `pageServedAt`; count them in the human summary when non-zero (design.md D5)
- [x] 2.3 When the path argument is a `.pdf` file, check its folder's `index.html` instead; a missing index page raises the existing `PublishPageNotFoundError` for that index path
- [x] 2.4 Unit tests in `test/unit/publish-check-command.test.ts`, one per scenario in `specs/publish/spec.md`: dated PDF passes and is listed; `brief.pdf` fails with every other check still reported; `2026-02-30-brief.pdf` fails; `assets/kickoff.pdf` ignored and unlisted; two renderings listed in date order; a PDF argument checks its page; a stale page with a newer PDF stays stale; a disposable page with an undated PDF fails `pdf-name`
- [x] 2.5 Run `npx vitest run test/unit/publish-check-command.test.ts` — all pass

## 3. Serve PDFs as PDFs

- [x] 3.1 Add `'.pdf': 'application/pdf'` to `CONTENT_TYPES` in `src/commands/serve.ts`
- [x] 3.2 Integration tests in `test/integration/serve-command.test.ts`: a PDF under the publish route and one under a worktree preview route each answer `200`, `application/pdf`, body byte-identical
- [x] 3.3 Run `npx vitest run test/integration/serve-command.test.ts` — all pass

## 4. Publish skill

- [x] 4.1 In `templates/skills/ctxr-publish.md`, add the PDF filing rule: written at the page folder's root beside `index.html`, file name led by the render date; never a page on its own; an input PDF goes in `assets/`; a re-render adds a new dated file and leaves earlier ones; how it is produced is the store's choice (a print of `index.html`, or a document pipeline that keeps its styled HTML as `index.html`); render a PDF when one is sent, not on every page edit. List `pdf-name` among the checks in step 6 and say `publish check` prints each PDF's address. Check the prose against the tier-word and flag-attribution guards
- [x] 4.2 Tests in `test/unit/skills.test.ts` asserting the rendered `ctxr-publish` skill states each scenario in `specs/harness-portability/spec.md` and names `pdf-name`
- [x] 4.3 Run `npx vitest run test/unit/skills.test.ts` — all pass

## 5. Whole suite

- [x] 5.1 Run `npm run build && npm run typecheck && npm test` — all pass
- [x] 5.2 Run `openspec validate file-pdfs-beside-their-page --strict` — valid
