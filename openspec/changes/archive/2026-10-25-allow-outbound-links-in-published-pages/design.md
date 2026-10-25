## Context

`checkNoExternalReferences` is one regular expression over the whole file:
`/(?:src|href)\s*=\s*["']https?:\/\/[^"']*["']/i`. It cannot tell an element that loads its `href`
(`<link>`) from one that only navigates to it (`<a>`), and it never looks at CSS, so an external
`@import` or `url()` passes.

## Goals / Non-Goals

**Goals:**
- Pass a page whose only external addresses are links a reader follows.
- Keep failing every page that loads a resource from an external address through its markup or CSS.

**Non-Goals:**
- An HTML or CSS parser. The other checks in this command read the markup with regular expressions,
  and this one stays in that style.

## Decisions

### D1. Decide by what the attribute does, not by whether it holds an address

The check walks every start tag and reads its attributes. An external value fails when:
- the attribute is `src`, `srcset` (any candidate in the list), `poster` or `data`; or
- the attribute is `href`, or ends in `:href` (`xlink:href`), and the element is not `a` or `area`.

`<a>` and `<area>` are the HTML elements whose `href` is navigation and nothing else. Every other
`href` either loads what it names (`<link>`, SVG `<use>` and `<image>`) or changes how the page
resolves addresses (`<base>`), so it keeps failing. The rule is a short allow-list rather than a list
of loading elements. An element missed from it fails, which errs toward the check's purpose.

Attribute values may be double-quoted, single-quoted or unquoted. The old expression missed unquoted
values; the new reading catches them.

**The case for keeping the blanket rule:** it is one line, and it has no allow-list to get wrong. A
page meant to stand alone, printed or opened offline, also has no use for a link it cannot follow, so
failing outbound links could be read as part of the same promise. And an `<a>` is not harmless in
every respect: following it leaves the store, and a reader may not see that coming.

**Why it does not hold:** the promise the spec states is that a page *loads* nothing from outside.
The scenario says so in those words. A link loads nothing until a reader acts. Leaving the store is
something the reader chooses, and the browser shows the address before they do. The blanket rule's
real cost is that authors work around it, and each workaround is worse than the link: unclickable
text, or a known failure that hides a real one, or a script that hides the link from the check. A
check that the right page cannot pass gets ignored. What would flip this: a store requirement that
published pages never point outside it at all. That would be a separate check with its own name, not
a reading of this one.

### D2. CSS `url()` and `@import` join the check

Both load a resource as surely as `<link href>`, and the old check missed both. The check matches an
external address in `url(…)` (quoted or not) and in `@import "…"` / `@import url(…)` anywhere in the
file, which covers `<style>` blocks and `style` attributes.

**The case against:** it widens what fails. A page that passed yesterday with an external web font
in its CSS fails after the update, and the issue only asked to narrow the check.

**Why it is in:** such a page already breaks the spec's rule, which is about loading, and the issue
names both as gaps. Narrowing the check for links while leaving these open would make it a sharper
tool that still misses half of what it is for. The failure message names the matched text, so the
author sees exactly what to inline.

The scan runs over the whole file, as the old one did. A page that shows an external `url(…)` as
text, in a code sample, fails too. That case is rare and the old check had the same false positive
for attributes; escaping the parenthesis as `&#40;` passes it.

### D3. One failure, naming the first match

The check keeps reporting at most one `no-external-references` failure, with the matched text. The
author fixes it and runs again. Listing every match is a separate improvement nobody has asked for.

## Risks / Trade-offs

- [A page with an external CSS font or background passed before and fails now] → the message names
  the match; the spec's rule already forbade it.
- [An `href` on an element the allow-list does not name, which only navigates] → it fails, as it did
  before. Add the element to the list when a real page needs it.
