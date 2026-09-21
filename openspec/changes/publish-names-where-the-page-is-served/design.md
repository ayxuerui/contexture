## Context

See `proposal.md` — Why. The gap is narrow and the facts are all already present at the moment the
gap opens:

- `src/commands/serve.ts` answers two routes for a published page: `/publish/<page path>` from the
  served root's own publish path, and `/preview/<worktree directory>/<page path>` from
  `buildPreviews` (`src/core/browse/routes.ts`), which walks every directory under the configured
  session worktrees path. Both are exact-key lookups into maps `walkFiles` builds, keyed by file —
  there is no directory index and no path normalization, so an address that does not name a file
  answers `404`.
- `src/core/session.ts`'s `isSessionWorktreePath(config, path)` already answers "is this a session
  worktree?" from the path's own shape, and its doc comment says why it is deliberately independent
  of any store root: *"a caller checking this may itself be running from inside the very worktree in
  question"*. This change is that caller.
- `src/core/root.ts` already resolves the store root **to** the worktree when the caller stands in
  one (`resolve-the-worktree-you-are-in`). So `path.basename(store.root)` is the preview route's
  first segment — the same string `buildPreviews` keys by, because it keys by the directory names it
  enumerated.
- `src/commands/publish-check.ts`'s `checkPageLocation` already decides "is this file under the
  configured publish path?" with a `startsWith(prefix + '/')` test, and already declines to judge a
  file that is not.

So the derivation invents nothing. What this change adds is a place to put it, an optional origin,
and the prose that sends someone to look.

## Goals / Non-Goals

**Goals:**
- End the guessing at the source: the command that made the page names where it is served, so no
  caller has to infer the route from where the file happens to live.
- Make the preview address's lifetime visible at the moment the address is handed over — the
  successor address travels with it rather than being re-derived later.
- Put the two route prefixes in one place while adding a third reader, rather than spelling them a
  third time.
- Keep a store that declares nothing behaving exactly as it does today, byte for byte.

**Non-Goals:** see `proposal.md` — Non-goals.

## Decisions

### D1 — The derivation lives in `src/core/browse/page-url.ts`, not under `src/core/publish/`

Three reasons, in descending force.

The route prefixes already have two call sites and no owner: `src/commands/serve.ts` slices
`'/publish/'` and `'/preview/'` out of the request path, and `src/core/browse/nav.ts` builds both as
template literals. A publish-side module would make three. `test/unit/single-source-literals.test.ts`
exists for exactly this class of duplication, so this change both consolidates the literals and adds
the guard that keeps them consolidated.

The dependency direction is already established in the other direction: `src/core/publish/filing.ts`
imports `PUBLISH_INDEX_FILE` from `../browse/routes.js`. publish → browse is an existing edge;
browse → publish is not, and putting the builder under `publish/` would force `nav.ts` and `serve.ts`
to import from it, opening a back-edge for nothing.

And the URL space is `context-browsing`'s property. `publish` owns what a page *is*;
`context-browsing` owns where it is addressed. Deriving an address inside `core/publish/` would put
one capability's vocabulary inside another's module.

The API:

```ts
export const PUBLISH_ROUTE_PREFIX = '/publish/';
export const PREVIEW_ROUTE_PREFIX = '/preview/';

export function publishRoute(filePath: string): string;
export function previewRoute(worktree: string, filePath: string): string;

export interface ServedAtRoute { route: string; url: string | null }
export interface ServedAt extends ServedAtRoute {
  area: 'preview' | 'publish';
  worktree: string | null;
  after_landing: ServedAtRoute | null;
}

export function pageServedAt(store: Store, storeRelativeFilePath: string): ServedAt | null;
```

### D2 — The argument is a file path, and the "not a page" verdict mirrors `checkPageLocation`

`pageServedAt` takes the store-relative path of a **file**, because that is what both callers hold
and what both routes are keyed by. `publish check`'s `relativePath` already is exactly that string;
`publish new` appends `PUBLISH_INDEX_FILE` to the path it just created, importing the constant
rather than re-spelling `index.html`, the same move `filing.ts` made.

