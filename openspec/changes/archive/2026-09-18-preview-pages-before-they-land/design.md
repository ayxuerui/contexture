## Context

See proposal.md — Why. Almost everything this change needs already exists:

- `walkFiles`, `pagesFromPublishFiles`, and `resolvePublishTitles` (`src/core/browse/routes.ts`) already
  turn "a directory that might hold pages" into a file map, a page list, and a title map. They take a
  root as an argument and hold no assumption that the root is the store's own publish path. Pointing
  them at a worktree's publish path requires no change to any of them.
- `PUBLISH_INDEX_FILE` (`src/core/browse/routes.ts:62`) is this codebase's single answer to "what is a
  published page". A preview must not re-spell `'index.html'`, or the two areas could disagree about
  what they are each looking at.
- `buildPathTree` and `renderTree` (`src/core/browse/tree.ts`, `nav.ts`) already render a labelled,
  script-free, arbitrarily deep folder tree from a list of `/`-joined paths. A session segment prepended
  to a page path is just a deeper path, so worktree grouping falls out of the existing primitive rather
  than needing a second one.
- `isSessionWorktreePath` (`src/core/session.ts:37`) already settled how a session worktree is
  recognised, and its comment records why: the branch may be renamed by `ctxr-submit` before it reaches
  the forge, so the durable identity is the worktree's *path shape*, deliberately independent of git.

The constraint that shapes this change: the browsing surface currently performs zero subprocess work per
request, and `buildRouteTable`'s contract (`routes.ts:174-180`) is that it is "built fresh from the
store's own enumeration on every call, never cached". Both properties must survive.

## Goals / Non-Goals

**Goals:**

- Make an in-flight page readable in a browser without knowing a worktree's name or starting a second
  server.
- Keep a preview byte-identical to what the publish route will serve once the page lands.
- Keep the per-request cost a filesystem read, with no subprocess and no cache.

**Non-Goals:** see proposal.md — Non-goals. In particular this change adds no forge awareness, exposes
nothing but published pages, and introduces no configuration key.

## Decisions

### D1 — Worktrees are found by scanning the configured path, not by asking git

Discovery is a `readdir` of `path.join(store.root, store.config.session.worktrees_path)`, taking the
directories it returns. ENOENT yields an empty list, exactly as the publish walk already handles a store
with no publish directory.

The alternative is real and deserves the argument: `listWorktrees()` (`src/core/git/worktree.ts:97`)
exists, is already used by `session list`, and is strictly better informed. It finds a worktree created
anywhere on disk, not only under the configured path. It reports each worktree's actual branch, so a
group could be labelled `session/20260918-143022-a1b2c3` — or, after `ctxr-submit` renames it, whatever
the PR is actually called, which is the name a reviewer would recognise. `session list` accepts a branch
that is *either* prefixed *or* path-shaped precisely so a renamed session stays visible, and a preview
area that silently disagreed with `session list` about which sessions exist would be a genuine wart.

It loses on cost, and the cost lands in the worst place. `buildRouteTable()` runs on every HTTP request,
and serve spawns no subprocess today; `listWorktrees` would put a `git worktree list --porcelain` fork
behind every page view, every stylesheet miss, every favicon probe a browser makes. Caching the result
would dodge the fork but break the per-request freshness contract in D2 of `local-browsing-surface` — a
session started after the server booted would stay invisible until restart, which is exactly the
discovery failure this change exists to fix.

The path scan also has the better claim to correctness, not merely the cheaper one. `worktreePathFor()`
(`src/core/session.ts:49`) puts every session the CLI creates under the configured path, and
`isSessionWorktreePath` already declares that path shape *is* the identity. Scanning the path is the
same rule the codebase already committed to, applied without asking a subprocess to restate it.

What this gives up, stated plainly: a worktree created by hand outside the configured path is not
previewable. That is a worse trade than it sounds only if such worktrees are common — and the CLI never
makes one. If it becomes a real complaint, D1 is reversible behind the same enumerator seam.

### D2 — The worktree's directory name is both the URL segment and the label

`/preview/session-20260918-143022-a1b2c3/ctx-a/my-page/index.html`, labelled in the navigation with that
same string.

The alternative is to label with the branch name, which reads better and is what a reviewer sees on the
PR. Getting it without git means hand-parsing `<worktree>/.git` for its `gitdir:` pointer and then
reading `HEAD` out of the directory it names — reimplementing a piece of git's storage layout in order
to avoid calling git, which is the worst of both options. Getting it with git reopens D1.

