## 1. The derivation

- [x] 1.1 `src/core/publish/filing.ts` (new, beside `script-check.ts` — D1): `slugifySegment` and
      `slugifyPath`. Lowercase, `NFC` after lowercasing, replace each run of
      `[^\p{L}\p{N}\p{M}]` with one `-`, trim `-`; `slugifyPath` maps segments and drops those that
      slugify to nothing. Record in comments, citing D6, why `&` is not expanded to `and`, why
      there is no length cap, and that idempotence is what lets the scan compare both sides through
      the same function.
- [x] 1.2 Same file: `deriveFiling(storeRoot, publishPath, subject)`. The group is
      `slugifyPath` of the subtree prefix or of the subject note's directory (D2 — never the
      resolved set). The subject segment is inserted when the scan finds at least one page or the
      group is empty (D3). Moves are `<derived prefix>/<the page's own final segment>`. Import
      `PUBLISH_INDEX_FILE` from `../browse/routes.js` rather than re-spelling `'index.html'`.
- [x] 1.3 Same file: the scan (D4). Read directory entries of `<publish>/<group>/` and
      `<publish>/<group>/<subject-slug>/` only, never recursively; a page is a directory holding
      `PUBLISH_INDEX_FILE`; count it when `extractLinkTargets(parseNoteText(README).body)` includes
      the subject stem (`readme-link`) or `slugifySegment(dirName) === subjectSlug` (`page-name`).
      `ENOENT` on either directory means no pages. Record the false-positive/false-negative
      reasoning in a comment citing D4.
- [x] 1.4 `test/unit/publish-filing.test.ts` (new): the slug table — case, spaces, comma, `&`,
      a punctuation-only segment → `''`, a non-Latin segment keeping its letters, an NFD input
      deriving the same slug as its NFC form, idempotence — and `slugifyPath` dropping empty
      segments.
- [x] 1.5 Same file: derivation cases — each selector; a three-deep folder path preserved whole; no
      page → no subject segment; one page matched by README link → segment plus a move; one matched
      by directory name → segment plus a move; a page citing a different subject not counted; a
      page one directory deeper under the group not counted; pages already under the segment → no
      move; a missing group directory; a subject note at the store root.
- [x] 1.6 Prove the guard is real: comment out the subject-segment insertion in `deriveFiling`, run
      `npx vitest run test/unit/publish-filing.test.ts --exclude '**/.claude/**'` and see it FAIL,
      then restore. Use `cp` to a temp copy rather than `git stash` — the stash stack is shared with
      the main checkout and every other worktree, so a stash here can be popped by another session.
- [x] 1.7 `npx vitest run test/unit/publish-filing.test.ts --exclude '**/.claude/**'` — green.

## 2. Gather reports it

- [x] 2.1 `src/commands/publish-gather.ts`: `resolveNoteSet` also returns the filing subject —
      `{ directory: dirname(rel), noteStem: basename(rel, '.md') }` for `--note`/`--entity`,
      `{ directory: flags.under }` for `--under`. `execute` calls `deriveFiling` and adds `filing`
      to `PublishGatherData`. Every existing field is untouched.
- [x] 2.2 Same file: `humanSummary` names the `publish new` form of the path (never the
      store-relative form — passing that to `publish new` would file the page under the publish path
      twice), and says so differently for the derivable, subject-segment, and underivable cases. One
      `notices` line per reported move, worded conditionally ("belongs at … once a second page for
      this subject exists"), naming the matching signal and that the URL changes (D5). `findings`
      stays `[]`.
- [x] 2.3 `src/run.ts` (~line 529): extend the `publish gather` description with the derived path.
- [x] 2.4 `test/unit/publish-gather-command.test.ts`: filing per selector; the uncapped depth; the
      move case, plus an assertion that the existing page directory is byte-unchanged after the
      command; the store-root case; and a round-trip case feeding the reported publish-relative
      prefix straight into `publishNewCommand.execute` (D7 — so the two cannot drift apart).
- [x] 2.5 `npx vitest run test/unit/publish-gather-command.test.ts test/unit/publish-new-command.test.ts --exclude '**/.claude/**'`
      — green.

## 3. The convention in shipped prose

- [x] 3.1 `templates/skills/ctxr-publish.md` step 4: replace the two-level convention with — take
      the path `ctxr publish gather` reports and append the page's own name; the depth is whatever
      the store's is, not a fixed number of levels; name the page for what it *is*, never for its
      subject, since the folder already carries the subject; when gather reports a page that would
      move, make the move and name the changed URL to the operator before writing anything. Keep the
      reserved dated-prefix rule, the never-rename-or-overwrite rule, and the fallback for a subject
      no folder path names. The string `Two levels, no more` disappears. No shipped taxonomy
      profile's layer path may appear.
- [x] 3.2 `templates/skills/ctxr-publish.md` step 2: one clause noting that `gather` reports where
      the page belongs as well as what it is drawn from.
- [x] 3.3 `test/unit/skills.test.ts` (~lines 346–358): replace the three assertions pinning the old
      rule, add `expect(s).not.toContain('Two levels, no more')` as the cap-removal regression
      guard, and adapt the no-layer-name loop to the new placeholder.
- [x] 3.4 `README.md` lines 267–272: the example shows the reported path feeding `publish new`, and
      the paragraph replaces "filed under the top-level folder … and which folder a cross-cutting
      subject belongs under is a judgment" with the derived-path sentence and the second-page
      sentence.
- [x] 3.5 `npx vitest run test/unit/skills.test.ts test/unit/single-source-literals.test.ts --exclude '**/.claude/**'`
      — green.

## 4. Full verification

- [x] 4.1 `npm run typecheck && npm run build` — both clean.
- [x] 4.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 4.3 `openspec validate derive-the-page-filing-path --strict` and `openspec validate --specs`
      — both clean.
- [x] 4.4 End to end against a real store: in a temp directory run `ctxr init`, write a note three
      folders deep, then `ctxr publish gather --note <path> --json` and confirm the reported
      publish-relative prefix is the three-deep slugified path with no subject segment. Scaffold it
      with `ctxr publish new "<prefix>/page-one"`, re-run gather, and confirm the prefix now carries
      the subject segment and exactly one move is reported.
- [x] 4.5 Confirm `publish check` was not tightened (D7):
      `ctxr publish check .contexture/publish/<prefix>/page-one/index.html` names no
      `page-location` failure at three levels deep.
- [x] 4.6 `ctxr serve --json` plus `curl -s <url>/` — the published-pages area nests to the derived
      depth rather than to two levels. Kill the server.
