## Context

See `proposal.md` — Why. `local-browsing-surface` built the serving mechanism (route table, renderer,
shell, publish passthrough) and specified its security posture, its method allowlist, its link
resolution, and its build hints — but specified nothing about what the reader sees when they arrive.
The index page and the shell's single back-to-home link were written straight into
`src/commands/serve.ts` and `templates/serve/shell.html` and have never been described by a
requirement. This change specifies that surface and reshapes it around the directory structure the
store already has.

Existing mechanisms this builds directly on:
- `src/core/browse/routes.ts`'s `buildRouteTable()` — already returns notes keyed by store-relative
  path and publish files keyed by URL-relative path under the publish route, rebuilt fresh per
  request. Both keys are `/`-separated relative strings, so a folder tree is derivable from what the
  table already holds, with no new enumeration and no data-model change.
- `src/core/notes/list.ts`'s `listNotes()` / `excludedPrefixesFor()` — the one enumeration of what
  counts as a note. Keying the notes tree off the same map the note route is keyed off is what makes
  "the tree can never offer a link the note route would 404" true by construction rather than by a
  second exclusion check.
- `src/core/catalog/model.ts`'s `titleFor()` — frontmatter `title`, else the filename stem. Already
  the store's answer to "what is this note called," currently private to the catalog builder.
- `src/core/browse/templates.ts`'s `renderShell()` — the single point every HTML route already passes
  through, which is why the navigation can be made unskippable rather than repeated per handler.
- `src/commands/publish-new.ts`'s `RESERVED_SLUG_PATTERN` and `PublishSlugExistsError` — the existing
  identity rules a multi-segment slug has to keep satisfying.

## Goals / Non-Goals

**Goals:**
- Make the store's own directory structure the shape of the browsing surface, for both notes and
  published pages, without introducing a second source of truth for what exists.
- Give every served page the same navigation, produced in one place, so a reader who follows a link
  is never stranded.
- Keep the surface renderable and navigable with no client-side script, and keep the route table's
  never-cached, absent-by-construction property intact.
- Make the index rendering unit-testable, which it is not today.

**Non-Goals:** see `proposal.md` — Non-goals (no search, no client-side script, no page→note linkage,
no route-table caching, no new routes, no per-requester filtering).

## Decisions

**D1 — The navigation is a third shell slot, not markup each route prepends.**
`templates/serve/shell.html` gains a `{{NAV}}` slot beside `{{TITLE}}` and `{{BODY}}`, and
`renderShell()` takes the navigation HTML as a third argument, so a route cannot render an HTML
response without it — the requirement "every served page carries the same navigation" is then a
property of the single function every HTML route already calls, not a convention four call sites
have to remember. Rejected alternative: prepending the navigation to each route's `bodyHtml` at the
call site. Rejected because there are four such call sites that would drift independently, which is
exactly how today's "only the index has any navigation" state came about in the first place.

**D2 — One path-tree primitive serves both notes and published pages.** `Note.path` and
`PublishFileRoute.urlPath` are both `/`-separated relative strings, so a single module builds a
nested node structure from a list of paths plus per-leaf label and href mappers, and both areas
render through it. Rejected alternative: a grouper written separately for each area. Rejected because
folder collapsing has exactly one set of edge cases — a leaf at the root, a directory sharing a name
with a leaf, a directory whose only content is another directory — and writing them twice means
fixing them twice, with no test forcing the two to agree.

**D3 — Collapsing is `<details>`/`<summary>`, and there is no script.** This keeps the served surface
scriptless, which is both a property worth preserving on a server that can be bound beyond loopback
and the only way the tree stays usable in a browser with scripting disabled. Top-level groups render
expanded and deeper ones render collapsed, so a deep store opens at a readable size without any state
to persist. Rejected alternative: a JavaScript tree widget with remembered expansion state. Rejected
because it would make the reading tool depend on a script runtime to show a list of files, and
persisting expansion state needs storage the server deliberately does not have.

