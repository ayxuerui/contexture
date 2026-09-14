## 1. The grouping-directory label

- [x] 1.1 `src/core/browse/tree.ts`: add an optional `label?: string` to `TreeDirectory` and an
      optional fourth parameter `directoryLabelFor?: (dirPath: string) => string | undefined` to
      `buildPathTree`, called with the directory's full `/`-separated path within the tree (D6).
      Leave `compareNodes` untouched so ordering stays on `name` (D7) — note that in a comment
      citing D7, since the omission is the decision.
- [x] 1.2 `src/core/browse/routes.ts`: add `groupLabels: ReadonlyMap<string, string>` to
      `RouteTable` and populate it in `buildRouteTable` from `store.config.taxonomy.layers` — each
      layer's `path` with any trailing `/` stripped, mapped to its `name`. Cite D5 for why the nav
      receives a resolved map rather than the taxonomy.
- [x] 1.3 `src/core/browse/nav.ts`: render `node.label ?? node.name` in `renderTree`, and pass
      `(dirPath) => table.groupLabels.get(dirPath)` as `buildPathTree`'s directory-label argument in
      both the `publish` and the `notes` branches of `renderAreaContent` (D8). `renderNav` and
      `renderIndexBody` keep their signatures.
- [x] 1.4 `test/unit/browse-nav.test.ts`: add `groupLabels: new Map()` to `makeTable`'s defaults, and
      a `withGroupLabels` helper so a case can set it.
- [x] 1.5 `test/unit/browse-tree.test.ts`: assert `buildPathTree` sets `label` on a directory whose
      path the callback answers, leaves it `undefined` otherwise, passes the directory's full path
      (not its last segment) to the callback, and orders siblings unchanged when labels would sort
      differently.
- [x] 1.6 `test/unit/browse-nav.test.ts`: assert a published-page group at a labelled path renders
      the label, a group at an unlabelled path renders its segment, a store with an empty
      `groupLabels` renders byte-identically to today, the notes area labels the same way, and a
      nested `x/ctx-a` group is NOT labelled when only `ctx-a` is (D6).
- [x] 1.7 Verify the guard is real — revert the renderer and confirm the suite FAILS:
      `cp src/core/browse/nav.ts /tmp/nav-new.ts && git show HEAD:src/core/browse/nav.ts > src/core/browse/nav.ts`
      then `npx vitest run test/unit/browse-nav.test.ts --exclude '**/.claude/**'` must fail; restore
      with `cp /tmp/nav-new.ts src/core/browse/nav.ts`. A plain copy rather than `git stash`: the
      stash stack is shared with the main checkout and every other worktree, so a stash here can be
      popped by another session.
- [x] 1.8 `npx vitest run test/unit/browse-tree.test.ts test/unit/browse-nav.test.ts test/unit/browse-routes.test.ts --exclude '**/.claude/**'`
      — green.

## 2. The filing-location check

- [x] 2.1 `src/commands/publish-check.ts`: add `checkPageLocation(relativePath, publishPath)`
      alongside the existing check functions and wire it into the `failures` array. Check name
      `page-location`. The page folder is `relativePath` with the configured publish path prefix and
      the `/index.html` suffix removed; it fails when what remains holds no `/`. Its message states
      that the page is filed directly at the configured publish path and names no expected parent
      (D1) — cite D1 and D2 for why it tests shape and only depth 0.
- [x] 2.2 `test/unit/publish-check-command.test.ts`: move the existing passing-page fixture under a
      grouping directory (`writePage(tmp.root, 'ctx-a/good', …)`) so it still satisfies every check,
      and update its expected `data.path`.
- [x] 2.3 `test/unit/publish-check-command.test.ts`: add cases — a page at the publish root fails
      naming `page-location` while still reporting its other checks; a page at
      `ctx-a/ctx-b/deep` passes the location check; the failure message names no expected directory.
- [x] 2.4 Verify the guard is real — confirm 2.3's flat-page case fails without the check:
      comment out the `checkPageLocation` call, run
      `npx vitest run test/unit/publish-check-command.test.ts --exclude '**/.claude/**'` and see it
      fail, then restore.
- [x] 2.5 `npx vitest run test/unit/publish-check-command.test.ts --exclude '**/.claude/**'` — green.

## 3. The convention in shipped prose

- [x] 3.1 `templates/skills/ctxr-publish.md` step 4: state that a page is filed under the top-level
      folder its subject's notes live in and named by the subject (`ctx-a/subject-name`, not
      `subject-name`); that `publish check` reports a page filed flat at the publish root; and that
      when the resolved set spans more than one top-level folder — or the store declares no layers —
      the agent picks the grouping folder that best names the subject, records that choice and its
      reason in the page's README, and names it to the operator (D4). Keep the existing
      reserved-dated-prefix and never-rename text. No layer name may appear — the prose must read as
      "the top-level folder", not as any shipped profile's layer.
- [x] 3.2 `test/unit/skills.test.ts`: in the existing `ctxr-publish` case, assert step 4 states the
      filing rule and the cross-cutting fallback.
- [x] 3.3 `README.md` `### 5. Express`: change the `publish new` example's slug to two segments so the
      shipped example demonstrates the convention, and add one clause to the `check` sentence naming
      the filing-location gate.
- [x] 3.4 `README.md` `### 5. Express`: while rewriting that block, correct the `publish check`
      example to name the page's `index.html` rather than its directory — the command reads its
      argument as a file (`readFile`, then `dirname` for the sibling README), so the shipped example
      as written fails with `EISDIR`. Adjacent pre-existing defect, fixed here only because this
      change rewrites the same two lines; strike this task to leave it as-is.
- [x] 3.5 `README.md` "Reading a store in a browser": add one sentence to the existing navigation-label
      paragraph noting that a folder group matching a configured taxonomy layer shows that layer's
      declared name.
- [x] 3.6 Verify no layer name leaked into `src/` and the prose guard holds:
      `npx vitest run test/unit/single-source-literals.test.ts test/unit/skills.test.ts --exclude '**/.claude/**'`
      — green.

## 4. Full verification

- [x] 4.1 `npm run typecheck && npm run build` — both clean.
- [x] 4.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 4.3 `openspec validate file-published-pages-by-location --strict` and `openspec validate --specs`
      — both clean.
- [x] 4.4 End-to-end against a real store: in a temp directory run `ctxr init`, scaffold two pages
      under different top-level folders and one at the root
      (`ctxr publish new <layer-a>/page-one`, `ctxr publish new <layer-b>/page-two`,
      `ctxr publish new page-flat`, reading the layer paths out of the generated `contexture.yaml`),
      then `ctxr serve --json` and `curl -s <url>/` — confirm the published-pages area shows the two
      grouping directories under their declared layer names with the pages nested inside, and the
      flat page as a top-level entry. Kill the server.
- [x] 4.5 Confirm the new check fires and is scoped: `ctxr publish check .contexture/publish/page-flat/index.html`
      exits non-zero naming `page-location`, and
      `ctxr publish check .contexture/publish/<layer-a>/page-one/index.html` names no
      `page-location` failure.
- [x] 4.6 `test/integration/serve-command.test.ts` asserted `<summary>projects</summary>` for a
      PARA store's notes folder group, which the label rule changes to `Projects` — found by 4.2, not
      foreseen when this list was written. Update that assertion to the declared name, and add a
      negative for the bare segment plus a positive for a non-layer group (`nested`), making this the
      end-to-end proof of the rule. `npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'`
      — green.
