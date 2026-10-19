## Context

The wikilink graph is derived by `buildGraphFromNotes(notes, options)` in `src/core/graph/model.ts`. The
function is pure over an in-memory note list: node identity is the store-relative path, links resolve by
filename stem through `buildStemIndex` / `resolveStem`, typed edges come from relation-vocabulary sections, and
dangling links are collected rather than thrown. `ctxr graph build` feeds it from `listNotes()` (a filesystem
walk filtered by `excludedPrefixesFor(config)` plus the root-file skips) and writes `graph.json` / `graph.md`
under `.contexture/cache/`. That is a per-checkout cache, never committed. A base ref therefore has no graph
to read, and one has to be built.

`ctxr publish urls --since <ref>` (`src/commands/publish-urls.ts`) already reads a change set with
`git diff --name-status -M --relative -z <ref>...HEAD`, and its address logic comes from `pageServedAt`
(`src/core/browse/page-url.ts`). This change follows both precedents. `ctxr serve` builds a route table fresh
on every request. It enumerates session worktrees with `listSessionWorktreeDirs`, serves previews from them
byte-verbatim, and renders everything else through `renderShell` (navigation, theme by cookie, no script) and
`renderNoteBody` (markdown-it, `html: false`).

The pieces the delta needs already exist: archive is one tracked rename beneath
`organize.archive_destination` (`src/commands/archive.ts`), a rollup is the `ROLLUP_FENCE` region
(`src/core/rollup.ts`), and provenance is the `SOURCES_FIELD` list (`src/core/ingest/identity.ts`).

## Goals / Non-Goals

**Goals:** a reviewer sees what changed in the knowledge without reading markdown line by line. Every fact in
the report is reproducible from two commit ids, which the report names. The pull request body, the durable
review surface, carries a block the command wrote, never one the agent wrote. A reviewer with scripts off loses nothing.

**Non-goals:** see `proposal.md`. At the design level: no caching of base graphs, no incremental diff, no
cross-store or multi-ref comparisons, and no change to `graph build`'s output.

## Decisions

**D1 — A deterministic command, `ctxr graph diff --since <ref> [--until <ref>]`, computes the delta.**
The head is `--until`, defaulting to `HEAD`. The base is the merge base of `--since` and the head, the same
`<ref>...HEAD` meaning `publish urls --since` uses, so both PR-body sections describe one change set. Every
output names both full commit ids. `--until` exists so a range can be re-run exactly from any checkout:
`--since <base-id> --until <head-id>` resolves to the same two commits, because the merge base of a commit and
its descendant is the commit itself. The flag is named `--since` for the same reason. `graph`
owns the vocabulary the report uses (nodes, edges, dangling, typed links), so the command sits beside
`graph build` and `graph query`. There is no new `review` command group, because a `review` group would have
to keep driving everything a review needs.

*The strongest alternative: no command, and the submit skill tells the agent to read `git diff` and write
the summary.* That costs no code. An agent can read a diff and explain intent, and it would catch semantic
changes (a claim reversed inside a paragraph) that a graph delta never sees. It fails here because the agent
would be summarising its own work for the person checking that work. An omission (an archived note it did
not mention, a link it broke) is exactly what the reviewer most needs and what a self-summary is least likely
to surface. The code/judgment seam in `openspec/config.yaml` also puts byte-stable derivation in the CLI.
*A weaker alternative: fold the delta into `ctxr doctor --json` or `publish urls`.* Rejected for the reason
`publish urls` D1 rejected a doctor field: doctor has a pass/fail contract, and this report gates nothing.
*What would flip it:* if reviewers routinely find the counts and lists add nothing beyond the agent's body,
and the semantic misses that a command cannot see dominate PR review findings, the code is not earning its
keep.