Taking a file rather than a page directory has a second payoff: `publish check` pointed at a
stylesheet or a second HTML file inside a page folder still reports a working address, with no
special case.

The prefix test is the one `checkPageLocation` already applies, and the `null` return is the same
verdict it already reaches for the same input: *a file outside the configured publish path is not a
published page, so it has no filing to judge and no address to report.* The comment in `page-url.ts`
cites `checkPageLocation` by name, so the two cannot drift into disagreeing about what "under the
publish path" means.

The worktree branch is `isSessionWorktreePath(store.config, store.root)` plus
`path.basename(store.root)`. No new enumeration, no git subprocess, and no second definition of what
a worktree is called — `buildPreviews` keys by the directory names it read, and this is one of them.

### D3 — One stdout line; the explanation goes to the skill, not to a new output channel

The issue draws a three-line block. The codebase has emitted exactly one line, always:
`CommandOutcome.humanSummary` is documented as *"One-line human-readable summary"*,
`Reporter.emitResult` writes it with a single trailing newline for every command, and no existing
summary in the repo contains a newline. A script doing `URL=$(ctxr publish new x)` is most likely to
exist on exactly the command that now emits a URL, so a multi-line stdout would be a trap laid in
the one place it gets stepped on.

`notices` is not the channel either: `src/run.ts` routes every notice through `Reporter.warn`, which
prefixes `warning: `. The two existing producers — the release advisory and the filing-move advisory
— are genuinely warnings. An address prefixed `warning:` is this issue inverted: the thing you most
want the operator to act on, dressed as the thing operators are trained to skim.

So one line carries both addresses, and the verb names the area:

```
Created "<page path>". Preview at <address> (at <publish address> once it lands).
Created "<page path>". Served at <address>.
<page path>: all checks passed. Preview at <address> (at <publish address> once it lands).
```

The word `Preview` / `Served` *is* the disambiguation that was missing; it costs no line, and it is
the sentence that stops "isn't it under the preview route?". When the store declares a base URL, the
absolute URL **replaces** the route rather than sitting beside it — two addresses for one page on
one line would be the same guessing surface one level down, and the absolute form contains the route
verbatim, so nothing is lost.

**The steelmanned alternative, and why it loses.** `CommandOutcome` could gain a `remarks?: string[]`
field feeding `Reporter.info`, which already exists, already writes unprefixed to stderr in both
modes, and has never had a caller. Stdout would stay one line and a human would see the issue's full
three-line block, because a terminal interleaves the two streams. It reads better. It loses because
it is a new CLI-contract surface — one every command can then reach for, which is how the `warning:`
prefix stops meaning anything by contrast — bought for a single sentence whose real home is the
skill. This project's own rule puts prose that ships to a store in `templates/`, and the lifetime of
a preview address is a thing to be taught once, not narrated on every invocation. If a second
command ever needs unprefixed narration, `remarks` is the right change to make then, on its own
merits, with `cli-contract` stating what separates narration from a warning.

### D4 — `--json` carries one nested, always-present, nullable `served_at`

```json
"served_at": {
  "area": "preview",
  "route": "/preview/session-20260920-180253-d97aa6/ctx-a/board/index.html",
  "url": "https://ctx.example.com/preview/session-20260920-180253-d97aa6/ctx-a/board/index.html",
  "worktree": "session-20260920-180253-d97aa6",
  "after_landing": {
    "route": "/publish/ctx-a/board/index.html",
    "url": "https://ctx.example.com/publish/ctx-a/board/index.html"
  }
}
```

Every sub-answer, stated.

`url` is `null` when no base URL is declared — **null, never absent**. The envelope's stability
scenario promises *"the fields it depends on are still present with the same meaning"*, and
absent-versus-null is the distinction a naive parser trips on, while `served_at.url == null` is a
check every language writes correctly. Same reasoning for `worktree` and `after_landing` under the
publish area: `after_landing: null` reads correctly, because a page in the store's own checkout has
no later address — it is already at it.

