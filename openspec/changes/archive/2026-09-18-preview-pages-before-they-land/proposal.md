## Why

Every write in contexture lands through a session worktree and a reviewed PR — `openspec/config.yaml`
states it outright: "nothing commits to the default branch, every write lands via a session worktree and
a reviewed PR." Published pages follow that path like everything else. `ctxr publish new` scaffolds a
page inside a session worktree, `ctxr publish check` gates it there, and it reaches the store root's
`.contexture/publish/` only once the PR merges.

`ctxr serve` cannot show you that page. `buildRouteTable()` (`src/core/browse/routes.ts:181`) walks
exactly one directory for pages — `path.join(store.root, store.config.publish.path)` — and
`session.worktrees_path` is an explicit entry in `excludedPrefixesFor()` (`src/core/notes/list.ts:61`),
so worktree content is kept out of the browsing surface by construction. The result: the one moment you
most want to look at a page in a browser — while you are still deciding whether it is any good — is the
one moment the tool that renders pages in a browser cannot reach it.

This is a discovery and simultaneity gap rather than a capability gap, and the proposal should be honest
about that. `cd .worktrees/<session> && ctxr serve --port <n>` already works today: `resolveExistingRoot`
walks up from the cwd, finds the worktree's own `contexture.yaml`, and serves it. But that workaround
requires knowing the worktree exists and what it is called, costs a second server on a second port, and
gives no way to see a draft beside the landed pages it is meant to sit among. Nothing surfaces an
in-flight page to someone who has forgotten they left one in flight.

## What Changes

- `ctxr serve` gains a preview route. Published pages held in the store's session worktrees are
  addressable at `/preview/<worktree-directory>/<page path>/index.html`, alongside the landed pages
  already served at `/publish/<page path>/index.html`, from the same server on the same port.
- Preview responses are byte-verbatim, exactly as the publish route already serves a landed page — no
  shell, no navigation region, no theme. A preview that is not byte-identical to what will be served
  once the page lands is not a preview.
- Session worktrees are discovered by enumerating the directories under the store's configured
  `session.worktrees_path`. This is a filesystem read and nothing more: no `git` subprocess enters the
  per-request path, which today contains none. A worktree directory holding no published page
  contributes nothing.
- The navigation grows a fifth area, `Preview`, rendered second — directly beneath `Published pages`,
  because it holds the same kind of thing in a different state. Within it, pages group first by the
  worktree holding them and then by their folders, through the same `buildPathTree` primitive and the
  same declared-name and taxonomy-layer labelling rules the published-pages area already uses.
- Nothing else in a session worktree becomes reachable. The note enumeration keeps excluding worktrees,
  so worktree notes, catalog sections, graph documents, and `contexture.yaml` stay `404` — the preview
  route widens what is addressable to published pages only.

## Non-goals

- **Any pull-request or forge awareness.** `src/adapters/types.ts:1-9` records that the `forge` adapter
  kind was removed and `AdapterKind` narrowed to `'harness-generation'`; `gh` now lives in skill
  markdown (`templates/skills/ctxr-submit.md`, `ctxr-land.md`), never in TypeScript. Reading the
  worktree's filesystem happens to answer the question better than a forge call would: a page with no
  commit yet, a page committed but unpushed, and a page under review on an open PR are all simply files
  on disk, and all three preview identically with no network call and no `gh` dependency. Reintroducing
  forge access under `src/` would reverse `session-keeps-only-what-git-cannot-do` and needs its own
  change arguing that.
- **Previewing notes, catalog sections, or the graph document from a worktree.** Published pages only.
  A page is a self-contained artifact whose whole purpose is to be looked at in a browser; a note in a
  worktree is work in progress whose reader is an agent, and exposing it would mean unpicking the note
  enumeration's worktree exclusion, which several other requirements rest on.
- **Any `serve.*` configuration key.** `local-browsing-surface` D6 settled that every config key names a
  path inside the store. The path this change needs is already configured, as `session.worktrees_path`,
  and is read from there rather than restated.
- **Discovering worktrees through `git worktree list`.** See design D1 — it would put a subprocess on
  every HTTP request where serve currently has none.
- **Caching the route table to absorb the extra directory read.** Per-request rebuild from the store's
  own enumeration is `local-browsing-surface` D2 and this change does not revisit it. The added cost is
  one `readdir` of the worktrees path plus, per worktree that has pages, the same bounded page walk the
  publish area already performs.
- **Wrapping preview pages in the shell to give them navigation.** Ruled out for landed pages by the
  existing byte-verbatim requirement, and ruled out here for the stronger reason that it would make the
  preview differ from the thing being previewed.
- **Reporting discovered sessions in the `serve` envelope.** The envelope is emitted exactly once, when
  the listener binds; worktrees are created and removed while the server runs. A list that is correct
  for one instant and stale thereafter is worse than no list — the navigation, rebuilt per request, is
  where this belongs.
- **Removing or replacing the `cd .worktrees/<session> && ctxr serve` workaround.** It keeps working
  unchanged, and remains the right tool when you want a worktree served in isolation on its own port.

## Capabilities

### Modified Capabilities

- `context-browsing`: adds a requirement that published pages held in a session worktree are addressable
  under a preview route, byte-verbatim and independent of commit, push, or review state; adds a
  requirement that previewable pages are navigable grouped by worktree and then by folder, with the same
  labelling rules the published-pages area uses; restates the navigation-order requirement to name five
  content areas rather than four.

## Impact

Affected code: `src/core/session.ts` (an enumerator for the directories under the configured worktrees
path), `src/core/browse/routes.ts` (`RouteTable` gains preview file and title maps, built by reusing
`walkFiles`, `pagesFromPublishFiles`, and `resolvePublishTitles` unchanged), `src/core/browse/nav.ts`
(`AREAS`, `AREA_TITLES`, and `AREA_ANCHORS` gain the preview area; its listing renders through the
existing `buildPathTree`/`renderTree` pair), `src/commands/serve.ts` (the `/preview/` route, mirroring
the `/publish/` branch), `README.md`.

Affected stores: additive, and invisible to a store that has no session worktree open. No configuration
key, no schema version change, no change to any existing route's response. A store with worktrees open
gains navigation entries it did not have; nothing it could already reach moves or changes.