**D2 — The base side is read from git's object store, with a shared admission rule.**
`listNotes`' path filter (`ALWAYS_SKIP_DIRS`, root `AGENTS.md`, harness entry files, `excludedPrefixesFor`)
is factored into one pure predicate, `admitsNotePath(relativePath, config)`. The filesystem walk keeps using
it, and a new tree reader uses it too: `git ls-tree -r -z --full-tree <commit> -- <store prefix>` lists paths,
the predicate filters them, and one `git cat-file --batch` process streams the admitted blobs into
`parseNote`'s string form. Both the base and the head side go through the tree reader, so `HEAD` is read the
same way the base is (D4). Nothing is checked out and nothing is written.

*Alternatives:* (a) `git worktree add` the base and run `graph build` in it. That is the most obviously
correct option, because it reuses the build verbatim. But it writes a worktree, a cache and a lock, makes the
command slow and stateful, and a crash leaves debris. The request path in `ctxr serve` cannot afford it.
(b) Read the base's `graph.json`. It does not exist, because the cache is per checkout and never committed.
(c) Commit `graph.json`, so every ref carries its own graph. That is the strongest form: zero computation
at review time, and a history of the graph for free. It puts a derived artifact into every content commit,
makes every PR conflict on it, and breaks the rule that derived artifacts under the cache paths never
stage. *What would flip it:* base-graph builds measured as a real cost (seconds per request on a large
store) would justify a cache keyed by tree id under the cache paths. Committing the artifact would still be
the wrong layer.

Both sides are read under the **current** configuration, the one `Store` loaded. *For reading each side
under its own `contexture.yaml`:* that is historically faithful. Rejected because a change to
`retrieval.exclude_paths` would then report every newly excluded note as removed, mixing a configuration
change into the knowledge delta. A reviewer sees the configuration change in the line diff anyway.
*What would flip it:* configuration changes riding along in content PRs and being missed in review. The
fix then is a reported "configuration changed in range" fact (see Open Questions), not per-side configs.

**D3 — Moves and archives come from git rename detection, and base paths are carried through them.**
`git diff --name-status -z --relative -M50% <base> <head>` runs with `-c diff.renameLimit=0`,
`--no-ext-diff` and `--no-textconv`, pinned on the command line so a user's git configuration cannot change
the result. A rename between two admitted paths is a move. A rename from outside the archive destination to
beneath it is an archive, whether or not the destination is admitted. A folder archive is many such renames,
each reported. Before edges and dangling links are compared, every base-side path is mapped through the
rename table. Without that, moving one note would report every edge touching it as removed and re-added.
Edges compare as a set of distinct `(src, dst, type)` triples, so a link written twice counts once.

*Alternative: match nodes by stem or by content hash instead of by git renames.* A stem match would be
independent of git's heuristics. But identity is path-derived (context-retrieval), two same-stem notes are a
valid state, and a hash match misses a move that also edits the note. Git's similarity measure is what
`publish urls` and `git log --follow` already rely on. *What would flip it:* frequent "moved and heavily
rewritten" notes showing up as remove+add, which would argue for lowering the threshold. It would not argue
for a different identity.

**D4 — Both sides are commits, and uncommitted work is out.**
*For the working tree:* sessions rest with uncommitted work between turns (session-lifecycle), so a view
that only shows commits shows nothing while the session is live, and the person often wants to look
mid-session. Rejected because the report's job is reviewing what will land. A PR is commits. A working-tree
side would make the report depend on untracked files and editor state, make the served view and the PR
section disagree, and break the two-commit-ids reproducibility the byte-stability requirement rests on.
*What would flip it:* operators asking for the mid-session view. A `--worktree` mode could be added later
without changing the commit-to-commit contract.

**D5 — The review view is derived from the delta, never authored by the agent.** *(The key decision for
presentation.)* The view is a convenience: it resolves only while the session's worktree exists and the server
is reachable. The durable record is the PR-body block (D9), and this decision governs both.
An oversight tool must not be written by the party being overseen. The PR body is the agent's account of
its change, and that account is what the reviewer is checking. A view the agent writes is a second copy of
the same account, so it can share the same omissions. The view is therefore a pure function of
`(base commit, head commit, configuration)`: the same data `ctxr graph diff --json` emits, rendered as a
markdown document through `renderNoteBody` inside `renderShell`. One derivation, two renders, the same
pattern as `graph.json` / `graph.md`.

