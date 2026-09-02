## 1. Dependency and templates

- [x] 1.1 Add `markdown-it` (and its types) to `package.json` dependencies; run `npm install`.
- [x] 1.2 Write `templates/serve/shell.html` (the page shell: `<head>` with a viewport meta tag, a link
      to `/assets/style.css`, a `{{TITLE}}` and `{{BODY}}` slot) and `templates/serve/style.css` (a
      minimal readable stylesheet: body text width, code block styling, `.ctxr-broken-link` styling).
- [x] 1.3 Write `src/core/browse/templates.ts`: a small async reader for `templates/serve/*` files,
      mirroring `src/core/hooks.ts`'s pattern (not `packagedTemplate()` — see design.md D7), plus a
      `renderShell(title, bodyHtml)` helper doing the two-slot substitution.
- [x] 1.4 Verify: `npm run build` succeeds with the new dependency and template files bundled/copied.

## 2. Render core

- [x] 2.1 Write `src/core/browse/render.ts`: `renderNoteBody(body, resolveLink)` wraps a `markdown-it`
      instance with a wikilink inline rule — `[[Target]]` parses to a token carrying the raw target
      text, and the renderer calls `resolveLink(target)` to decide between an `<a>` and a
      `<span class="ctxr-broken-link">`.
- [x] 2.2 Write `src/core/browse/link-resolver.ts`: `buildLinkResolver(notes)` builds the same stem
      index shape `buildGraphFromNotes()` uses (reuse its exported logic rather than re-deriving it —
      factor out the stem-index construction from `src/core/graph/model.ts` into an exported helper if
      it isn't already independently callable) and returns a `resolveLink(target)` function yielding
      `{ path } | { reason: 'not_found' | 'ambiguous' }`.
- [x] 2.3 Write `test/unit/browse-render.test.ts`: a resolvable link renders `<a href="/notes/...">`; an
      unresolvable link renders a `.ctxr-broken-link` span naming `not_found`; two same-stem notes
      produce `ambiguous` for a link to that stem; ordinary markdown (headings, lists, code fences,
      emphasis) renders as expected.
- [x] 2.4 Verify: `npx vitest run test/unit/browse-render.test.ts --exclude '**/.claude/**'`.

## 3. Route table

- [x] 3.1 Write `src/core/browse/routes.ts`: given a `Store`, build an in-memory route table with four
      sections — notes (from `listNotes()`, each path mapped to `/notes/<path>`), catalog (from
      `catalogSectionsFor()` / `sectionFileName()`, mapped to `/catalog/<id>`), graph (a single route
      at `/graph` reading `graphDocumentPath()`, reporting "not yet built, run `ctxr graph build`" when
      the file is absent), and publish (every immediate subdirectory of `config.publish.path`, mapped
      to `/publish/<slug>/...` and served byte-verbatim with no HTML rendering).
- [x] 3.2 Write `test/unit/browse-routes.test.ts`: a fixture store's notes, catalog sections, and a
      publish page all appear in the route table at the expected URLs; a path outside every configured
      location (e.g. `contexture.yaml`, `.git/config`) does not appear under any route, by construction
      (asserting absence from the table, not a 403/404 at request time).
- [x] 3.3 Verify: `npx vitest run test/unit/browse-routes.test.ts --exclude '**/.claude/**'`.

## 4. Command and wiring

- [x] 4.1 Write `src/commands/serve.ts`: `execute(store, { port })` starts an `http.createServer`
      bound to `127.0.0.1:<port>` (D1), dispatches GET/HEAD requests against the route table from
      phase 3 (any other method gets `405`), renders notes/catalog/graph through the shell + render
      core from phases 1–2, streams publish files verbatim, logs each request line to stderr, and
      resolves its returned `CommandOutcome` with `data: { url, port, root: store.root }` once the
      listener reports its bound address (D5) — the promise resolves at bind time, not at server close.
- [x] 4.2 Register `ctxr serve [--port <n>]` in `src/run.ts` following the existing command-registration
      pattern (`deriveRunEnv`, `runCommand('serve', ...)`, `openStore`).
- [x] 4.3 Write `test/integration/serve-command.test.ts`: spawn `dist/bin.js serve --port 0 --json`
      against a scratch store seeded with a note pair (one with a resolvable `[[link]]`, one without),
      a built catalog, a built graph, and one published page; parse the envelope's `data.url` from
      stdout; fetch `/`, a note URL (assert the resolved link renders as `<a>` and the note's own body
      text appears), a catalog section, `/graph`, and the published page (assert byte-for-byte
      equality with the source file); assert the listening address itself is `127.0.0.1`; assert a
      `POST` to any route returns `405`; terminate the child process and assert clean exit. Added a
      new `runCliBackground`/`stopCliBackground` pair to `test/helpers/run-cli.ts` since the existing
      `runCli` only resolves once its child has already exited, which a never-exiting `serve` never
      does on its own.
- [x] 4.4 Verify: `npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'`.

## 5. Full verification

- [x] 5.1 `npm run typecheck && npm run build && npx vitest run --exclude '**/.claude/**'` — full suite
      green (99 files / 815 tests).
- [x] 5.2 `openspec validate local-browsing-surface --strict` and `openspec validate --specs` (still
      14/14 — this change's capability isn't in main specs until `/opsx:sync`) both clean.
- [x] 5.3 Manually verified end-to-end against a scratch store (`ctxr init`, two notes with a
      resolvable and an unresolvable wikilink, `ctxr catalog build`, `ctxr serve --port 0 --json`):
      the envelope's `127.0.0.1` URL was the only stdout line; the index page linked to both notes and
      three catalog sections; the note page rendered the resolvable link as `<a>` and the unresolvable
      one as a titled `.ctxr-broken-link` span; `/graph` showed the `ctxr graph build` hint before the
      graph existed and real `<a>` links to both notes immediately after running it, with no server
      restart; `/assets/style.css` returned `200 text/css`; a `HEAD /` returned headers with no body
      read needed; `curl -X POST` returned `405`; a nonexistent note and an excluded path
      (`contexture.yaml`) both returned plain `404`; `kill -TERM` stopped the process cleanly; every
      request appeared in the stderr log, and stdout never received a second line.