**D4 — A published page is a directory containing an index page.** The index-page enumeration replaces
"the distinct first path segment of every publish file" with "every directory in the publish route
that holds an index page," so a page at any depth is a page and a directory that merely contains other
pages is a grouping node. The flat case is unchanged: a page directly under the publish path is still
a directory holding an index page, so a store that never nests renders exactly as it does today.
Rejected alternative: keeping first-segment slugs and rendering nesting only below them. Rejected
because it leaves the nested case unrepresentable in the very structure the change exists to
represent — a nested page would be listed under its top-level ancestor's name, linking to an index
page that ancestor may not even have.

**D5 — A multi-segment slug is validated segment by segment, and the dated-snapshot rule binds the
final segment.** `RESERVED_SLUG_PATTERN` currently tests the whole slug string, so once a slug may
contain `/`, a page named with a reserved dated prefix inside a directory would slip past the rule
that exists to keep a living page's name from colliding with a frozen snapshot's. The check moves to
the final segment, which is the page's own identity; a date-prefixed *directory* is a legitimate way
to file pages by period and is not the thing the rule protects. Independently, every segment is
refused if it is empty, `.`, `..`, or absolute, so a slug can never resolve outside the configured
publish path. Note that `publish new` performs no segment validation at all today — it joins the slug
onto the publish path directly — so this closes an existing escape as a side effect rather than
guarding against one the feature introduces. Rejected alternative: refusing any slug containing `/`
and adding a separate `--under <dir>` option. Rejected because it splits one identity — the page's
path under the publish route — across two arguments that can disagree, and the error message for a
traversal attempt would then have to name which of the two was at fault.

**D6 — Tree labels reuse `titleFor()`.** Exporting the existing helper from
`src/core/catalog/model.ts` means the navigation and the catalog give a note the same name. Rejected
alternative: labelling leaves with the bare filename stem in the navigation. Rejected because a store
that sets frontmatter titles would then have two contradictory answers to "what is this note called,"
one in the catalog and one in the sidebar, with nothing keeping them aligned.

**D7 — The index page keeps all four content areas, in the navigation's order.** On the index this
repeats what the sidebar already shows. That redundancy is accepted deliberately: the request was for
both a menu and content in that order, a landing page that restates its own index is an ordinary shape
for a documentation site, and the two are rendered from the same tree data so they cannot disagree.
Rejected alternative: reducing the index to counts and letting the sidebar be the only listing.
Rejected because it answers only half the request, and it makes the index the one page in the whole
surface with no content of its own.

## Risks / Trade-offs

- **Rendering the full tree into every page grows every response by the size of the store.** →
  Accepted for the scale this tool serves — a personal store's tree is kilobytes of markup, and the
  server already re-enumerates every note and re-derives the wikilink stem index on every request, so
  the tree is not the dominant cost. If it ever becomes one, the fix is a per-request memo inside a
  single request's handling, not a cache that outlives it.
- **Deep or wide stores can still produce an unwieldy sidebar.** → Mitigated by D3's collapsed-by-
  default rule below the top level, so what renders expanded is bounded by the store's top-level
  directory count rather than its note count. Filtering the tree is search, which is a stated
  non-goal.
- **`publish new` accepting `/` in a slug widens what that argument can name.** → Mitigated by D5's
  per-segment validation, which is strictly more validation than the command performs today, and by
  requiring the refusal to be a non-zero exit that writes nothing rather than a normalization that
  silently relocates the page.
- **The navigation makes the whole store's shape visible on every page, including from a session
  bound beyond loopback with `--host`.** → No change in exposure: every note was already individually
  addressable and already enumerated on the index page, which any requester who can reach the bound
  address could already fetch. This capability still applies no per-requester filtering, and the
  proposal restates that rather than letting a nicer surface imply otherwise.

## Migration Plan

Additive. No config key, schema version, or on-disk layout changes; no store needs to move anything.
Every served URL keeps its path, content type, and status code, and every slug `ctxr publish new`
accepts today is still accepted with identical results. A store with a flat publish path and no
subdirectories under it renders the same content it renders now, reordered and with navigation added.
