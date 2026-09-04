## Why

Three gaps in `ctxr serve`'s browsing surface surfaced from real use:

`src/core/browse/nav.ts:76` labels every published page with `lastSegment(page)` — the kebab-case
folder slug — while the notes area right below it (`nav.ts:86`) labels every note with `titleFor(note)`,
the store's one answer to "what is this called". `browse-navigation-by-folder` design.md D6 stated the
principle ("two contradictory answers to what a thing is called is a bug") and applied it to notes; it
was never applied to pages. The same slip exists in the shell `<title>`: `serve.ts:119` passes
`note.path`, not `titleFor(note)`, for a note whose nav entry already shows its declared title.

`templates/serve/style.css:1-20` offers exactly one palette choice — whatever `prefers-color-scheme`
reports — with no way for a reader to override it. Someone reading at night on a light-defaulting OS,
or in daylight on a dark-defaulting one, has no control.

The navigation cannot be dismissed. Below the `52rem` breakpoint (`style.css:58-69`) the entire store
tree renders *above* the content, so reading a note on a phone means scrolling past the whole tree
first. Above that breakpoint the sidebar is permanent, with no way to reclaim reading width on a laptop.

## What Changes

- A published page's navigation label and index entry are read from its own declared name (the
  `<title>` its `index.html` carries), falling back to today's folder-segment label when it declares
  none. `ctxr publish check` gains a check that a page declares a non-empty `<title>`, so the nav
  depends on something the checklist actually enforces. Note: `ctxr publish new`'s scaffold already
  writes `<title>${slug}</title>` (`publish-new.ts:47`), so a freshly scaffolded page's label is
  unchanged until its author retitles it — this change makes retitling take effect.
- The shell `<title>` for a note becomes its declared title plus its path (`titleFor(note) — note.path`),
  rather than the bare path — matching the nav entry for the same note, and keeping two identically
  named notes in different folders distinguishable in browser history.
- A reader chooses light, dark, or follow-system for the browsing surface's own pages (index, notes,
  catalog, graph). The choice is set by a link on the current page (`?ctxr-theme=<mode>`, handled
  inline by the route already serving that page — no redirect, no new route) and persists across
  navigation via a cookie the server reads on every request. No client-side script is involved anywhere
  in this: the shell renders the resolved theme onto `<html>` before the first byte of CSS is even
  requested.
- The navigation can be shown and hidden from one control in the page header, without client-side
  script: below the responsive breakpoint it is a disclosure that opens and auto-closes per navigation
  (a phone drawer should close after a tap); at or above it, it is a link that persists a collapsed or
  shown sidebar across navigation via a cookie (a desktop collapse that reset on the next click would
  not be a real control).
- `ctxr publish new`'s scaffolded page gains a `prefers-color-scheme` block in its own stylesheet, so a
  newly created page follows the reader's OS preference on its own — published pages are served
  byte-verbatim and cannot receive the browsing surface's theme choice from the server.

## Non-goals

- **Client-side script anywhere in serve output.** `context-browsing`'s navigation requirement and two
  existing tests (`test/unit/browse-nav.test.ts:104-108`, `test/integration/serve-command.test.ts:64`)
  depend on none existing; every affordance here is CSS or server-rendered, and none of it changes that.
- **Transforming published-page responses.** Byte-verbatim serving is a requirement of this capability;
  the theme reaches newly scaffolded pages through `publish new`'s own stylesheet, never through serve
  rewriting or wrapping what it returns.
- **Restyling already-published pages.** They are authored artifacts a person or agent wrote once; a
  scaffold change is not a migration and does not reach back into them.
- **A store-wide theme default in `contexture.yaml`.** A display preference is per-browser by nature; a
  cookie is the right grain. A store-level default can be proposed separately if one is ever wanted.
- **Caching the route table to make per-page-name reads cheaper.** Per-request rebuild from the store's
  own enumeration is `local-browsing-surface` design.md D2, and this change does not revisit it — the
  route table already reads and parses every note's frontmatter on every request, so bounded reads of
  every published page's `index.html` prefix do not change the order of that cost.
- **Wrapping published pages in the shell to give them navigation** (e.g. an `/publish-frame/` route).
  Separable from this change, and would not carry the theme across the document boundary regardless.

## Capabilities

### Modified Capabilities

- `context-browsing`: adds a display-theme requirement and a scriptless navigation show/hide
  requirement; restates the read-only-methods requirement to cover a `GET` that records a display
  preference; states that a published page's nav label follows its own declared name; states that the
  browsing surface's navigation and theme deliberately do not reach a published page.
- `publish`: the structural-invariants check gains a non-empty-`<title>` requirement; the scaffolded
  page's invariants gain a colour-scheme requirement.

## Impact

Affected code: `src/commands/serve.ts` (theme/nav query and cookie handling, response headers, the note
shell-title fix, moving the `/assets/style.css` route ahead of `buildRouteTable()`), `src/core/browse/
routes.ts` (`RouteTable` gains a `publishTitles` map resolved during route-table construction),
`src/core/browse/nav.ts` (publish-area labels read from that map), `src/core/browse/templates.ts`
(`renderShell` gains the theme/nav attributes), a new `src/core/browse/preferences.ts` (cookie parsing
and mode allowlisting), `templates/serve/shell.html` and `templates/serve/style.css` (the toggle markup
and attribute-keyed palettes — shipped markup and CSS live under `templates/`, not as TypeScript string
literals, per `local-browsing-surface` design.md D7), `src/commands/publish-new.ts` (scaffold gains a
colour-scheme block), `src/commands/publish-check.ts` (the new `<title>` check), `README.md`.

Affected stores: additive. No config key, no schema version change. A store with no published-page
`<title>` values keeps today's folder-segment labels exactly as they render now.