`served_at` is `null` as a whole when the file is outside the configured publish path. Only
`publish check` can produce that; `publish new` builds its path from the configured publish path by
construction.

Nesting rather than flat keys (`preview_route`, `publish_route`, `preview_url`, …) is the whole
point: flat keys put "which one applies?" back into the consumer's head, which is the defect this
change exists to fix. `area` is the discriminant that makes the answer unguessable.

Additive-only within `envelope_version: 1` is satisfied — two commands gain one field, nothing is
renamed or removed — and future growth lands inside `served_at` rather than widening `data`. The one
real risk is `area` as a closed set: a consumer switching on it must tolerate a value it does not
know, which is why the requirement says the field names which of the store's serving routes applies
rather than enumerating them forever.

Naming: `served_at` over `preview` (wrong for a page in the store's own checkout — and mislabelling
is what caused this issue), over `url` (which it is not, when no base URL is declared), over `view`
(ambiguous with a data view).

### D5 — The address always names the index file, which makes one README line a bug fix

`serve.ts`'s two handlers are exact-key map lookups with no directory-index fallback and no path
normalization, so a page directory — with or without a trailing slash — answers `404`. Every address
this change reports therefore ends in a filename.

`README.md` currently documents the preview address as a page directory with a trailing slash. That
form does not work. It is corrected here rather than in a separate pass, because this change is what
makes the working form load-bearing: an operator will now compare the README against a string a
command printed, and exactly one of them can be right.

### D6 — `serve.base_url`: one opt-in key, no shipped default, block declared optional

```ts
const ServeSchema = z.object({
  base_url: z.string().min(1).refine(isAbsoluteHttpBase, { ... }).optional(),
});
// on StoreConfigSchema:
  serve: ServeSchema.optional(),
```

**Why it is a config key and not a flag.** The origin at which a store's pages are published is a
durable fact about that store — stable across invocations, unknowable to the tool, and known to
nobody but the store. The alternative is `--base-url` on every publish command, which relocates the
guessing into the agent's argv, which is the defect.

**Why `serve.*` does not violate the decision that rejected `serve.port`.**
`2026-09-02-local-browsing-surface` D6 rejected a `serve.port` key on the premise that *"every
existing tool-owned config key names a path — where something tool-owned lives inside the store."*
That premise was already false when it was written: `catalog.section_max_bytes` and
`write_lifecycle.diff_size_ceiling_lines` both landed on 2026-08-29, four days before `ctxr serve`
existed, and `update_check.enabled`, `organize.rollup_stale_days` and `retrieval.gather_max_notes`
have landed since. Strip the false premise and D6's real test remains, and it is a good one: *an
invocation-time choice with no meaningful default belonging to this store does not go in the config.*
A port fails that test. An origin passes it outright. This change therefore **narrows** D6 rather
than overturning it — a port and a bind address stay flags, because they are chosen per invocation;
an origin is a store fact — and `preview-pages-before-they-land`'s non-goal citing D6 is narrowed
with it.

**The argument against this key's home, recorded.** `serve` is the one block that would be named for
a command that does not read it: `publish new` and `publish check` do. `browse.base_url` would name
the capability that owns the URL space, the way `catalog`, `ingest`, `organize`, `publish` and
`harness` each name theirs. It loses on point-of-use: an operator asking "where is my store served?"
looks for the command they type, and `ctxr browse` does not exist. The key acquires a second reader
the day `ctxr serve` reports it in its own startup line, and that is the change that would be right
to revisit this in.

**Why the value is a base URL and not a host name.** A bare host forces the tool to guess `http`
versus `https`, and cannot express a port (`http://box.lan:8080`) or a reverse-proxy subpath
(`https://example.com/ctx/`) — a store behind a front end usually has both. Validation is
`new URL()` plus a scheme check and a refusal of query and fragment, applied at config load, so a
typo fails loudly where every other malformed key does rather than at the point of use.

