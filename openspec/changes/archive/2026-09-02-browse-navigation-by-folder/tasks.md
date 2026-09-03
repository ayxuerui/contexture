## 1. Path-tree primitive

- [x] 1.1 Write `src/core/browse/tree.ts`: build a nested tree from a list of `/`-separated relative
      paths plus per-leaf `label` and `href` mappers (design.md D2). A directory node holds child
      directories and leaves; a path with no directory segment becomes a leaf at the root; directory
      children sort before leaves, each group sorted by name. Pure data — no HTML.
- [x] 1.2 Export `titleFor(note)` from `src/core/catalog/model.ts` (D6), leaving its behavior and its
      existing catalog-builder caller untouched.
- [x] 1.3 Write `test/unit/browse-tree.test.ts`: a leaf at the root; a leaf nested several directories
      deep; two leaves sharing a directory prefix collapsing into one directory node; a directory whose
      only child is another directory; a directory name equal to a sibling leaf's name; deterministic
      ordering for the same input in a different order.
- [x] 1.4 Verify: `npx vitest run test/unit/browse-tree.test.ts --exclude '**/.claude/**'`.

## 2. Published-page enumeration

- [x] 2.1 Replace `publishSlugs()` in `src/core/browse/routes.ts` with `publishPages()` (D4): every
      directory path in `publishFiles` that holds an `index.html`, sorted, each addressable at its full
      path under the publish route. Keep `buildRouteTable()`'s never-cached construction unchanged.
- [x] 2.2 Extend `test/unit/browse-routes.test.ts`: a page directly under the publish path is still
      found; a page nested two directories deep is found at its full path; a directory containing files
      but no `index.html` is not reported as a page; a publish path that does not exist yields none.
- [x] 2.3 Verify: `npx vitest run test/unit/browse-routes.test.ts --exclude '**/.claude/**'`.

## 3. Navigation rendering

- [x] 3.1 Write `src/core/browse/nav.ts`: `renderNav(table)` producing the navigation region — the four
      content areas in the order published pages, notes, catalog, graph, with the notes and published-
      page trees rendered from phase 1 as nested `<details>`/`<summary>` (top level `open`, deeper
      levels closed, per D3), note leaves labelled by `titleFor()`, and an explicit empty state for an
      area with nothing in it. Escape every label and href.
- [x] 3.2 Move the index rendering out of `src/commands/serve.ts`'s private `renderIndex` into
      `nav.ts` as `renderIndexBody(table)`, reordered to published pages → notes → catalog → graph and
      rendering the same trees (D7). This is what makes the index markup unit-testable at all; it is
      module-private and integration-only today.
- [x] 3.3 Write `test/unit/browse-nav.test.ts`: section order in both the nav and the index body; a
      nested note renders inside nested `<details>` rather than as a whole-path entry; a root-level note
      renders outside any group; an empty area renders its empty state; a nested published page links to
      its full path under the publish route; no `<script>` appears in the output; a note path or title
      containing HTML metacharacters is escaped.
- [x] 3.4 Verify: `npx vitest run test/unit/browse-nav.test.ts --exclude '**/.claude/**'`.

## 4. Shell, layout, and wiring

- [x] 4.1 Add a `{{NAV}}` slot to `templates/serve/shell.html` beside `{{TITLE}}` and `{{BODY}}`,
      wrapping the navigation and `<main>` in a layout container (D1).
- [x] 4.2 Change `renderShell(title, bodyHtml)` to `renderShell(title, bodyHtml, navHtml)` in
      `src/core/browse/templates.ts`, substituting all three slots exactly once each. Two fixes in the
      same function while it is open: escape `title` (it is interpolated raw into `<title>` today), and
      substitute with a replacer function rather than a string, so a `$&` or `$'` sequence in a note
      path cannot corrupt the output.
- [x] 4.3 Pass `renderNav(table)` from all four HTML routes in `src/commands/serve.ts` (index, note,
      catalog section, graph document) and delete the private `renderIndex`/`listItems` in favor of
      `renderIndexBody`. Leave the publish route serving byte-verbatim with no shell wrapping.