The directory name costs little. `worktreeDirNameFor()` (`src/core/session.ts:45`) derives it from the
branch by replacing `/` with `-`, so `session/20260918-143022-a1b2c3` becomes
`session-20260918-143022-a1b2c3` — legible, sortable by creation time for the same reason the branch is,
filesystem-safe by construction, and stable across a branch rename, which the branch name is not. It
also needs no escaping to be a URL segment.

### D3 — The area is always on, not behind a flag

The flag deserves its hearing. `serve`'s contract has been "one store root, enumerated and served" since
`local-browsing-surface`, and the enumeration excludes the worktrees path on purpose. Reading below that
path is a real widening of what one command touches, and an operator who has widened the bind address
with `--host` now has a preview of unreviewed drafts reachable from wherever they bound — a `--preview`
flag would make that an explicit, deliberate act rather than a default they inherited.

It is rejected because the problem is discovery. A flag you must already know to pass cannot tell you
about a worktree you have forgotten. Someone who knows enough to type `--preview` knows enough to type
`cd .worktrees/<name> && ctxr serve`, so the flag would add a second way to do what the workaround
already does while leaving the actual gap exactly where it was.

The security framing does not survive contact either. These are the store owner's own drafts, in the
store owner's own repository, on a server the capability's own spec says performs no requester filtering
at any bind address. A draft page is not more sensitive than the notes it was built from, which serve
has always shown.

### D4 — An empty preview area is still named

The existing navigation requirement already states that a content area holding nothing is still named
and reported empty, rather than omitted. The preview area follows it rather than carving an exception.

The case against: a store whose owner never opens a session sees a permanently empty area advertising a
concept they do not use. The case for wins on two counts. Every write in this project goes through a
session worktree, so "never opens a session" describes a reader, not a writer. And an area that appears
and disappears depending on state is a navigation that changes shape under you — the failure mode is a
reader who saw `Preview` once, cannot find it now, and cannot tell whether their page vanished or the
area did.

### D5 — A folder is called the same thing in both page areas

Prepending the worktree segment makes a page filed under `ctx-a` key as `<worktree>/ctx-a`, which misses
the `groupLabels` lookup — `buildRouteTable` keys that map by store-relative layer path (`routes.ts:195`).
So the leading worktree segment is stripped before the layer lookup, and only for that lookup.

This is `file-published-pages-by-location` D8 applied unchanged: both trees resolve a group's label the
same way "because they render through one primitive into one sidebar — a folder reading `Ctx A` in one
area and `ctx-a` in the other, inches apart, is the surprising outcome rather than the smaller one".
The worktree segment itself matches no layer path and keeps its own name, which is what D2 wants anyway.

### D6 — Byte-verbatim, including the one thing that breaks

A preview response is the file, unchanged — same treatment, same `contentTypeFor` guess, same exact-key
map lookup as `/publish/`. The map miss is the whole traversal guard, as `routes.ts:25` already records:
a path that would escape a worktree's publish path is absent from the map by construction, so the
lookup fails before any read is attempted. No second check to forget on one route and not the other.

The known break: a page whose internal links are root-absolute (`href="/publish/foo/style.css"`) resolves
them against the publish route and breaks under the preview prefix. It is not worth fixing. `publish
check` already forbids external references and pages are authored self-contained, so relative links —
what the scaffold produces and what real pages use — work identically under either prefix. Rewriting
bodies to patch the remainder would break byte-verbatim serving, which is the property that makes a
preview trustworthy in the first place. A page that only works at one URL prefix reveals that fact
during preview, which is a feature.

## Risks / Trade-offs

- **Per-request cost grows with open worktrees.** Each worktree with pages adds a recursive walk of its
  publish path plus a bounded 4 KiB read per page, the same work the publish area already does once.
  Mitigation: sessions are few and short-lived by design, a worktree with no pages costs one `readdir`
  and stops, and the cost is the same order as the existing per-request note enumeration, which already
  reads and parses every note's frontmatter.
- **A stale worktree clutters the navigation.** A session abandoned without `git worktree remove` keeps
  showing its pages. Mitigation: it is visible rather than hidden, which is closer to a prompt to clean
  up than to a defect; `session list` has the same property today.
- **Two pages with the same path, one landed and one in flight, appear twice.** Intended — seeing the
  draft beside the landed version is the point — but the two entries may carry the same declared title
  and be told apart only by which area they sit in. Mitigation: the areas are adjacent and separately
  headed, and the URL prefix differs.
- **D1's blind spot is silent.** A hand-made worktree outside the configured path simply does not
  appear, with nothing explaining why. Accepted: the CLI never creates one, and the enumerator is a
  single seam to revisit if that changes.
