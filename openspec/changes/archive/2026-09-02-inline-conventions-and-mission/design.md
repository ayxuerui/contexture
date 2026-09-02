## Context

`src/core/agents-doc.ts` (180 lines) is the whole `AGENTS.md` renderer: five fenced sections, each a
`render*Section` (pure, config → `string[]`) paired with a `build*Section` (async, writes via
`upsertFencedRegionInFile`). Prose lives in `templates/agents/<fence-slug>.md`
(`src/core/templates.ts`'s `packagedTemplate` + `substituteBlock`); only per-store data is computed and
spliced in. `scanDocsDir` (`src/core/conventions.ts:411-443`) is the one enumerator both the skill index
and the conventions index currently call, and `docIndexEntry` (`agents-doc.ts:24-26`) is the one
link-line formatter both use. `reconcileStore` (`src/core/reconcile.ts`) loops the five builders in a
fixed call order — `upsertFencedRegion` (`fs/fenced-region.ts:36-69`) appends a fence when its markers
are absent, so a store's section order today is whatever order the builders first ran in, frozen at
`init` and never revisited.

`ctxr verify --portable`'s current portability contract is literally "every skill on disk has an index
line in `AGENTS.md`" (`test/integration/adapters-and-entry-doc.test.ts:76-93`). Removing the index
removes that contract's entire mechanism, not just its content.

See proposal.md for why this changes; this document covers how.

## Goals / Non-Goals

**Goals:**
- Inline conventions and mission bodies without breaking the byte-stability guarantee
  (`test/unit/agents-doc.test.ts:76-91`) or the hand-written-content-preservation guarantee
  (`test/unit/agents-doc.test.ts:106-119`) that the rest of `agents-doc.ts` already provides.
- Give `ctxr verify --portable` and `ctxr doctor` a real replacement contract instead of leaving a hole.
- Keep the reordering mechanism conservative enough that it never silently discards or reorders
  hand-written content it doesn't understand.

**Non-Goals:**
- Redesigning `upsertFencedRegionInFile`'s core fence-matching algorithm — reordering is implemented as
  a new operation layered on top of the existing single-region upsert, not a rewrite of it.
- Making inlining configurable per-store (see proposal.md's Non-goals — this is a default-behavior
  change, not a new config surface).
- A generalized "any file can be inlined into any generated document" mechanism. This design adds
  exactly two inlining call sites (conventions, mission); a third would need its own design pass.

## Decisions

### One shared `inlineDocBody` helper, not two separate inliners
Both conventions and mission need the same four transforms — strip frontmatter, drop a duplicate
leading `# ` heading, demote remaining headings by a caller-supplied offset, strip nested
`contexture:<region>` fence markers while keeping their body — so this lives once in
`src/core/conventions.ts` next to `scanDocsDir`/`extractDocMetadata`, parameterized by heading-demotion
depth (conventions land under `### <title>` → source H2 becomes H4; mission lands directly under
`## Mission` → source H2 becomes H3).

**Alternative considered**: a generic markdown-transform library. Rejected — the four transforms are
each under 10 lines against markdown this codebase already controls the shape of (its own generated
notes and its own rollup fences), and a dependency buys nothing a shared internal helper doesn't.

### Mission stays a fifth builder in the existing pattern, not a special case
`buildAgentsMissionSection` follows the exact `render*`/`build*` split every other section uses,
registered in the same `reconcileStore` loop and `init.ts` call list. The only asymmetry: it's also
invoked from `rollup-write.ts` after a successful write to the configured mission path, so the entry
document and the mission document land in the same operation rather than requiring a separate `ctxr
update`. This reuses the section's own `render`/`build` pair — `rollup-write.ts` calls
`buildAgentsMissionSection` directly, it does not reimplement rendering.

### Reordering is opt-in-safe: contiguous-only, else a no-op plus a lint observation
`reorderFencedRegions(filePath, orderedFences)` (new, in `fs/fenced-region.ts`) only acts when every
managed fence is separated from its neighbors by nothing but blank lines. This is the deliberately
conservative reading of the byte-stability and content-preservation guarantees the existing tests
assert: a store where an operator has inserted hand-written content between two generated sections is
by definition a store where blind reordering could silently relocate that content relative to sections
it was written to sit near. Rather than guess, `ctxr update` leaves order alone and the interruption is
reported as an observation, not a failure — which in this codebase means a `ctxr lint` finding, not a
`ctxr doctor` one: `doctor` runs only `severity: 'invariant'` checks (`src/commands/doctor.ts`),
`lint` runs only `severity: 'observation'` ones, and the two are never double-counted. So the check
lives in `organize-checks.ts` (where every other observation-severity check already lives), not
`integrity-checks.ts`, even though it's about `AGENTS.md`'s structural integrity.

**Alternative considered**: always reorder, moving hand-written content wherever it ends up. Rejected —
indistinguishable from data loss from an operator's perspective the one time it matters.

**Alternative considered**: never reorder automatically, require a one-time manual fix. Rejected — the
common case (a store with no interstitial hand-written content, which is every freshly-`init`ed store
and most existing ones) shouldn't need manual intervention for a purely mechanical fix.

### Drift detection reuses render, not a hash
Both the `ctxr doctor` check and `ctxr verify --portable` detect drift by re-running the same
`render*Section` functions already used to write the file and diffing the result against what's
currently on disk inside each fence — not by storing a separate hash or checksum of the source files.
This is the same idiom `upsertFencedRegionInFile` already uses internally (write only if the rendered
body differs from what's there), so "is `AGENTS.md` current" and "would writing it now change anything"
are the same question asked without writing.

**Alternative considered**: stamp a content hash of each source file into `AGENTS.md` or into
`contexture.yaml`, compare hashes. Rejected — adds a persisted value that itself needs to stay in sync,
for no benefit over re-rendering (which is already fast and side-effect-free) other than avoiding a
full render for a large file, which isn't a real cost here.

### `verify --portable`'s skill-index scenario becomes a "sections render, inlined content matches
disk" scenario
The old scenario ("every skill file has an index entry") had one job: prove reading `AGENTS.md` alone
was enough. The replacement proves the same thing a different way — every managed section is present,
and every piece of content the entry document claims to carry inline (conventions, mission) actually
matches its source. This is a like-for-like swap in what "portable" asserts, not a narrowing of it: an
agent with no harness-specific state still gets everything `AGENTS.md` promises.

### The identity/mission pointer coexists with the inlined Mission section
Rather than deleting the one-line "load `<mission_path>` at session start" pointer from the canonical
section's identity paragraph, it stays — immediately followed by the new "## Mission" section carrying
the full body. This keeps `AGENTS.md is the canonical entry document`'s existing "names the mission
document" guarantee literally true (its underlying value: an agent knows *where* the content it's
reading came from, useful provenance independent of whether the body sits behind a link or right below
it) while the inlined section gives the content without the extra read. See the harness-portability
delta spec's `AGENTS.md is the canonical entry document` requirement.

### Conventions get a per-file provenance line, mission gets one for the whole section
Each inlined convention body is followed by `_Source: <path>_`, since a store can have multiple
convention files and a reader needs to know which is which. Mission is a single document per store
(`organize.mission_path` is a single path, not a list), so one provenance line for the whole "##
Mission" section is enough — no per-file disambiguation needed.

## Risks / Trade-offs

- **[Risk]** `AGENTS.md` becomes a hot file: every `ctxr rollup write` to the mission path now also
  rewrites `AGENTS.md`, and `vault-conventions.md` (a real downstream store) already documents
  `mission.md` as a file that collides across concurrent session PRs.
  → **Mitigation**: the two writes land in the same operation (one commit, not a race between two), so
  this doesn't add a new collision surface beyond the one that already exists for `mission.md` itself;
  operators sequence PRs touching either file the same way they already do today.
- **[Risk]** Every existing store's `AGENTS.md` changes on its next `ctxr update`, with no config gate
  to opt out (proposal.md's explicit decision). A store with large convention files will see `AGENTS.md`
  grow substantially even as the skill index shrinks it.
  → **Mitigation**: this is the intended outcome (duplication removed, real content present); the
  update is applied like any other contexture-owned regeneration — inside a session worktree, reviewed
  via PR, never directly on the default branch.
- **[Risk]** `inlineDocBody`'s heading-demotion and fence-stripping logic is new, hand-written markdown
  transformation — a class of code with a long tail of edge cases (a convention file that itself
  contains a fenced code block showing `contexture:` fence syntax as an example, for instance, could be
  misread as a real fence to strip).
  → **Mitigation**: fence stripping matches only the exact marker format `htmlCommentFence` produces
  (`markers.ts`), and only outside of fenced code blocks — the same fence-detection primitive
  `validateFenceIntegrity` already uses, reused rather than reimplemented, so both places treat "what
  counts as a fence marker" identically.
- **[Risk]** The contiguous-only reordering rule means a store that has already interleaved hand-written
  content between sections (unusual today, since section order was previously undocumented and
  unenforced) gets no automatic benefit from the new fixed order.
  → **Mitigation**: accepted trade-off per the Decisions section above; `ctxr doctor`'s new observation
  names the blocking interruption so an operator can resolve it manually once, after which reordering
  proceeds automatically on every future `ctxr update`.

## Migration Plan

No data migration — `AGENTS.md` is always fully regenerated content, never operator-owned state. The
rollout is: land this change in `contexture`, cut a release, and each store picks it up on its own next
`ctxr update` inside a session (per write-lifecycle's existing session/PR mechanism — nothing about
*how* stores receive contexture-owned changes is new here). No rollback mechanism beyond re-running
`ctxr update` against a prior contexture version, which is already how every other contexture-owned
regeneration is rolled back.
