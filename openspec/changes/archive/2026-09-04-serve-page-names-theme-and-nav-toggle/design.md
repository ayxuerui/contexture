## Context

See `proposal.md` — Why. Three files carry the current behavior this design changes:
`src/core/browse/nav.ts` (`renderAreaContent`'s publish branch labels pages with `lastSegment`, its
notes branch labels notes with `titleFor`), `src/commands/serve.ts` (routes, per-request
`buildRouteTable()`, response headers), and `templates/serve/{shell.html,style.css}` (the shell markup
and the six-custom-property palette). `RouteTable` (`src/core/browse/routes.ts`) is rebuilt fresh on
every request, by design — `local-browsing-surface` design.md D2 — and this design does not revisit
that. Serve output is presently 100% scriptless; the `context-browsing` spec has a scenario
("Groups collapse without client-side script") and two tests
(`test/unit/browse-nav.test.ts:104-108`, `test/integration/serve-command.test.ts:64`) that depend on
that staying true.

## Goals / Non-Goals

**Goals:** a published page's nav label and index entry match the name its author gave it; a note's
shell `<title>` matches its nav label; a reader can force light or dark or leave it to the OS, and the
choice survives navigating to another page; the navigation can be shown and hidden by one control that
behaves correctly at both a phone width and a desktop width; none of the above introduces
client-side script or reaches into a published page's own bytes.

**Non-Goals:** see `proposal.md` — Non-goals. Additionally, design-level: no attempt to make the
checkbox-based disclosure and the cookie-based collapse a single mechanism (D9) — they solve different
problems and forcing one mechanism to do both produces a control that is wrong at one width.

## Decisions

**D1 — A published page's name is the `<title>` its own `index.html` declares.** Extends D6 from
`browse-navigation-by-folder` design.md ("one answer to what a thing is called") to pages. Fallback
when the title is absent, empty, or unreadable is the folder segment — today's behavior, so no page
ever loses its label. Rejected: a `title:` key in the page README (a new frontmatter key
`openspec/config.yaml`'s rules would want named in exactly one place, for no gain over a string the
page already carries in its own `<title>`); the README's `# ` heading (the H1 and the `<title>` could
then disagree about the same page, reintroducing exactly the defect this closes).

**D2 — `ctxr publish check` gains a non-empty-`<title>` invariant.** Today `<title>` is unguaranteed:
the checklist covers external references, viewport meta, the print rule, provenance, the sibling
README, and script syntax, and says nothing about titles. Deriving a nav label from an unchecked field
would just relocate the defect. The check sits beside the existing `checkViewportMeta` pattern —
a regex test against the page's HTML, added to the fixed list `execute()` runs.

**D3 — Names resolve during `buildRouteTable()`, not inside the nav renderer.** `RouteTable` gains
`publishTitles: ReadonlyMap<string, string>`, populated once per request alongside `publishFiles`.
`renderAreaContent` / `renderNav` / `renderIndexBody` (`src/core/browse/nav.ts`) stay synchronous and
pure, reading the map instead of computing anything. Rejected: reading each page's `index.html` inside
the nav renderer, which would make both exported render functions async — cascading into every
`renderShell` call site in `src/commands/serve.ts` and forcing a rewrite of the synchronous `RouteTable`
literals every fixture in `test/unit/browse-nav.test.ts` builds by hand.

