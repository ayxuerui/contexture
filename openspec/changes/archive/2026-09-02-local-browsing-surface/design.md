## Context

See `proposal.md` — Why. Three prior changes each produce readable content with no reader: derived
artifacts (`ctxr-derived-artifacts` skill: catalog sections, the graph document, generated AGENTS.md
sections), published pages (`publish-artifact-skill`: self-contained HTML under `publish.path`), and
notes themselves, which carry wikilinks (`context-retrieval`) that only `ctxr graph build`'s own
resolution understands today.

Existing mechanisms this builds directly on:
- `src/core/notes/list.ts`'s `listNotes()` / `excludedPrefixesFor()` — the store's one enumeration of
  what counts as a note, already excluding every tool-owned path (skills, guidance, catalog, publish,
  session worktrees). The route table reuses this rather than re-deriving what's addressable.
- `src/core/graph/model.ts`'s `buildGraphFromNotes()` and its internal stem index — the existing,
  tested resolution of `[[Target]]` to a note path, including its `not_found` / `ambiguous` handling.
- `src/core/catalog/model.ts`'s `catalogSectionsFor()` / `sectionFileName()` and
  `src/core/graph/persist.ts`'s `graphDocumentPath()` — the existing derived-artifact locations.
- `src/commands/publish-check.ts`'s structural checks — evidence that a published page is meant to be
  self-contained (no external references) and is therefore safe to serve byte-verbatim with no
  transformation.
- `src/bin.ts` — already `process.exitCode = ...` with no `process.exit()` call, so a command that
  keeps a listener open needs no change to how the process ends.

## Goals / Non-Goals

**Goals:**
- Make every already-computed readable thing (notes, catalog, graph document, published pages)
  reachable and cross-linked in a browser, reusing existing enumeration and resolution rather than
  parallel-implementing "what is a note" or "what does this link resolve to" a second time.
- Keep the security posture honest and narrow: loopback-only, read-only, no requester concept. State
  plainly what this does NOT provide (a networked, permission-scoped view) rather than implying it by
  omission.
- Treat published pages as already-finished artifacts: serve them verbatim, never re-render or
  re-style them — `publish check`'s structural checks are the only gate they need.

**Non-Goals:** see `proposal.md` — Non-goals (no per-requester filtering, no write surface, no search,
no live reload, no MCP, no shipped skill).

## Decisions

**D1 — Loopback-only is the mechanism, not a documented convention.** The `listen()` call uses a fixed
`127.0.0.1` host; there is no `--host` flag and no config key to widen it. `openspec/config.yaml`'s own
spec-authoring rule says an enforcement claim must name its mechanism and must not rely on an agent (or
operator) following an instruction — "binds only to loopback" is a fact a test can assert by attempting
a connection from a non-loopback-bound socket, where "please don't expose this" would not be. Rejected
alternative: a `--host` flag defaulting to loopback. Rejected because the moment the flag exists, the
non-goal ("no per-requester filtering") becomes silently reachable by anyone who passes `--host 0.0.0.0`
without contexture ever deciding who's allowed to hit that port — exactly the posture the proposal
says this change is not taking.

**D2 — The notes route is keyed by `listNotes()`'s result, not by a filesystem read.** A request for
`/notes/<path>` is only served if `<path>` appears in the current `listNotes()` enumeration; there is no
separate check that reject a request for `/notes/../../contexture.yaml` after the fact, because that
path was never in the route table to begin with. This is why `context-browsing`'s spec doesn't need
its own path-traversal requirement — it inherits `excludedPrefixesFor()`'s exclusions for free, and
they can't drift, because a second implementation was never written.

