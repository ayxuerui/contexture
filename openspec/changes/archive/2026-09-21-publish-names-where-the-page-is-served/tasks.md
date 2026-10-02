## 1. One home for the two route prefixes

- [x] 1.1 `src/core/browse/page-url.ts` (new, beside `routes.ts` — D1): `PUBLISH_ROUTE_PREFIX`,
      `PREVIEW_ROUTE_PREFIX`, `publishRoute(filePath)` and `previewRoute(worktree, filePath)`.
      `encodeURI`, never `encodeURIComponent` — a page path carries `/` and must survive; record in
      a comment that `serve.ts` decodes the whole pathname once with `decodeURIComponent`, which is
      what makes the round trip exact.
- [x] 1.2 `src/core/browse/nav.ts`: the publish and preview href builders call the two functions.
      The emitted strings must be byte-identical — `test/unit/browse-nav.test.ts` is the proof and
      must pass unmodified.
- [x] 1.3 `src/commands/serve.ts`: both route branches test and slice with the exported constants
      rather than inline literals.
- [x] 1.4 `test/unit/single-source-literals.test.ts`: a new case asserting the quoted literals
      `'/publish/'` and `'/preview/'` appear in `src/` only in `core/browse/page-url.ts`. Assert the
      scan is non-vacuous first, the way the existing cases do.
- [x] 1.5 Prove the guard is real: change `PREVIEW_ROUTE_PREFIX` to `'/previews/'`, run
      `npx vitest run test/unit/browse-nav.test.ts --exclude '**/.claude/**'` and see it FAIL, then
      restore. Set the edit aside with `cp`, never `git stash` — the stash stack is shared with the
      main checkout and every other worktree.
- [x] 1.6 `npx vitest run test/unit/browse-nav.test.ts test/unit/single-source-literals.test.ts test/integration/serve-command.test.ts --exclude '**/.claude/**'` — green.

## 2. The address derivation

- [x] 2.1 `src/core/browse/page-url.ts`: `ServedAtRoute`, `ServedAt`, and
      `pageServedAt(store, storeRelativeFilePath)` per D2. The "under the publish path" test is the
      one `checkPageLocation` (`src/commands/publish-check.ts`) already applies; cite it by name in
      the comment so the two cannot drift. The worktree branch is
      `isSessionWorktreePath(store.config, store.root)` plus `path.basename(store.root)` — cite
      `buildPreviews` (`src/core/browse/routes.ts`) as the reason that basename is the right key.
- [x] 2.2 Same file: the absolute-URL join, by stripping the base's trailing slashes and appending
      the route — NOT `new URL(route, base)`, which discards a base URL's own path prefix (D6).
      Say so in the comment.
- [x] 2.3 `test/unit/page-url.test.ts` (new): the publish area; the preview area from a worktree
      root; a file outside the publish path → `null`; a non-index file inside a page folder; a
      publish path written with a trailing slash; a page path needing URI encoding (a space, a
      non-Latin segment); a base URL unset, set, set with a path prefix, and set with a trailing
      slash.
- [x] 2.4 Same file: a round trip against the real route table — build a temp store with a session
      worktree holding a page, assert the route `pageServedAt` derives, decoded the way `serve.ts`
      decodes a request path, is a live key in `buildRouteTable`'s preview map. This is what stops
      the derivation and the server drifting apart.
- [x] 2.5 Prove the guard is real: make `pageServedAt` always take the publish branch, run
      `npx vitest run test/unit/page-url.test.ts --exclude '**/.claude/**'` and see the round-trip
      case FAIL by name, then restore.
- [x] 2.6 `npx vitest run test/unit/page-url.test.ts --exclude '**/.claude/**'` — green.

## 3. The opt-in base URL

- [x] 3.1 `src/config/schema.ts`: `ServeSchema` with `base_url` optional, refined to an absolute
      `http`/`https` base with no query and no fragment (D6); `serve: ServeSchema.optional()` on
      `StoreConfigSchema` — `.optional()`, not `.prefault({})`, with the D7 render-round-trip
      reasoning in the comment.
- [x] 3.2 `src/config/defaults.ts`: extend the comment enumerating what is deliberately absent from
      `SHIPPED_DEFAULTS` to name `serve.base_url` and why. Nothing is added to the object, and
      `ctxr init` writes nothing new.
- [x] 3.3 `test/unit/config-schema.test.ts`: a config declaring no `serve:` renders with no `serve`
      key at all (the D7 regression guard); a declared base URL is read and survives the render
      round trip; a value with no scheme, with a query, and with a fragment each fail to parse.
