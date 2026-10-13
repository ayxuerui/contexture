## 1. Audit the existing pages before implementing anything

The least reversible call in this change is D4 — that a kept page represents one note. It rests on
one measurement of lead links, not on a classification of what pages actually are. Nothing in
phases 2–7 starts until this phase is done and D4 is confirmed or revised.

- [x] 1.1 Read-only, against local clones of both downstream client stores (pkm and readyrun-brain),
      at their current default branch: list every page (`find <publish path> -name index.html`), and
      for each read its README and index page and classify it as **one-note** (it is the rendered
      form of a single note), **hub-note** (it covers a folder or set, and that folder has — or
      plainly should have — a hub note it represents), or **neither** (no single note it could
      honestly represent; note whether it reads as a one-off that would have been disposable). Also
      record whether its README's first wikilink already names that note, and whether either store
      has a `disposable` directory under its publish path or a top-level notes folder slugifying to
      `disposable` (D2's flip). Write nothing in either store.
- [x] 1.2 Record the result in design.md under "Audit of existing pages": per store, the count in each
      class, the count whose lead link already names the represented note, the `neither` pages listed
      by path with one line each, and the `disposable` collision finding.
- [x] 1.3 Decide on the result, and write the decision into D4 before any code: **confirm** D4 when
      `neither` pages are few and read as one-offs (they become disposable or gain a hub note in the
      migration); **revise** it — e.g. a third lifespan for set-shaped kept pages, or a represented-note
      check that accepts a folder — when `neither` pages are a meaningful share of kept pages. A
      revision updates proposal.md, the publish spec delta and phases 3–6 here before phase 2 starts.
- [x] 1.4 `openspec validate two-kinds-of-published-page --strict` — clean after the design.md update.

## 2. Lifespan and the lead link, as modules

- [ ] 2.1 `src/core/publish/lifespan.ts` (new): `DISPOSABLE_SEGMENT = 'disposable'`,
      `DISPOSABLE_REVIEW_DAYS = 30` (a code constant, not config — D6), `lifespanOf(relativePath,
      publishPath): 'permanent' | 'disposable' | null` (null outside the publish path), and
      `parseDisposableDate(folderName)` returning a valid calendar date or null (rejects `2026-13-45`).
      Comment the reservation reasoning (D2: a store folder named "Disposable" slugifies to it, so the
      name is reserved rather than unreachable).
- [ ] 2.2 `src/core/publish/represents.ts` (new): `readLeadLink(readmeRaw, readmePath)` — moved out of
      `filing.ts`'s `readmeLeadsWithStem`, which now calls it (D4: one reading); `resolveRepresented(
      store, stem)` returning `{ note } | { none } | { ambiguous: paths[] }` by the stem resolution the
      entity selector uses; `readHashMarker(line)` and `appendHashMarker(line, hash)` using the catalog's
      `<!-- hash:<16 hex> -->` form and `contentHashOfBody` — import, never re-spell, the hash primitive.
- [ ] 2.3 `test/unit/publish-lifespan.test.ts` and `test/unit/publish-represents.test.ts` (new): lifespan
      table (segment first, nested, elsewhere, outside publish path); date parse (valid, invalid month,
      no date); lead link (frontmatter excluded, first of many, none); resolution (one, none, two
      sharing a stem); marker read/append round-trip and no double-append.
- [ ] 2.4 Prove the `filing.ts` refactor is behaviour-neutral:
      `npx vitest run test/unit/publish-filing.test.ts test/unit/publish-gather-command.test.ts --exclude '**/.claude/**'`
      — green, unchanged test files.
- [ ] 2.5 `npx vitest run test/unit/publish-lifespan.test.ts test/unit/publish-represents.test.ts --exclude '**/.claude/**'` — green.

## 3. Disposable pages: scaffold and check

- [ ] 3.1 `src/commands/publish-new.ts`: `disposable` flag. With it, the slug is one segment, refused if
      it begins with the reserved date pattern (new error naming that the command supplies the date),
      and the page is scaffolded at `<publish>/disposable/<date>-<name>` using the same `dateCreated`
      the skeleton stamps. Without it, a slug whose first segment is `DISPOSABLE_SEGMENT` is refused
      with an error naming `--disposable`. Add `lifespan` to `PublishNewData` and the summary. Error
      messages live in `src/core/errors.ts` beside the existing publish errors.
- [ ] 3.2 `src/run.ts`: register `--disposable` on `publish new`; extend its description.
- [ ] 3.3 `src/commands/publish-check.ts`: compute lifespan; for a disposable page add
      `disposable-shape` (exactly one level under the segment, `parseDisposableDate` non-null); add
      `lifespan` to `PublishCheckData` and the summary.
- [ ] 3.4 `src/core/publish/filing.ts` / `src/commands/publish-gather.ts`: when the derived path's first
      segment equals `DISPOSABLE_SEGMENT`, report that no filing path derives, with the reservation as
      the named reason (a second reason beside the store-root one); the resolved set is still reported
      and the exit code is still the success code. `publish new`'s refusal message (3.1) names the
      reservation as well as `--disposable`. Test in `test/unit/publish-gather-command.test.ts`: a
      subject under a top-level folder named `Disposable` derives no path, names the reservation,
      reports its notes, exits 0; a folder named `disposable-notes` is unaffected.
- [ ] 3.5 `test/unit/publish-new-command.test.ts`: dated path on a fixed clock; caller date refused;
      multi-segment refused; `disposable/...` slug without the option refused; second run same day
      refused and folder unchanged; existing dated-slug and escape refusals still pass unchanged.
- [ ] 3.6 `test/unit/publish-check-command.test.ts`: well-formed disposable passes; nested and undated
      fail `disposable-shape`; disposable with a README linking nothing reports no represented-note
      failure; `page-location` still passes for `disposable/<dated>/`; a page hand-filed at
      `disposable/ctx-a/example-page` (a permanent page misfiled there) fails `disposable-shape`.
- [ ] 3.7 `npx vitest run test/unit/publish-new-command.test.ts test/unit/publish-check-command.test.ts test/unit/publish-gather-command.test.ts --exclude '**/.claude/**'` — green.

## 4. Permanent pages: represented note and drift

- [ ] 4.1 `src/commands/publish-check.ts`: for a permanent page add `represented-note` (none /
      not-found / ambiguous with candidates) and `represented-note-hash` (not-stamped / stale). The
      check needs the store's note enumeration: load it via `listNotes` once per run. Still writes
      nothing.
- [ ] 4.2 `src/commands/publish-stamp.ts` (new) + `src/run.ts` registration of `publish stamp <path>`:
      refuse disposable; refuse unresolvable lead link writing nothing; append the marker only when the
      lead-link line has none (atomic write); otherwise report current or stale and write nothing.
- [ ] 4.3 `test/unit/publish-check-command.test.ts`: lead link passes; many citations after the lead
      pass; no link, unknown stem, and shared stem each fail with the right reason; stamped-and-current
      passes; note edited after stamp fails as stale; unstamped fails as not stamped.
- [ ] 4.4 `test/unit/publish-stamp-command.test.ts` (new): first stamp writes one marker and changes
      nothing else (byte-compare the folder); second run byte-unchanged and reports stale after a note
      edit; remove-marker-then-stamp makes `publish check` pass; disposable refused; unresolvable
      refused with README byte-unchanged.
- [ ] 4.5 Prove the guard is real: in a temp copy (`cp`, never `git stash` — the stash stack is shared
      across worktrees), make `appendHashMarker` overwrite an existing marker, run
      `npx vitest run test/unit/publish-stamp-command.test.ts --exclude '**/.claude/**'` and see it
      FAIL, then restore.
- [ ] 4.6 `npx vitest run test/unit/publish-check-command.test.ts test/unit/publish-stamp-command.test.ts --exclude '**/.claude/**'` — green.

## 5. Reports: urls and lint

- [ ] 5.1 `src/commands/publish-urls.ts`: `lifespan` on every `PageUrlEntry` (a moved page's from its new
      location) and in the human table.
- [ ] 5.2 `src/core/checks/organize-checks.ts` (and the manifest): two `observation`-severity store
      checks, `disposable-page-due` (age > `DISPOSABLE_REVIEW_DAYS` from the parsed name date; undated
      skipped) and `page-representation` (reusing `represents.ts`, never re-implementing it). Confirm
      neither is registered at doctor severity.
- [ ] 5.3 Tests: `test/unit/publish-urls-command.test.ts` — lifespan per entry, moved page across the
      boundary; lint check tests on a fixed clock — 45 days listed, 10 not, nothing on disk changes,
      stale/unstamped/no-note each listed, current page silent; a doctor test asserting doctor passes
      with a 400-day-old disposable page and an unstamped permanent page present.
- [ ] 5.4 `npx vitest run test/unit/publish-urls-command.test.ts test/unit/organize-checks.test.ts test/unit/doctor-command.test.ts --exclude '**/.claude/**'`
      — green (adjust file names to the existing ones for lint/doctor checks).

## 6. Shipped prose

- [ ] 6.1 `templates/skills/ctxr-publish.md`: a new first step deciding lifespan (permanent = the rendered
      form of one note that will keep changing; disposable otherwise; a kept page that can name no note
      is disposable); step 1's "earns a page over a note" scoped to permanent pages; a disposable path
      (`ctxr publish new --disposable <name>`, not filed by `gather`'s path, never revised after landing,
      removal is the operator's when lint lists it); step 4's lead-link sentence becomes the checked
      invariant with the hub-note rule for a folder subject; `ctxr publish stamp` after the README is
      written; step 6 names the new checks; step 8's drift paragraph gains the review → remove marker →
      stamp discipline (mirroring `ctxr-derived-artifacts`' gloss wording); the dated-slug paragraph says
      the reserved naming is what `--disposable` stamps.
- [ ] 6.2 `templates/skills/ctxr-organize-audit.md`: a "Disposable pages and drifted pages" section —
      propose lint's removal candidates to the operator, remove only approved ones on a session branch
      with `git rm -r`, land through `ctxr-submit` (the Pages table marks each address as ceasing to
      work); hand `page-representation` findings to `ctxr-publish`.
- [ ] 6.3 `templates/skills/ctxr-submit.md` step 8: the Pages table gains the lifespan column, copied from
      the report.
- [ ] 6.4 `README.md` "Express — publish a page": one example of `--disposable` and one of
      `ctxr publish stamp`, and the two-lifespan sentence.
- [ ] 6.5 Banned-word and flag hygiene: grep the three edited skills for the seven banned words
      (`grep -inwE 'personal|private|public|shared|internal|team|confidential'` must print nothing), and
      confirm every `--flag` binds to a registered option via the existing owned-skill option test.
- [ ] 6.6 `test/unit/skills.test.ts`: assert the lifespan step precedes the `ctxr publish gather` step;
      `--disposable` and `ctxr publish stamp` present in the publish skill; organize-audit proposes
      removal and hands drift to publish; submit's Pages row carries lifespan.
- [ ] 6.7 `npx vitest run test/unit/skills.test.ts test/unit/single-source-literals.test.ts --exclude '**/.claude/**'` — green.

## 7. Full verification

- [ ] 7.1 `npm run typecheck && npm run build` — both clean.
- [ ] 7.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [ ] 7.3 Read-only, against local clones of both downstream client stores: `find <publish path> -maxdepth 1 -name 'disposable'`
      prints nothing (D2 collision risk), and running the built `ctxr lint --json` there reports the
      expected `page-representation` backlog — record the counts in the PR body.
- [ ] 7.4 End to end in a temp store (`ctxr init` with `CONTEXTURE_BIN` pointing at this worktree's
      `dist/bin.js`): write a note; `ctxr publish new --disposable demo` and `ctxr publish check` on it
      pass; `ctxr publish new ctx-a/page-one`, fill the README lead link, `ctxr publish check` fails
      `represented-note-hash`, `ctxr publish stamp` then `ctxr publish check` exits 0; edit the note and
      `ctxr publish check` exits non-zero naming stale; `ctxr lint --json` lists it and exits 0.
- [ ] 7.5 `openspec validate two-kinds-of-published-page --strict` and `openspec validate --specs` — both
      clean.
