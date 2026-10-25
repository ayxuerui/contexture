## Why

`ctxr publish check` fails any page that links out to another site (issue #216). Its
`no-external-references` check matches every `src` or `href` attribute whose value starts with
`http://` or `https://`, so a plain `<a href="https://…">` fails beside a `<script src="https://…">`.
The check exists so that a page loads nothing from outside, as the publish spec's scenario says. An
outbound link loads nothing: it is an address the reader may choose to follow.

A page whose job is to point readers elsewhere, such as a list of resources, cannot pass today. Its
author must show addresses as unclickable text, ship with a known failure that would hide a real one
beside it, or hide the link from the check with a script, which defeats the check. Seen on 2026-10-25
on a store's public page with two outbound links, at 0.33.0.

## What Changes

- `no-external-references` fails on what a page **loads** from an external address, not on every
  external address it contains:
  - still fails an external `src`, `srcset`, `poster` or `data` value, on any element;
  - still fails an external `href` on any element other than `<a>` and `<area>`: `<link>`, `<base>`,
    SVG `<use>` and `<image>` (`href` or `xlink:href`), and so on;
  - newly fails an external `url(…)` or `@import` in CSS, whether in a `<style>` block or a `style`
    attribute. Both load a resource, and neither was checked before;
  - allows an external `href` on `<a>` and `<area>`.
- The publish spec's requirement text says the same, with scenarios for each case.
- The publish skill's list of what the check covers says "nothing loaded from an external address".

## Non-goals

- **Addresses inside inline scripts.** A `fetch("https://…")` in a `<script>` block was never caught
  and still is not. Telling a request from a string in JavaScript needs a parser, and the check stays
  a reading of the markup.
- **Protocol-relative addresses** (`//cdn.example.com/x.js`). Not caught today either; left for its
  own change if it turns up in a real page.
- **The server's own shell.** `context-browsing`'s rule that `ctxr serve` emits no external `src` or
  `href` governs the server's markup, not authored pages, and is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `publish`: the structural-invariants requirement narrows the external-reference clause to what a
  page loads, and adds CSS `url()` and `@import`.

## Impact

- **Code:** `checkNoExternalReferences` in `src/commands/publish-check.ts`.
- **Templates:** one line in `templates/skills/ctxr-publish.md`.
- **Tests:** `test/unit/publish-check-command.test.ts` gains the new scenarios; the existing external
  `<script src>` test passes unchanged.
- **Stores:** a page with outbound links that failed before now passes. A page with an external CSS
  `url()` or `@import`, which passed before, now fails. Such a page already broke the spec's intent.