- [x] 3.4 Prove the guard is real: change `serve: ServeSchema.optional()` to
      `serve: ServeSchema.prefault({})` and run `npm run build`. It FAILS at
      `src/commands/init.ts` — `Property 'serve' is missing` — which is D7's mechanism caught one
      step earlier than the render test: prefaulted, the block becomes a key `init` must carry, and
      a key `init` carries is a key every generated config writes. Confirmed separately that a
      resolved `serve: {}` does render back out as `serve: {}`, so the render guard is not vacuous.
      Restore.
- [x] 3.5 `npx vitest run test/unit/config-schema.test.ts test/unit/integrity-checks.test.ts --exclude '**/.claude/**'` — green.

## 4. The commands report it

- [x] 4.1 `src/commands/publish-new.ts`: `served_at` on `PublishNewData`; the summary gains
      `Preview at <address> (at <publish address> once it lands).` or `Served at <address>.` per D3.
      Import `PUBLISH_INDEX_FILE` rather than re-spelling `index.html`.
- [x] 4.2 `src/commands/publish-check.ts`: the same field and the same sentence, on both the passing
      and the failing exit path.
- [x] 4.3 `src/run.ts`: both command descriptions say the command names where the page is served.
- [x] 4.4 `test/unit/publish-new-command.test.ts` and `test/unit/publish-check-command.test.ts`:
      extend the exact `toEqual` data assertions with `served_at`, keeping them exact.
- [x] 4.5 Same files: a store root that is a session worktree reports the preview area with its
      worktree and an after-landing address; a checked file outside the publish path reports
      `served_at: null`; a failing check still reports its address; a declared base URL makes `url`
      absolute and an absent one leaves it `null`.
- [x] 4.6 `test/integration/publish-served-address.test.ts` (new — the issue's own scenario, end to
      end): `ctxr init`, `ctxr session start --json`, then `ctxr publish new` run with the cwd set
      to the worktree. Assert stdout is exactly one line naming the preview route with the worktree
      directory as its first segment, and that the same command under `--json` yields one parseable
      value whose `served_at` names the preview area.
- [x] 4.7 Prove the guard is real: make `pageServedAt` return `null` unconditionally, run
      `npx vitest run test/integration/publish-served-address.test.ts --exclude '**/.claude/**'` and
      see it FAIL, then restore.
- [x] 4.8 `npm run build && npx vitest run test/unit/publish-new-command.test.ts test/unit/publish-check-command.test.ts test/integration/publish-served-address.test.ts --exclude '**/.claude/**'` — green.

## 5. Shipped prose

- [x] 5.1 `templates/skills/ctxr-publish.md` step 6: two paragraphs — both commands name the address
      the browsing surface answers for this page, open it and look before handing it on; a page
      written in a session worktree is previewable rather than published until it lands, that
      address stops serving when the worktree is reclaimed, and the command named its successor.
      No route literal, no `--flag`, none of the seven banned words.
- [x] 5.2 `test/unit/skills.test.ts`: assertions pinning the two new paragraphs' load-bearing
      sentences in the rendered `ctxr-publish` skill.
- [x] 5.3 `README.md`: correct the preview address form from a page directory with a trailing slash
      to the index file the server actually answers (D5); note in the publish section that both
      commands name the address; add `serve.base_url` where the opt-in keys are listed.
- [x] 5.4 `npx vitest run test/unit/skills.test.ts test/integration/owned-skills.test.ts --exclude '**/.claude/**'` — green.

## 6. Verification

- [x] 6.1 `npm run typecheck && npm run build` — both clean.
- [x] 6.2 `npx vitest run --exclude '**/.claude/**'` — the whole suite green.
- [x] 6.3 `npx openspec validate publish-names-where-the-page-is-served --strict` — valid.
- [x] 6.4 The issue, by hand: in a temp store, `ctxr init`, `ctxr session start`, then from inside
      the worktree `ctxr publish new folder-a/example-page`. From the store root run `ctxr serve`,
      and `curl` the reported route — `200`.
- [x] 6.5 The same `curl` against the published-pages address for that page — `404`, and against the
      preview address with a trailing slash in place of the index file — `404`. Both are the issue,
      reproduced.
- [x] 6.6 Declare `serve.base_url` with a path prefix in that store's `contexture.yaml`, re-run
      `ctxr publish check` on the page, and confirm the reported URL keeps the prefix. Stop the
      server.
