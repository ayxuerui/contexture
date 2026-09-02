## Why

`ctxr serve` renders one page of flat lists and nothing else. Its index emits three `<ul>`s of full
store-relative paths in the order Notes → Catalog → Graph → Published pages, and the only navigation
on every other route is a single back-to-home link in the page shell. Both halves fail at the scale a
real store reaches: an index of a few hundred notes is a wall of paths with the vault's directory
structure flattened out of it, and once a reader follows a link into a note, the structure they were
reading by is gone from the page entirely — there is no way to move sideways, only back.

The published-pages half is flattened twice over. The server already walks the publish tree
recursively, but the index collapses every file to its first path segment, so a page nested under a
directory is unreachable from the index. Nothing creates that nesting anyway: `ctxr publish new
<slug>` only ever makes a folder directly under the configured publish path, so a store whose notes
live under a deep taxonomy has a publish path that is one flat heap regardless of how its notes are
organized.

`context-browsing`'s current spec says nothing about the index, the page shell, or navigation — those
exist only in code. This change specifies that surface for the first time and makes it folder-shaped:
one navigation region present on every page, one fixed section order, notes and published pages
presented as trees mirroring the directories they actually live in, and `publish new` able to create a
page at a path the author chooses to mirror where its subject sits in the store.

## What Changes

- Add a persistent **navigation region** to the served page shell, rendered on every HTML route,
  listing the four content areas in the order **published pages → notes → catalog → graph**.
- Present **notes** as a folder tree nested to the full depth their store-relative paths carry,
  replacing the flat sorted list of paths, and collapsible without any client-side script.
- Present **published pages** as a folder tree over their real nesting under the configured publish
  path. A published page becomes **a directory containing an index page**, at whatever depth it sits,
  rather than "an immediate child of the publish path."
- Reorder the index page's content sections to match the navigation's order.
- Let **`ctxr publish new`** accept a multi-segment slug so that nesting can be created at all, with
  the reserved dated-snapshot rule bound to the page's own final segment and every segment refused if
  it would resolve outside the configured publish path.

## Non-goals

- **Search over the browsing surface.** `context-retrieval` holds that content matching is the
  agent's own leg rather than a CLI command; a search box here would be that command, wearing a
  different hat. A navigation tree is structure, which this capability already owns.
- **Any client-side JavaScript.** The served surface ships none today, and a reading tool that a
  browser with scripting disabled cannot navigate is a worse reading tool. HTML's own disclosure
  element collapses a tree with no script runtime at all, so adding one would buy nothing while
  widening what a server bound beyond loopback with `--host` exposes.
- **Any link from a published page back to its source notes.** Placing a page under a directory stays
  the author's decision, expressed in the slug. Deriving the directory from a source note would need a
  page→note relation `publish` deliberately does not have — its own check requires that a page's
  README declare neither the visibility field nor a `kind` field, precisely because a published page is
  never a note.
- **Caching the route table.** The tree is a derived view recomputed per request over the enumeration
  the server already performs. The never-cached route table is what makes a path outside every
  configured location absent by construction rather than rejected by a check that could be forgotten
  on one route; a cached tree would put a second, staler answer next to it.
- **New routes for the content areas.** No `/notes` or `/publish` section-index pages: the navigation
  is the index, and every existing route keeps its current URL and status codes.
- **Per-requester filtering.** Unchanged and still absent whatever the bind address, exactly as this
  capability's purpose states. Making the store easier to navigate does not change who may see it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `context-browsing`: gains requirements for the navigation region every served page carries, and for
  presenting notes and published pages by their folder structure rather than as flat lists — the
  index/shell surface the capability has never specified.
- `publish`: a living page's slug may name a multi-segment path under the configured publish path, so
  a page can be placed in a directory structure at all; the reserved dated-snapshot rule binds the
  page's own final segment, and a slug that would resolve outside the publish path is refused.

## Impact

Affected code: a new path-tree module and a new navigation-rendering module under `src/core/browse/`;
`src/core/browse/routes.ts`'s published-page enumeration (first-segment slugs become index-page-bearing
directories); `src/core/browse/templates.ts` and `templates/serve/shell.html` gain a navigation slot;
`templates/serve/style.css` gains a two-column layout over the custom properties it already declares;
`src/commands/serve.ts` loses its private index renderer to the new module and passes navigation on
every HTML route; `src/commands/publish-new.ts` gains multi-segment slug validation. `titleFor()` in
`src/core/catalog/model.ts` becomes exported so the tree and the catalog agree on what a note is
called. No new runtime dependency.

Affected stores: additive. No config key, schema version, or on-disk layout changes; a store with a
flat publish path renders exactly as it does today. Every existing served URL keeps its path and status
code, and `ctxr publish new` keeps accepting every slug it accepts now.

Depends on nothing unmerged.
