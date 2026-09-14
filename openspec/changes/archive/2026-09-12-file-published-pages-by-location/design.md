## Context

See proposal.md — Why. The mechanisms this change needs already exist and are load-bearing:

- `buildPathTree` (`src/core/browse/tree.ts`) is the one grouping primitive both the notes and the
  published-pages areas render through — `browse-navigation-by-folder` D2 made that deliberate, so
  the two areas cannot disagree about the shape of the store.
- `RouteTable` (`src/core/browse/routes.ts`) is built fresh per request from the store's own
  enumeration and already carries one resolved-label map, `publishTitles`, so the nav can label a
  page by its declared name without reading files itself.
- `nav.ts` holds no knowledge of the taxonomy, and `src/taxonomy/profiles.ts` is the only file in
  `src/` where a shipped layer name may appear — enforced by
  `test/unit/single-source-literals.test.ts`.
- `publish check` already reports a list of independently-named failures in one run and already
  receives the `Store`, so `publish.path` and `taxonomy.layers` are both in hand.

The constraint that shapes everything below: a spec requirement may not rest on an agent following
an instruction (project rule; see the specs artifact's rules). "File the page under its subject's
folder" is a judgment, so it cannot be a requirement — but "the page is filed under *something*" is
a property of the path, so it can.

## Goals / Non-Goals

**Goals:**

- Split the convention cleanly: judgment in skill prose, shape in a check, labels in the nav.
- Add the grouping-label rule without touching the tree primitive's ordering or `renderNav`'s
  signature, and without `nav.ts` learning what a taxonomy is.
- Leave every existing page serving at its existing URL.

**Non-Goals (design-level, beyond the proposal's):**

- No new module. Every change lands in a file that already owns the concern.
- No caching of the layer-label map. `buildRouteTable` is deliberately uncached
  (`local-browsing-surface` D2); a four-entry map built per request is not the thing to make an
  exception for.

## Decisions

### D1 — The convention lives in the skill; the check tests shape only

`ctxr publish check` gains one check, `page-location`, that fires when the page folder is an
immediate child of the configured publish path. It never asserts *which* folder a page belongs
under.

Rationale: which folder is correct depends on where the subject's notes live and, when they live in
several places, on a reading of the subject — neither derivable from the `index.html` being checked.
The command's stated contract is that it answers "only what's derivable from the file itself" (see
its header comment and skill step 6); a check that guessed the right parent would break that and
would be wrong for a cross-cutting page.

Alternative considered: have the check resolve the page's README source-note wikilinks and compare
their top-level folders against the page's parent. Rejected — it makes the mechanical checker depend
on link resolution and on the README's prose being complete, and it would fail a correct
cross-cutting page. The README is where the author *records* the choice, not where the checker
audits it.

### D2 — The check asserts a minimum, not the convention

`page-location` fires on depth 0 (flat at the publish root) and on nothing else. A page two, three,
or four directories deep passes.

Rationale: the `publish` spec already blesses a slug of arbitrary depth and `context-browsing`
already requires grouping to the full depth a path carries. Enforcing exactly two levels would mean
walking both of those back in order to fix a flatness problem — a much larger change, in exchange
for refusing paths nobody has complained about. Two levels is what the skill *states*; "not flat" is
what the check *enforces*. Tightening later is a comparison change in one function.

### D3 — `publish check`, not `publish new`

Rationale: a slug is the one thing about a page that cannot be corrected afterwards — the skill says
a rename breaks any link already handed out. Refusing a single-segment slug at scaffold time would
also invalidate every page already filed flat, which is all of them. A check the author reads after
scaffolding costs a directory move before the page is shared; a refusal costs a broken URL after.

### D4 — The cross-cutting Level 1 is the agent's named guess, recorded in the README

When the resolved note set spans more than one top-level folder, or the store declares no layers,
the skill directs the agent to choose the grouping folder that best names the subject, write that
choice and its reason into the page's README, and name it to the operator.

Alternatives considered:

- **A `uncategorized/` catch-all**, mirroring the catalog's always-last catch-all section
  (`catalogSectionsFor`). Rejected: the pages whose sources aren't co-located are exactly the ones
  skill step 1 says most earn a page over a note. Filing them under a word that names nothing is the
  worst outcome for the reader the page exists for.
- **Plurality of the resolved set** — file under whichever top-level folder holds most of the source
  notes. Rejected: correct-by-construction and arbitrary in the only cases it applies to. A named
  guess a reader can evaluate beats a derived answer nobody can.

### D5 — `nav.ts` receives a resolved path→label map, never the taxonomy

`RouteTable` gains `groupLabels: ReadonlyMap<string, string>`, populated in `buildRouteTable` from
`store.config.taxonomy.layers` (each layer's `path`, trailing `/` stripped → its `name`). `nav.ts`
looks a directory path up in it and knows nothing else.

Rationale: this is the same shape `publishTitles` already has, for the same reason — the nav renders
labels and resolves none. It also keeps `nav.ts` clear of `profiles.ts`'s single-source rule by
construction rather than by care, and `renderNav(table)` / `renderIndexBody(table)` keep their
signatures, so nothing about the shell or the index page changes.

### D6 — Match the group's full path within its tree, not its first segment

A group is relabelled when its full `/`-separated path within its own tree equals a configured layer
path. For notes that path is store-relative, so only a real layer matches. For published pages it is
relative to the publish root, so a Level 1 folder named for a layer matches and a nested
`something/ctx-a` does not.

Rationale: relabelling should happen exactly where a folder *stands for* the layer. A directory
named `ctx-a` three levels down inside another page group is a coincidence of naming, and rendering
the layer's display name there would tell the reader something untrue about the store's structure.

### D7 — Labelling changes what a group is called, never where it sits

`TreeDirectory` gains an optional `label`; `compareNodes` is untouched and keeps ordering on `name`.
`renderTree` renders `node.label ?? node.name`.

Rationale: `tree.ts`'s ordering is documented as "a regrouping of a sorted enumeration rather than a
reordering of it" — the tree's order is the enumeration's order. Sorting on a label would make the
sidebar's order depend on operator-authored display strings, and would diverge from the page-entry
rule beside it, which already sorts on the path segment and not on the declared `<title>`. The
`context-browsing` delta states this explicitly so it cannot be read as an oversight later.

### D8 — The label rule covers notes as well as published pages

Both areas get the rule, stated in both requirements.

Rationale: they render through one primitive and appear in one sidebar. Applying it to published
pages alone would show the same folder as `Projects` in one area and `projects` in the other, two
inches apart. Scoping it to one area is the more surprising outcome, not the smaller one.

## Risks / Trade-offs

- **A store whose pages are all filed flat starts failing a check that used to pass** → The failure
  is advisory in effect: the page keeps serving at its URL, `serve` and the route table are
  untouched, and re-filing is a directory move. `publish check` is run deliberately by an author on
  one page, not by a hook or by `doctor`, so nothing fails in CI or on commit as a result.
- **The repo's own passing-page test fixture files its page at the publish root, so it will newly
  fail** → Named as a task: the fixture moves under a grouping directory, and a new case asserts the
  flat page fails. Worth noticing rather than papering over — the fixture was demonstrating exactly
  the shape this change discourages.
- **A layer's declared name is operator-authored text now rendered in the sidebar** → It is escaped
  on the way out by the same `escapeHtml` every other label already goes through. It is deliberately
  not length-capped the way a page `<title>` is: a title is read off disk from a file the checker
  only bounds, whereas a layer name is a value the operator typed into their own
  `contexture.yaml` and expects to see back verbatim.
- **The two-level convention will be honoured unevenly across a store's history** → Accepted. The
  tree handles mixed depth already, and the alternative — moving existing pages — breaks links. A
  store converges as pages are authored, not by a sweep.

## Migration Plan

None. No config key, no default, no schema version bump: Level 1 is read from the taxonomy already
declared in `contexture.yaml`, and a store that declares no layers gets an empty label map and a
navigation identical to today's.

The next `ctxr update` re-renders `ctxr-publish` in existing stores, as for any shipped-prose edit.
Rollback is a revert: the check disappears, the labels fall back to directory segments, and pages
filed under grouping directories keep serving where they are.
