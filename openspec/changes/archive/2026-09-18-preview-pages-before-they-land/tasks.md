## 1. Finding the worktrees

- [x] 1.1 `src/core/session.ts`: `listSessionWorktreeDirs(storeRoot, config)` — `readdir` of
      `path.join(storeRoot, config.session.worktrees_path)` with `withFileTypes`, keep directories,
      return their names sorted. `ENOENT` returns `[]`, matching how `walkFiles` already treats a
      missing publish path. Place it beside `isSessionWorktreePath` and record in a comment, citing
      D1, that this is the same path-shape identity that function already declares, and why the
      better-informed `listWorktrees()` is deliberately not used here (a subprocess per HTTP
      request, against a route table that is rebuilt per request and never cached).
- [x] 1.2 `test/unit/session.test.ts`: the enumerator returns directory names only (a stray file
      under the worktrees path is skipped), returns `[]` when the path does not exist, honours a
      `session.worktrees_path` other than the shipped default, and sorts its result.
- [x] 1.3 `npx vitest run test/unit/session.test.ts --exclude '**/.claude/**'` — green.

## 2. The route table

- [x] 2.1 `src/core/browse/routes.ts`: `RouteTable` gains `previews: ReadonlyMap<string,
      PreviewRoute>` keyed by worktree directory name, where `PreviewRoute` carries that worktree's
      own `files` and `titles` maps — the same shapes `publishFiles` and `publishTitles` already
      have. Document on the interface, citing D6, that `files` is keyed by the exact URL-relative
      path so a lookup miss is the entire traversal guard, exactly as the existing comment at the
      `publishFiles` field states for the publish route.
- [x] 2.2 Same file, in `buildRouteTable`: for each name from `listSessionWorktreeDirs`, walk
      `path.join(storeRoot, worktreesPath, name, store.config.publish.path)` through the existing
      `walkFiles`, and resolve titles through the existing `resolvePublishTitles` over
      `pagesFromPublishFiles`. Add no new walking, page-detection, or title-extraction code, and do
      not re-spell `'index.html'` — `PUBLISH_INDEX_FILE` is already the one definition. A worktree
      whose walk returns no page contributes no map entry (D-scenario: contributes nothing).
      Run the per-worktree walks with `Promise.all`, as `resolvePublishTitles` already does.
- [x] 2.3 Same file: `previewPages(table, worktree)` returning that worktree's sorted page list, as
      the public counterpart of `publishPages`, so `nav.ts` keeps resolving nothing itself.
- [x] 2.4 `test/unit/browse-routes.test.ts`: a worktree's pages reach `previews`; a worktree with a
      publish path but no `index.html` anywhere yields no entry; a worktree directory with no
      publish path at all yields no entry; a page's declared `<title>` is read from inside the
      worktree; nested pages key at their full path; a store with no worktrees path yields an empty
      `previews` map; two worktrees stay separate. Build the `StoreConfig` inline as the existing
      cases in this file do.
- [x] 2.5 `npx vitest run test/unit/browse-routes.test.ts --exclude '**/.claude/**'` — green.

## 3. The navigation

- [x] 3.1 `src/core/browse/nav.ts`: add `'preview'` to `AREAS` in second position (after
      `'publish'`, before `'notes'`), with `AREA_TITLES.preview = 'Preview'` and
      `AREA_ANCHORS.preview = 'preview'`. Because `AREAS` is the one declaration both `renderNav`
      and `renderIndexBody` read, the sidebar and the index page pick up the new area and its
      position together — do not add a second ordering anywhere.
- [x] 3.2 Same file, `renderAreaContent`'s `'preview'` case: build one path list of
      `` `${worktree}/${page}` `` across every entry in `table.previews`, and render it through the
      existing `buildPathTree`/`renderTree` pair so the worktree becomes the top-level group for
      free. Labels come from that worktree's own `titles` map falling back to `lastSegment`, exactly
      as the publish case does; hrefs are `/preview/<worktree>/<page>/${PUBLISH_INDEX_FILE}` with
      `encodeURI` on the path, mirroring the publish case. Empty renders the shared `EMPTY_STATE`.
- [x] 3.3 Same file: the directory-label resolver for this area strips the leading worktree segment
      before consulting `table.groupLabels` (D5), so a page filed under `ctx-a` reads the same here
      as in the published-pages area; the worktree segment itself matches no layer and keeps its own
      name. Comment it citing D5 and `file-published-pages-by-location` D8.
