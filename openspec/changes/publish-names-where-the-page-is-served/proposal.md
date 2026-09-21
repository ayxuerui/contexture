## Why

`ctxr publish new` creates a page, `ctxr publish check` gates it, and neither ever names the address
at which a human can look at it. `ctxr serve` has known two addresses for a published page all
along — `/publish/<page path>` from the served root's own checkout, and
`/preview/<worktree directory>/<page path>` from the session worktrees it enumerates — and nothing
in the publish flow says which one applies. So the address gets guessed, and the intuitive guess is
wrong for the case the publish flow actually produces.

Every page contexture's own write path produces is born in a session worktree: that is the rule this
project ships. So at the moment a page exists and most wants looking at, `/publish/` answers `404`,
and only the preview address resolves. Reported from the field: an agent published a page, ran
`ctxr publish check` (all green), and told the operator to open it under the publish route. That
`404`ed until the pull request merged, and recovering the working address meant reading `serve.ts` to
learn both the route and that its first segment is the worktree *directory* name. None of that is in
a command's output, a skill, or a document.

Two consequences worth separating. The wrong address is reported with confidence, because nothing in
the flow is in a position to correct it — nothing in the flow emits an address at all. And the
review a page most needs gets skipped: `ctxr publish check` deliberately answers only what is
derivable from the file, and it says so; everything it excludes — does the form work, does the prose
read, does it render — needs eyes on the page, and the flow makes finding the page a research task.
The preview address is also time-bounded in a way nobody is told, because `ctxr-land` reclaims the
worktree as its last step: the preview address stops serving at the same moment the publish one
starts working.

Every fact the address needs is already in hand. The page path is the command's own argument, and
root resolution already resolves the store root *to* the session worktree when the caller is
standing in one, so the worktree's directory name — the very key the preview route is built from —
is `path.basename` of a value the command already holds.

## What Changes

- `ctxr publish new` and `ctxr publish check` each end by naming the address `ctxr serve` answers
  for the page they name. Inside a session worktree that is the preview address, reported together
  with the address the same page takes once the worktree's work lands; in the store's own checkout
  it is the published-pages address, reported alone, because that address is already the durable
  one. The address names the page's index file, never its directory, because the serving routes
  address files and answer no directory request.
- Both commands carry the same address in `--json`, as one nested `served_at` field whose keys are
  always present: which area serves it, the server-relative route, the absolute URL where one is
  derivable, the worktree keying a preview, and the after-landing address. `ctxr publish check`
  reports no address for a file outside the configured publish path — no route in the store serves
  it — exactly as it reports no filing verdict for such a file.
- `contexture.yaml` gains one opt-in key, `serve.base_url`, naming the base URL at which this
  store's browsing surface is reachable. Declared, it turns every reported route into an absolute,
  clickable URL, preserving any path the base URL itself carries. Absent — the default for every
  store that predates it and every store that never declares it — the server-relative route is
  reported alone and no origin is invented.
- The two route prefixes get one home. They are spelled today in the serve handler and again in the
  navigation builder; this change adds a module that owns them and derives the address, and converts
  both existing callers to it, so naming the address in a third place does not mean spelling the
  route in a third place.
- `templates/skills/ctxr-publish.md` step 6 tells the agent to open the reported address and look at
  the page before handing it on, and states the preview address's lifetime and its successor.
- `README.md`'s preview paragraph currently documents an address shape the server does not answer —
  a page directory with a trailing slash, which `404`s. Corrected to the form that works.

Not breaking: two commands gain one output field and one sentence, every existing field is untouched,
no exit code changes, and no route's response changes. The config key is optional with no shipped
default, so a `contexture.yaml` written before it parses and renders unchanged — no `schema_version`
bump and no migration.

## Capabilities

### New Capabilities

None. The change lands on the existing `publish` capability.

### Modified Capabilities

- `publish`: gains one requirement — that `publish new` and `publish check` name the address their
  page is served at, which area it belongs to, what it becomes after the worktree lands, and when no
  address is reported at all. The subject-resolution, page-identity, and structural-check
  requirements are untouched.

## Non-goals

- **A publish-scoped key for the origin.** The origin serves notes, catalog sections and the graph
  document too; it is not the publish path's property. A `publish.preview_base_url` would need a
  twin the moment anything else names a URL. Argued in design.md D6.
- **A directory-index redirect in `ctxr serve`.** It would make both a page directory and its index
  file resolve, reintroducing two right answers in the one place this change exists to establish
  one. The address reported names a file, and the browsing surface keeps answering files only.
- **A `context-browsing` delta pinning "no directory request is answered".** It is existing,
  tested behavior, and stating it would cost a full restatement of the preview requirement for a
  single scenario. The guarantee this change depends on — that a reported address names the index
  file — is carried by the new `publish` requirement, where it is about the command's output rather
  than about the server.
- **`ctxr serve` reporting the configured base URL in its startup line.** It reports the address it
  bound, which stays true. Making it also report an origin it did not bind is a separate change, and
  it is the one thing that would give `serve.base_url` a second reader.
- **`ctxr publish gather` naming an address.** Gather reports where a page *would* be filed; there
  is no file yet, so there is nothing an address could name.
- **Detecting a running server, its root, or its port.** The reported address assumes the
  arrangement contexture ships and documents — `ctxr serve` run against the store root. Probing for
  a listener, reading a PID file, or adding a flag naming the served root would make the command
  depend on runtime state it has no business knowing. Argued in design.md D7.
- **Any pull-request or forge awareness** to decide whether a page has landed.
  `preview-pages-before-they-land` settled that the filesystem answers better and offline; this
  change consults no commit, push, or review state either.
- **A new output channel for narration.** Rejected in design.md D3 in favour of one line.
- **A `schema_version` bump, a shipped default for the new key, or a migration.** Nothing about a
  store on disk changes, and a store that declares nothing behaves exactly as it does today.

## Impact

Affected code: `src/core/browse/page-url.ts` (new — the route prefixes, the two route builders, and
the address derivation), `src/core/browse/nav.ts` and `src/commands/serve.ts` (adopt them, producing
byte-identical strings), `src/config/schema.ts` and `src/config/defaults.ts` (the opt-in key),
`src/commands/publish-new.ts` and `src/commands/publish-check.ts` (the field and the sentence),
`src/run.ts` (both command descriptions), `templates/skills/ctxr-publish.md`, `README.md`.

Affected stores: additive and invisible to a store that declares nothing. A regenerated
`ctxr-publish` skill gains two paragraphs; `contexture.yaml` is not rewritten, because `init` is its
only writer and there is nothing new to seed.