*The strongest case for an agent-written page:* it can explain why, which a derived view never can. It can
group changes by intent ("these six moves are one reorganisation") instead of by kind. It can tailor itself
to the subject, skip noise, and quote the paragraph that changed a claim. The publish skill already shows
agents build good pages. For a large reorganisation, a list of 200 moves is harder to review than a page
that says "everything under `ctx-a/` moved to `ctx-b/`, three notes split". *Why it still loses:* each of
those strengths is a choice about what to show, and choosing what to show is where an overseen party hides
things, even with no intent to. The why already has a home in the PR body. The derived view checks that
account and does not replace it. *What would flip it:* (1) evidence that operators stop opening the derived
view and review from the PR body alone, so it is not doing its job; or (2) deltas routinely too large to
read without narrative. Even then, the first answer is mechanical grouping in the derived view (collapse a
shared-prefix move into one row), and an agent narrative is the last resort.

**D6 — The view is addressed per worktree and sits outside the navigation.**
The route is `/review/<worktree>/`, and the address the report names adds `?head=<head-id>`. The view always
prints the base and head ids it computed. When the `head` parameter differs from the worktree's current `HEAD`,
it prints a server-side notice that the branch has moved past the recorded head, names both ids, and shows the
current delta. That is the simplest deterministic form: no script, no stored state, and the reviewer cannot
mistake a later push for the change the block describes. *For rendering the recorded head instead:* that
would be exact, but it shows a state the branch no longer has. The notice plus the block's reproducing command
covers that need. Its prefix is spelled once beside `PREVIEW_ROUTE_PREFIX` in
`page-url.ts`, and the same function builds the address the report names. The base is
`origin/<git.default_branch>` when that ref exists, else the local default branch. That is the same
start-point rule `session start` uses, without its fetch: serving never fetches.

*For a navigation area:* discoverability. Someone browsing `ctxr serve` would see every in-flight change.
Rejected for now: the navigation requirement fixes five areas in one order, and adding a sixth means a
MODIFIED delta on a requirement that sibling changes may also touch. A per-request list would also cost a
git diff per worktree on every page render, unless it only listed names. The reviewer's entry point is the
PR body, which carries the address. The view still renders inside the shell, so it has navigation out.
*What would flip it:* operators looking for reviews in the server rather than in PRs. A names-only area
(no diff computed) is the cheap version.

**D7 — No new configuration.**
The review address follows `serve.base_url` exactly as page previews do. `serve.previews: none` also drops
it, because that key records that worktree-served addresses do not reach this store's reviewers, and the
review route has the same reachability. *For a separate `serve.reviews` key:* the two could differ in
principle, for example previews of HTML blocked by a proxy while the shell routes pass. That is
speculative. Each opt-in key is a permanent surface, so the shared key is used until a store shows the
split. *What would flip it:* such a store.

**D8 — The diagram is an optional fenced `mermaid` block, drawn by progressive enhancement.**
The view's markdown may end with a `flowchart` of the changed edges: added edges solid, removed edges dashed,
and nodes labelled by stem. It is omitted when no edge changed, and replaced by one line saying so when more
than a fixed constant (50) of edges changed, so it never becomes unreadable. Drawing it belongs to
`render-diagrams-in-notes`. This change depends on that one only for the picture. Without it, the block shows
as source text and the tables carry every fact, which the browsing spec's no-script stance requires anyway.
*Alternatives:* server-side SVG layout would draw with scripts off, but it needs a layout engine dependency
for a secondary element. Having no diagram at all is honest and costs nothing, but a picture of what got
connected to what is the one thing lists show badly. *What would flip it:* the sibling change not landing,
in which case the block should be dropped rather than shipped as permanent source text.