**Why the join is string concatenation and not `new URL(route, base)`.**
`new URL('/publish/x', 'https://example.com/ctx/')` silently discards `/ctx` — a store served under
a subpath would get a wrong URL with no error. The base's trailing slashes are stripped and the
route, which always begins with `/`, is appended.

### D7 — No shipped default, and the block itself is `.optional()`

The key carries no default because contexture cannot know a store's origin, and because its absence
is itself meaningful: not declaring it says this store publishes at no fixed address. That is the
case the existing `context-store` requirement *"Configuration keys that cannot carry a shipped
default do not get one"* covers in its second paragraph, so **this change needs no `context-store`
delta**. The implementation precedent is `organize.mission_path` — `.optional()`, no
`SHIPPED_DEFAULTS` entry — **not** `publish.path`, which does carry a default and is safe for an old
config by a different mechanism (its parent block is prefaulted).

The non-obvious half is that the *block* must be `.optional()` rather than `.prefault({})` like
every other block. `withoutShippedDefaults` keeps any key absent from `SHIPPED_DEFAULTS`
unconditionally, so a prefaulted block would resolve to `serve: {}` for every store and `ctxr init`
would start writing an empty `serve:` block into every new `contexture.yaml` — the opposite of the
requirement that a written configuration records only the store's own decisions. Declared optional,
an absent block stays absent through parse → render → reparse, and every `StoreConfig` object
literal in the codebase and the test suite compiles untouched. The rejected alternative — adding
`serve: {}` to `SHIPPED_DEFAULTS` so the recursion drops it — works, but it puts an entry into an
object whose own contract is that a key appears there only when its correct value depends on
nothing, which would be a lie told to a renderer for a formatting outcome.

### D8 — The reported address assumes `ctxr serve` runs against the store root

A store root that is itself a session worktree has two defensible answers: the preview route, if the
server runs against the parent store, and the publish route, if someone ran `ctxr serve` from inside
the worktree — which `context-browsing` already requires to serve that worktree's pages under the
publish route. The command cannot tell which, because it cannot see a server process.

It reports the preview route, because that is the arrangement contexture ships, documents and
creates: `ctxr serve` against the store root, worktrees ephemeral beneath it. Explicitly not
mitigated by probing for a listening port, reading a PID file, or adding a flag naming the served
root — all three make a page-creating command depend on runtime state it has no business knowing,
and all three would be wrong as often as the assumption they replace.

## Risks / Trade-offs

- **A declared base URL may name a deployment serving a different checkout.** A store published at a
  stable hostname typically serves a clone that fast-forwards on merge; joining that origin to a
  preview route yields a confident, clickable, `404`ing URL, and absoluteness reads as authority.
  Mitigated in three layers: the key is opt-in, so no store acquires the risk without declaring it;
  the reported line names the after-landing address beside it, so the second address is visible when
  the first fails; and the skill tells the agent to open the address before reporting it, which
  turns a silent `404` into a caught one at the cheapest moment. Residual and accepted: a store
  declaring an origin that serves a checkout with no worktrees will emit unreachable preview URLs.
  The README's opt-in line says the key names the origin serving *this* store, not a mirror of it.
- **The preview address has a short, non-obvious lifetime** — `ctxr-land` reclaims the worktree as
  its last step. That is precisely why `after_landing` exists and why the human line carries both
  addresses: the successor is handed over at the same moment as the current one, so nobody has to
  re-derive it later.
- **Serving from inside the worktree makes the reported route wrong** — D8, accepted with the
  assumption stated rather than papered over.
- **Three exact `toEqual` assertions on command data break the moment the field lands.** Known and
  sequenced. That is what those assertions are for: exact-match data assertions are how this repo
  notices an envelope field appearing, and loosening them to `toMatchObject` to avoid the churn
  would remove the notice.
- **A malformed `serve.base_url` now fails the whole config load**, so a typo in an opt-in key
  breaks every command in the store rather than only the publish ones. Accepted: it is the fail-loud
  contract every other configuration value already gets, the message names the key, and the
  alternative — silently ignoring an unparseable origin — would emit a route while the operator
  believes they configured a URL.
