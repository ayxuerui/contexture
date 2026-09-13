## Why

`browse-navigation-by-folder` gave the published-pages area a folder tree, and `publish new` gained
multi-segment slugs so an author could fill it. Neither said what the folders *are*. The skill's
step 4 ("Fix the identity once") names only the reserved dated prefix; nothing anywhere states where
a page belongs. So the mechanism exists and goes unused: every page lands at the publish root, and
the published-pages area is a flat list that grows without acquiring any structure.

That flatness is not a cosmetic problem. The notes area beside it is grouped by the store's own
taxonomy, so a reader looking at one sidebar sees a store organized under `projects/`, `areas/`,
`resources/`, `archives/` and a pile of pages organized under nothing. The pages are *drawn from*
those notes — their location is already determined by their subject, and the surface throws it away.

The tree is also unlabelled in a second way. A grouping directory renders its raw path segment, so
the store's declared layer names (`Projects`, `How-to guides`) never reach the reader even though
`contexture.yaml` carries them. A page entry already prefers the name the page declares for itself
over its directory segment; a folder group has no such rule.

## What Changes

- State the filing convention in `templates/skills/ctxr-publish.md` step 4: a page is filed under
  the top-level folder its subject's notes live in, and named by the subject — `projects/acme-launch`,
  not `acme-launch`. When the resolved note set spans more than one top-level folder, or the store
  declares no layers, the agent chooses the grouping folder that best names the subject, records that
  choice and its reason in the page's README, and names it to the operator.
- Add a `page-location` check to `ctxr publish check`: a page whose folder sits directly at the
  configured publish path, inside no grouping directory, is a failing check. It reports shape only —
  *which* folder a page belongs under is judgment the skill carries, not something derivable from the
  file.
- Label a grouping directory in `ctxr serve`'s navigation with the declared name of the taxonomy
  layer whose path it matches, falling back to the raw directory segment. Applies to both the
  published-pages and the notes area, which render through one tree primitive and appear in one
  sidebar.
- Grouping order stays keyed on the directory segment rather than the label, so the new labels
  cannot be read as a reordering.

Not breaking: the check is a new failing check on a command that already reports several, and a page
already filed flat keeps serving at its existing URL. Nothing is renamed or moved.

## Capabilities

### New Capabilities

None. Both halves land on existing capabilities.

### Modified Capabilities

- `publish`: the mechanical page-check requirement gains the page's filing location — a page folder
  directly at the publish path, inside no grouping directory, is a named failing check.
- `context-browsing`: both folder-navigation requirements (notes and published pages) gain a
  grouping-directory label rule — a group whose path matches a configured taxonomy layer's path
  renders that layer's declared name — and an explicit statement that ordering stays keyed on the
  directory segment.

## Non-goals

- **Enforcing the location in `ctxr publish new`.** Refusing a single-segment slug would invalidate
  every page already filed flat, and a slug is the one thing about a page that cannot be corrected
  later — the skill says a rename breaks any link already handed out. A check an author reads after
  scaffolding costs a re-file before the page is shared; a refusal costs a broken URL after.
- **Requiring the Level 1 segment to *be* a configured layer path.** The Zettelkasten profile
  declares zero layers, and a cross-cutting `--entity` subject legitimately belongs under a folder no
  layer names. A check that demanded a layer path would be wrong for both, so the check asserts only
  that a grouping directory exists.
- **Capping the depth at two.** The `publish` spec already blesses a slug of arbitrary depth and
  `context-browsing` already requires grouping to the full depth a path carries; forbidding a third
  level would mean walking both of those back to fix a flatness problem. Two levels is the convention
  the skill states; "not flat" is what the check enforces.
- **A mechanical catch-all folder for cross-cutting pages.** Mirroring the catalog's
  `uncategorized.md` would file exactly the pages that most earn a page over a note — the ones whose
  sources aren't co-located, per skill step 1 — into a bucket naming nothing. A named guess by the
  agent, recorded in the README, is worth more to a reader than a correct-by-construction shrug.
- **Moving or renaming any existing page.** Out of scope here and in any store: the pages on disk
  stay where they are, and the convention governs the next one authored.
- **A new config key.** Level 1 is read from the taxonomy already declared in `contexture.yaml`. No
  key, no default, no schema version bump.

## Impact

Affected code: `src/commands/publish-check.ts` (one new check function), `src/core/browse/tree.ts`
(an optional directory-label callback on `buildPathTree`), `src/core/browse/routes.ts` (a
group-label map on `RouteTable`, built from `store.config.taxonomy.layers`), `src/core/browse/nav.ts`
(render a directory's label when it has one), `templates/skills/ctxr-publish.md` (step 4 prose),
`README.md` (the publish example and the serve paragraph).

`nav.ts` stays taxonomy-agnostic — it receives a resolved path→label map and never sees a layer, so
`src/taxonomy/profiles.ts` remains the only place a shipped layer name appears
(`test/unit/single-source-literals.test.ts`).

Tests: `test/unit/publish-check-command.test.ts`, `test/unit/browse-tree.test.ts`,
`test/unit/browse-nav.test.ts`, `test/unit/skills.test.ts`.

No config key, no schema version bump, no migration. A store on the Zettelkasten profile has an
empty layer set, so its navigation renders exactly as it does today.

Affected stores: the next `ctxr update` rewrites the publish skill, as for any shipped-prose edit. A
store with pages already filed flat sees a new failing check the next time it runs
`ctxr publish check` on one — the page still serves, and re-filing it is the author's call.