- [x] 3.4 `test/unit/browse-nav.test.ts`: the preview area renders second in both `renderNav` and
      `renderIndexBody`; a page groups under its worktree; a declared title labels the entry; a
      folder inside a worktree shows the configured layer's declared name while the worktree segment
      does not; an empty `previews` map still renders the named area with the empty state; the
      existing no-`<script>` assertion still holds.
- [x] 3.5 `npx vitest run test/unit/browse-nav.test.ts test/unit/browse-tree.test.ts --exclude '**/.claude/**'`
      — green.

## 4. The route

- [x] 4.1 `src/commands/serve.ts`: a `/preview/` branch placed directly after the `/publish/` branch
      it mirrors. Split the remainder on the first `/` into worktree name and file path; miss on
      either `table.previews.get(worktree)` or that entry's `files.get(filePath)` returns the same
      `404` the publish route returns; a hit reads the file and sends it with `contentTypeFor`,
      byte-verbatim, with no shell, no `shellHeaders`, and no theme — identical treatment to the
      publish branch (D6). No path normalisation, no `resolve`, no prefix check: the map miss is the
      guard.
- [x] 4.2 `test/integration/serve-command.test.ts`: a case that creates a real second worktree with
      `git worktree add` under `hermeticGitEnv()`, writes a page into that worktree's publish path,
      and asserts over HTTP that the preview URL returns it byte-identically, that the sidebar names
      the `Preview` area and links the page, that `/preview/<unknown>/index.html` is `404`, that
      `/preview/<worktree>/../../contexture.yaml` is `404`, and that a note inside the worktree is
      `404` on the note route. Use the existing `runCliBackground`/`stopCliBackground` helpers.
- [x] 4.3 Prove the traversal guard is real: temporarily replace the `files.get` lookup with a
      direct `readFile` of the joined path, run the escape assertion from 4.2 and see it FAIL, then
      restore. Use `cp` to a temp copy rather than `git stash` — the stash stack is shared with the
      main checkout and every other worktree, so a stash here can be popped by another session.
- [x] 4.4 `npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'` — green.

## 5. Documentation

- [x] 5.1 `README.md`, the `serve` section (~lines 278–286): name the preview area and the
      `/preview/<worktree>/<page>/` route in one short paragraph, saying that a page is previewable
      from the moment it exists on disk in a session worktree — before any commit, push, or PR — and
      that a preview is byte-identical to what `/publish/` will serve once it lands.
- [x] 5.2 Confirm nothing shipped moved into a TypeScript string literal:
      `npx vitest run test/unit/single-source-literals.test.ts --exclude '**/.claude/**'` — green.

## 6. Full verification

- [x] 6.1 `npm run typecheck && npm run build` — both clean.
- [x] 6.2 `npx vitest run test/unit --exclude '**/.claude/**'` and
      `npx vitest run test/integration --exclude '**/.claude/**'` — both green.
- [x] 6.3 `openspec validate preview-pages-before-they-land --strict` and `openspec validate --specs`
      — both clean.
- [x] 6.4 End to end against a real store: in a temp directory run `ctxr init`, `ctxr session start`,
      then inside the reported worktree `ctxr publish new "ctx-a/draft-page"` and give its
      `index.html` a distinctive `<title>`. Back at the store root run `ctxr serve --json`, then
      `curl -s <url>/` and confirm the `Preview` area names the worktree, nests `ctx-a`, and shows
      the declared title. Confirm nothing was committed: `git -C <root> status --porcelain` is clean
      at the store root.
- [x] 6.5 `curl -s <url>/preview/<worktree>/ctx-a/draft-page/index.html | diff - <worktree>/.contexture/publish/ctx-a/draft-page/index.html`
      — no output, proving the byte-verbatim requirement.
- [x] 6.6 Confirm the page is previewable at every stage of landing: re-run 6.5 after
      `git -C <worktree> add -A && git -C <worktree> commit -m wip`, and confirm the response is
      unchanged — the route consults no commit, push, or review state.
- [x] 6.7 Confirm the discovery is live, not bind-time: with the server still running, remove the
      worktree (`git -C <root> worktree remove --force <worktree>`), re-request `/`, and confirm the
      `Preview` area is now empty without a restart. Kill the server.
