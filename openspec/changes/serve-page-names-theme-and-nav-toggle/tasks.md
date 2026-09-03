## 1. Page names

- [x] 1.1 `src/core/browse/routes.ts`: add a bounded-prefix `<title>` reader (4 KiB, `Buffer`-sliced,
      entity-decoded, whitespace-collapsed, length-capped) and resolve it per page during
      `buildRouteTable()`; `RouteTable` gains `publishTitles: ReadonlyMap<string, string>`.
- [x] 1.2 `src/core/browse/nav.ts`: the publish branch of `renderAreaContent` (:72-80) labels each page
      from `publishTitles`, falling back to `lastSegment(page)` when absent.
- [x] 1.3 `src/commands/serve.ts:119`: shell title for a note becomes `` `${titleFor(note)} — ${note.path}` ``.
- [x] 1.4 `src/commands/publish-check.ts`: add a non-empty-`<title>` check beside `checkViewportMeta`.
- [x] 1.5 Verify: `npx vitest run test/unit/browse-routes.test.ts test/unit/browse-nav.test.ts test/unit/publish-check-command.test.ts --exclude '**/.claude/**'`.

## 2. Theme

- [x] 2.1 New `src/core/browse/preferences.ts`: parse the `Cookie` header, allowlist
      `light|dark|system` (anything else resolves to `system`), and read a `ctxr-theme` query
      parameter, which — when present and valid — overrides the cookie for that response.
- [x] 2.2 `src/core/browse/templates.ts`: `renderShell` accepts the resolved theme and renders it as
      `data-ctxr-theme` on `<html>`.
- [x] 2.3 `templates/serve/shell.html`: `{{THEME}}` slot on `<html>`; header gains light/dark/system
      links built from the current path plus `?ctxr-theme=<mode>`.
- [x] 2.4 `templates/serve/style.css`: key `color-scheme` and the palette custom properties off
      `html[data-ctxr-theme="light"|"dark"]`; scope the existing dark media block to
      `html[data-ctxr-theme="system"]`.
- [x] 2.5 `src/commands/serve.ts`: every shell-rendered route resolves the theme (query parameter, else
      cookie, else `system`), passes it to `renderShell`, and — when a query parameter set it — emits
      `Set-Cookie` for `ctxr_theme` (`Path=/; Max-Age=<1y>; SameSite=Lax; HttpOnly`) plus `Vary: Cookie`
      and `Cache-Control: no-store` on that response. Extend the local `send()` helper to accept extra
      headers rather than adding a second response-writing path.
- [x] 2.6 Verify: `npx vitest run test/unit/browse-preferences.test.ts --exclude '**/.claude/**'` (new
      file: cookie absent/unknown/duplicate/quoted, query parameter present/invalid).

## 3. Navigation show/hide

- [x] 3.1 `templates/serve/shell.html`: visually-hidden `<input type="checkbox" id="ctxr-nav-toggle">`
      first in `<body>`, before `<header>`; header gains its `<label for="ctxr-nav-toggle">` (☰ plus
      visually-hidden "Navigation" text) and a `?ctxr-nav=collapsed|shown` link for the wide-viewport
      case, built the same way as the theme links.
- [x] 3.2 `src/core/browse/templates.ts` / `src/commands/serve.ts`: resolve a `ctxr_nav` cookie the
      same way as the theme cookie (D9), rendered as `data-ctxr-nav="collapsed"` on `<html>` when set.
- [x] 3.3 `templates/serve/style.css`: below `52rem`, `.ctxr-nav` hidden by default and shown by
      `#ctxr-nav-toggle:checked ~ .ctxr-layout .ctxr-nav`, with `grid-template-columns: minmax(0,1fr)`
      re-declared in the hidden state (D10) rather than an `auto` track; at/above `52rem`,
      `html[data-ctxr-nav="collapsed"] .ctxr-nav` hidden; sr-only checkbox via clip-path (not
      `display:none`); `#ctxr-nav-toggle:focus-visible ~ header label[for="ctxr-nav-toggle"]` outline;
      `@media print` hides the nav and both controls.
- [x] 3.4 Verify: `npx vitest run test/unit/browse-nav.test.ts --exclude '**/.claude/**'` — the
      existing no-`<script>`/no-`onclick` assertions (:104-108) still pass.

## 4. Adjacent cheap fix

- [x] 4.1 `src/commands/serve.ts`: move the `/assets/style.css` route ahead of the `buildRouteTable()`
      call at line 93, so a stylesheet request stops paying for a full store read.
- [x] 4.2 Verify: `npx vitest run test/integration/serve-command.test.ts --exclude '**/.claude/**'`.

## 5. Publish scaffold follows the system preference

- [x] 5.1 `src/commands/publish-new.ts`: `pageSkeleton()`'s existing `<style>` block gains a
      `prefers-color-scheme: dark` rule alongside its `@media print` rule.
- [x] 5.2 Verify: `npx vitest run test/unit/publish-new-command.test.ts --exclude '**/.claude/**'`.

## 6. Docs

- [x] 6.1 `README.md:258-266` ("Reading a store in a browser"): mention the theme control and the
      navigation show/hide control.

## 7. Full verification

- [x] 7.1 `npm run typecheck && npm run build`
- [x] 7.2 `npx vitest run test/unit --exclude '**/.claude/**'`
- [x] 7.3 `npx vitest run test/integration --exclude '**/.claude/**'`
- [x] 7.4 `openspec validate serve-page-names-theme-and-nav-toggle --strict && openspec validate --specs`