**D9 — The PR-body block is emitted by the command and pasted verbatim.**
The pull request body outlives the worktree and the server, so it is the durable review surface, and the party
being reviewed must not write its knowledge summary. `ctxr graph diff --format markdown` emits the whole
**Knowledge changes** block. It holds both full commit ids, the exact `ctxr graph diff --since <base-id>
--until <head-id>` that reproduces it, the counts, every introduced dangling link and every archived note
(the two kinds most likely to be silent losses), and, from a session worktree, the review address with its
reachability line. `ctxr-submit` runs it after `publish urls` in step 8 and pastes the output unchanged. The
block is always present, and it says when the range changes no note, because a missing section cannot be told
apart from a skipped step. `--format` is a new flag. No command registers one today, and the closest
precedent is the global `--json`. An enum leaves room for further forms, where a `--markdown` boolean would
have collided with `--json` in the same way with no room to grow. Combining it with `--json` is a usage error.

*(a) The strongest case for the agent writing the summary from the report* (this design's earlier position):
the agent can choose what is notable. A block listing forty moves buries the one archived note that matters,
an agent can phrase the counts in the subject's terms, and it can join the knowledge summary to the why
without a seam. It loses because "choose what is notable" is the selection the reviewer is checking. An
instruction to copy faithfully is a skill convention, not a mechanism (`openspec/config.yaml`: a requirement
that relies on an agent following an instruction is not enforced). Pasting a block whose content the
command decides leaves the agent nothing to select. Its narrative still has the why section.
*(b) A drift check:* a CI job or a `ctxr doctor` mode that re-runs the command the block names and fails when
the PR body's block differs. That would turn "pasted verbatim" from a convention into a gate, and the block's
reproducing command makes it cheap to write. Deferred, because it needs the PR body (a forge read that
`doctor`, a store-scope validator, does not do today), and CI is per-store wiring contexture does not ship. The
block's reproducing command already lets a reviewer run the check by hand. *What would flip it:* one observed
case of an edited or hand-written block reaching review, or stores adopting a shipped CI workflow that could
host the check.

**D10 — The report emits no findings and gates nothing.**
*For failing on an introduced dangling link:* it is the cheapest regression to block. But `lint` and
`doctor` already report dangling links and own the gate, and a second gate would disagree with them on
thresholds. The report describes and the existing checks judge.

## Risks / Trade-offs

- [Rename detection misclassifies a heavily rewritten move as remove + add] → The threshold is pinned and
  documented. The line diff remains available, and the tables list both paths.
- [A large reorganisation produces a very long view] → Lists are grouped by kind in `<details>` blocks
  (no script), the counts lead, and the diagram is capped. Mechanical grouping is the follow-up if this bites
  (D5).
- [The review address resolves only while the worktree exists on the serving host] → The block states the
  condition, and the block itself, with its commit ids and reproducing command, is the durable record.
- [An agent edits the pasted block] → Mitigated by the skill and by the reproducing command a reviewer can run.
  Enforced only once the deferred drift check (D9 b) exists.
- [Base-graph construction per request is slow on very large stores] → One `ls-tree` plus one `cat-file
  --batch` per side. Measure before caching (D2).
- [The sibling `two-kinds-of-published-page` may also modify the submit requirement] → OpenSpec deltas sync in
  merge order. Whichever change lands second rebases its MODIFIED text onto the first's.
- [The view exposes worktree note paths and source entries on the served surface] → Same audience and bind as
  previews. No note body is exposed, and worktree-only notes are not linked (context-browsing requirement).

## Migration Plan

Additive. Existing stores receive the new submit step on `ctxr update`. No configuration, data or cache
migration. Rollback is reverting the release, and stores keep working with the previous submit skill.

## Open Questions

- Should the report also state "configuration changed between the two sides" as a fact (D2)? It is
  deferrable: it adds a field and changes no decision here.
- Should a shared-prefix move collapse into one row in the view (D5's first mitigation)? Deferred until a real
  delta shows the need.