- [x] 4.4 Add the two-column layout to `templates/serve/style.css` over the existing `--ctxr-*` custom
      properties (including the currently-unused `--ctxr-muted` for folder labels): a grid with the
      navigation on the left and the content column keeping its current reading width, plus a
      narrow-viewport media query that stacks the navigation above the content, and `<summary>` styling
      that reads as a folder.
- [x] 4.5 Update `test/integration/serve-command.test.ts`, whose index assertion expects a flat
      whole-path entry: assert instead that the index and a note page both carry the navigation, that
      its four areas appear in the required order, that a nested note is reachable through the tree, and
      that `/assets/style.css` still returns `200 text/css`.
- [x] 4.6 Verify: `npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'`.

## 5. Nested publish slugs

- [x] 5.1 Update `src/commands/publish-new.ts` per D5: split the slug on `/`; refuse a slug with an
      empty, `.`, `..`, or absolute segment with a non-zero exit naming the reason and writing nothing;
      apply `RESERVED_SLUG_PATTERN` to the final segment only; keep the existing-folder refusal;
      `mkdir` already creates intermediate directories. Add the escape refusal to `src/core/errors.ts`
      if neither `PublishReservedSlugError` nor `PublishSlugExistsError` fits.
- [x] 5.2 Extend `test/unit/publish-new-command.test.ts` with a case for each
      scenario in the modified `publish` requirement: single-segment slug unchanged; nested slug creates
      intermediate directories with the same skeleton and README; date-prefixed final segment refused at
      any depth; date-prefixed intermediate directory allowed; `../` and absolute segments refused with
      nothing written anywhere; existing folder still never overwritten.
- [x] 5.3 Update the `publish new <slug>` description in `src/run.ts` — it reads "scaffold a page
      folder with a sibling README, refusing a reserved or already-existing slug" and should say the
      slug may name a path.
- [x] 5.4 Verify: `npx vitest run test/unit/publish-new-command.test.ts --exclude '**/.claude/**'`.

## 6. Full verification

- [x] 6.1 `npm run typecheck && npm run build && npx vitest run --exclude '**/.claude/**'` — full suite
      green (99 files / 849 tests).
- [x] 6.2 `openspec validate browse-navigation-by-folder --strict && openspec validate --specs` — both
      clean (change valid; specs 15/15 — this change's deltas aren't in main specs until `/opsx:sync`).
- [x] 6.3 Manually verified end-to-end against a scratch store (`ctxr init`; a root note, notes under
      `projects/alpha/beta.md`, `projects/alpha/deep/design.md` with a frontmatter title, and
      `areas/health.md`; `ctxr catalog build`; `ctxr graph build`; `ctxr publish new example-page` and
      `ctxr publish new folder-a/folder-b/nested-page`; `ctxr serve --port 0 --json`). The navigation
      appeared on the index, a note page, a catalog section, and `/graph` — four headings each, reading
      Published pages → Notes → Catalog → Graph, matching the index's own `<h2 id=...>` order. Notes
      rendered as a tree (`projects` > `alpha` > `deep` > "Design Doc", the frontmatter title) with the
      root note outside any group; top-level groups came back `<details open>` and deeper ones closed.
      The nested page linked to `/publish/folder-a/folder-b/nested-page/index.html` and returned `200`;
      `contexture.yaml` and a missing note returned `404`; `POST /` returned `405`; `/assets/style.css`
      returned `200 text/css`. `ctxr publish new folder-a/2026-01-01-x`, `../escape`, and `/etc/escape`
      each exited `2` writing nothing anywhere, while `2026-01-01-archive/living-page` succeeded — the
      date rule binds the page's own segment. A note added while the server ran appeared in the tree and
      resolved its wikilinks on the next request with no restart. No `<script>` in any response; stdout
      carried exactly one JSON envelope while all 29 request lines went to stderr.