**D4 — The name is read from a bounded prefix of the file, not the whole thing.** Read the first 4 KiB
of each page's `index.html`, matched with `/<title[^>]*>([\s\S]*?)<\/title>/i` (a page's title is
always in its `<head>`, well within that bound), whitespace-collapsed, length-capped, and treated as
absent when empty after trimming or when the prefix truncates mid-tag. Slice the read as a `Buffer`
before decoding to UTF-8 — a byte-bounded read can otherwise split a multibyte character mid-sequence.
The extracted string is HTML source and must be entity-decoded (`&amp; &lt; &gt; &quot; &#39;`, plus
numeric entities) before it reaches `escapeHtml` on render, or `<title>A &amp; B</title>` would render
as `A &amp;amp; B`. Cost: immaterial — `buildRouteTable()` already calls `listNotes()`, which reads and
parses every note in the store in full on every request; P bounded 4 KiB reads, where P is the page
count and typically P ≪ N (note count), do not change the order of that cost. Rejected: an HTML-parser
dependency (no other part of this codebase takes one); caching titles across requests (contradicts
`local-browsing-surface` D2's "never cached").

**D5 — The note shell title keeps the path as a disambiguator.** `${titleFor(note)} — ${note.path}`,
not `titleFor(note)` alone. `titleFor` falls back to the filename stem when a note has no frontmatter
title, so two `example.md` notes in different folders would otherwise render identical browser tab
titles and identical history entries.

**D6 — Theme selection is a query parameter on the current URL, handled inline, not a dedicated
route.** `<a href="?ctxr-theme=dark">`; request dispatch in `handleRequest` already keys on `pathname`
alone (`serve.ts:85`), so the parameter is invisible to routing and every existing route keeps working
unmodified. Whichever route matched sets the cookie and renders that same response in the chosen
theme — one `200`, no `Location` header, no new route in the table. Rejected: a `GET /theme/<mode>
?return=<path>` route that 303-redirects back. On a server `--host` may have widened beyond loopback
(a documented, spec-sanctioned choice), an unvalidated `return` value is a textbook open redirect
(`//evil.example`, `/\evil.example`, an absolute URL all work as a `Location` target), and a raw
`\r\n` in the value would make Node's `res.writeHead` throw on the crafted request. Not having the
route avoids validating it.

**D7 — Cookie values are allowlisted on read, never trusted on write.** Accepted values:
`light`, `dark`, `system`; anything else — absent, malformed, an old or foreign value — resolves to
`system`. The raw cookie value is never interpolated into the `data-ctxr-theme` attribute; only one of
the three literal strings is. `Set-Cookie` carries `Path=/; Max-Age=<one year>; SameSite=Lax;
HttpOnly` — no `Secure`, since the server speaks plain HTTP by default; `HttpOnly` is free here because
nothing in this surface reads cookies from script. Shell HTML responses (not `/publish/*`, not
`/assets/style.css`) gain `Vary: Cookie` and `Cache-Control: no-store`: today no response header beyond
`Content-Type`/`Content-Length` is set, and the reverse-proxy deployment this capability already
anticipates (`context-browsing`'s loopback-widening requirement) could otherwise cache a light response
and serve it to a dark-cookied requester.

**D8 — `color-scheme` is keyed off the theme attribute; the `prefers-color-scheme` block is scoped to
`system`, not left unscoped.** `style.css:2` currently sets `color-scheme: light dark` unconditionally,
so forcing light on a dark-defaulting OS would still leave the browser painting dark scrollbars and
form controls over an otherwise-light page. Each mode declares its own `color-scheme` value (`light` /
`dark` / `light dark`). The existing dark-palette block becomes
`@media (prefers-color-scheme: dark) { html[data-ctxr-theme="system"] { ... } }` rather than
`@media (prefers-color-scheme: dark) { :root { ... } }` — at that specificity
(`html[data-ctxr-theme=...]` is 0,1,1) the three modes are mutually exclusive by selector rather than
by one rule accidentally outranking another. No flash of the wrong theme: the theme attribute is
rendered into the very first bytes of the HTML response by `renderShell`, and the stylesheet request
that follows is render-blocking.

**D9 — Below the responsive breakpoint the toggle is a checkbox disclosure; at or above it, it is a
cookie-backed link.** A checkbox's state does not survive navigation — every link click reloads with
it unchecked. That is the correct behavior for a phone drawer (it should close once you tap a link
inside it) and the wrong behavior for a desktop collapse (it would silently un-collapse on the very
next click, making "collapse the sidebar" not actually work). Both live in the same header slot behind
one ☰-style control; CSS shows exactly one per breakpoint, matching the existing `52rem` breakpoint at
`style.css:58`. Rejected: one checkbox meaning opposite things at each breakpoint (desktop collapse
never persists past one click, and rotating a phone from portrait to landscape mid-session silently
hides an open nav because `:checked` now falls on the other side of the breakpoint); one cookie-backed
control at every width (a phone nav would stay open after every navigation, reproducing the original
complaint).

**D10 — Hiding the nav re-declares the grid template; it does not rely on an `auto` track sized
around a hidden sibling.** Setting only `.ctxr-nav { display: none }` under a wider
`grid-template-columns: auto minmax(0,1fr)` removes the nav from grid layout entirely, so
auto-placement puts `<main>` in the first (`auto`) track and the second track sits empty — the
sidebar's space does not collapse, it goes unused on the wrong side. The hidden state instead
re-declares `grid-template-columns: minmax(0, 1fr)`, the same one-column fallback the existing
`@media (max-width: 52rem)` block already uses.

**D11 — `ctxr publish new`'s scaffold follows the system preference; it receives no theme control of
its own.** A published page is a self-contained static artifact with no server behind it once it's
served — it can declare `prefers-color-scheme` support in its own inline `<style>` block, exactly as
`pageSkeleton()` already declares `@media print`, but it cannot participate in a cookie a server reads.
Rejected: injecting the serve stylesheet or the theme attribute into published-page responses, which
`context-browsing`'s byte-verbatim requirement forecloses without a separate proposal.

**D12 — Accessibility of the scriptless disclosure is handled explicitly, not left to default markup.**
The checkbox is visually hidden via `position: absolute; width: 1px; height: 1px; overflow: hidden;
clip-path: inset(50%); white-space: nowrap` — never `display: none` or `visibility: hidden`, either of
which would remove it from the tab order and make the navigation unreachable by keyboard. It is the
first element in `<body>`, before `<header>`, so a `~` general-sibling selector can style the visible
`<label>` on `:checked` (a later sibling cannot select an earlier one) and forward
`:focus-visible` from the hidden input to the visible label. The label's content is
`<span aria-hidden="true">☰</span><span class="ctxr-visually-hidden">Navigation</span>` — an
`aria-label` on a `<label>` element does not become its associated input's accessible name, so visible
text hidden off-screen is what a screen reader actually announces.

## Risks / Trade-offs

- **A cross-site `<img src="http://127.0.0.1:<port>/?ctxr-theme=dark">` can flip a reader's stored
  theme.** → Accepted: cosmetic only, on a local, single-owner reading surface that this capability
  already documents as applying no per-requester filtering or authentication at any bind address;
  nothing about store content is reachable this way.
- **Two markup elements (checkbox + link) implement one conceptual "toggle the nav" control.** →
  Accepted: the alternative — one mechanism for both breakpoints — is a control that is silently wrong
  at one of them (D9).
- **Reading a bounded prefix of every published page's `index.html` on every request adds I/O.** →
  Mitigated by the 4 KiB bound (D4) on a request path that already reads and parses every note in the
  store in full.
- **No scriptless checkbox can expose `aria-expanded`; a screen reader announces "checkbox, not
  checked" rather than a disclosure control.** → Accepted: `<details>`/`<summary>` is the only markup
  with free, correct disclosure semantics — and the codebase already uses it for folder groups
  (`nav.ts:55`) — but forcing it open at wide viewports and closed at narrow ones depends on
  engine-specific styling of the details slot rather than a plain CSS property. Mitigated by visible
  (if off-screen) label text and forwarded focus, per D12.

## Migration Plan

Additive. No config key, no schema version change, no migration. A store with no published-page
`<title>` values renders identically to today. A browser with no `ctxr_theme` or `ctxr_nav` cookie set
renders identically to today (system palette, sidebar shown at wide viewports, hidden at narrow ones).