**D3 — Wikilinks resolve through the graph model's stem index, not a new resolver.**
`buildGraphFromNotes()` already builds a `Map<string, string[]>` from filename stem to full paths and
already classifies a link as `not_found` or `ambiguous` when it can't resolve to exactly one note. The
render step reuses that same classification: a resolved link becomes an `<a href="/notes/<path>">`, an
unresolved or ambiguous one becomes a `<span class="ctxr-broken-link" title="...">` naming the reason —
so a note that reads fine in the browser view is, by construction, a note `ctxr graph build` also
resolves cleanly, and the two never disagree about what a link means. Rejected alternative: a fresh
regex-based resolver in the render module. Rejected because it would need to re-encode the ambiguous-
stem rule (`context-retrieval`'s own scenario: "two same-named notes are a valid, expected state") a
second time, with no test forcing the two implementations to agree.

**D4 — `markdown-it` as the fifth runtime dependency.** contexture ships four runtime dependencies
(`commander`, `yaml`, `zod`, `@inquirer/prompts`) and, across three prior artifact-producing changes,
zero markdown renderers — `publish-artifact-skill` deliberately shipped no renderer for *authored HTML
pages*, but that decision was about not prescribing visual craft for a hand-built page, not about
whether contexture should ever render a `.md` file, which this change now needs to do for the first
time. Markdown's long tail (tables, footnotes, nested lists, raw HTML blocks, fenced code) is real and
not worth hand-rolling for a reading tool whose whole point is faithfully showing what's in a note.
`markdown-it` is small, has no further runtime dependencies of its own, and exposes an inline-rule
plugin API that the wikilink resolution in D3 attaches to directly, rather than needing a
render-then-postprocess pass over the output HTML. Rejected alternative: render markdown client-side
with a bundled browser script. Rejected per D7 below and because it produces an unusable-without-
JavaScript page for a plain reading tool.

**D5 — The command emits its envelope once, then blocks; this is now a documented `cli-contract` case,
not an exception to it.** `runCommand()` in `src/run.ts` already calls `reporter.emitResult()` exactly
once per invocation and returns the resulting `ExitCode`; `serve`'s `execute()` starts the HTTP
listener, waits for it to report a bound address, and returns a normal `CommandOutcome` with
`data: { url, port, root }` the moment that happens — no change to `runCommand()`'s shape. What changes
is that the *process* does not exit afterward: `src/bin.ts` sets `process.exitCode` and returns, and
with an open server handle, Node's event loop keeps running rather than exiting, exactly like any other
long-lived Node HTTP server. `cli-contract`'s `--json` requirement is currently phrased as though every
command exits promptly after its one JSON value; this leaves that requirement's actual claim (one JSON
value on stdout, human narration only on stderr) fully intact and just makes room for "before serving"
as a legitimate qualifier to "on completion." Every request `serve` handles afterward logs to stderr,
never stdout — `stdout` after the envelope is emitted stays silent for the lifetime of the process, so
a script that parses `serve --json`'s stdout as one JSON document is never handed a second value.

**D6 — `--port`, not a config key; no config key at all.** `--port <n>` defaults to `0` (OS-assigned),
which is also what makes the command trivially testable — an integration test never has to guess or
reserve a fixed port. Rejected alternative: `serve.port` in `contexture.yaml`, matching the shape every
other tool-owned setting uses. Rejected because every existing tool-owned config key names a *path* —
where something tool-owned lives inside the store — and a port number isn't a location inside the
store; it's an invocation-time choice with no meaningful "default that belongs to this store" the way
`catalog.path` or `publish.path` do. A store that never runs `serve` gains nothing to carry either way.

**D7 — The page shell and stylesheet live in `templates/serve/`, loaded outside `packagedTemplate()`.**
`openspec/config.yaml`'s naming section and this project's own `naming-prefers-point-of-use-clarity`
practice aside, the harder constraint is mechanical: `packagedTemplate()` (`src/core/templates.ts`)
only ever loads `<dir>/<name>.md` and unconditionally strips exactly one trailing newline — a contract
tuned for markdown fragments spliced into other markdown via `substituteBlock()`. `shell.html` and
`style.css` are neither markdown nor fragments meant for splicing; forcing them through that loader
would mean either renaming them to `.md` (misrepresenting their content) or changing
`packagedTemplate()`'s file-extension assumption for every existing caller. `src/core/hooks.ts` already
sets this precedent for exactly this reason — its `.sh` templates need their trailing newline preserved
and are loaded by their own small async reader, not `packagedTemplate()`. `templates/serve/` follows
the same pattern: shipped prose (here, markup and CSS) lives under `templates/`, per the project's
existing rule, loaded by a reader whose contract actually matches the file type.

## Risks / Trade-offs

- **A loopback-only server with no requester concept can't be handed to a colleague as-is.** →
  Accepted deliberately; that's exactly the capability `context-projection` is meant to unlock later,
  and building a shadow version of it here under `context-browsing`'s name would leave two places
  deciding "who sees what" that could drift. The proposal names this explicitly rather than silently
  under-delivering against "serving," full stop.
- **A new runtime dependency, breaking a four-dependency streak three prior changes maintained.** →
  Mitigated by picking one with zero transitive runtime dependencies of its own and an established
  security/maintenance track record, and by confining its use to one render module
  (`src/core/browse/render.ts`) rather than letting markdown parsing calls spread through the codebase.
- **Serving stale content if a derived artifact hasn't been rebuilt.** → Mitigated by requirement 6
  (a not-yet-built artifact renders a page naming the exact command that builds it, not a bare 404),
  matching `context-retrieval`'s existing "report, don't silently degrade" posture for a dangling link.
- **Reusing `buildGraphFromNotes()` for link resolution means every page render re-derives the stem
  index from the current `listNotes()` result, rather than reading the persisted `graph.json`.** →
  Deliberate: `graph.json` can be stale relative to the working tree the moment a note is edited, and a
  browsing tool whose whole purpose is "show me what's actually in the store right now" must not read a
  build artifact that could disagree with the files on disk. The cost is recomputing a stem index per
  request, which is small at the scale a personal reading tool serves.

## Migration Plan

Additive; no existing command, config key, or schema version changes. A store gains the ability to run
`ctxr serve`, and nothing else changes for a store that never does. No migration, no schema version
bump, no new config field for `init` to write.
