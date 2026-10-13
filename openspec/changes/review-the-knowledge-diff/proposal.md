## Why

contexture's promise is that agents write the store and a person reviews the change before it lands. As
agents take on more of the legwork, the person's work shifts from writing to oversight and understanding, so
the review is where the store's quality is decided. Today that review gets a raw markdown line diff plus a
pull request body the agent wrote. A line diff says which lines moved, not what changed in the knowledge:
which notes were added, moved or archived, which links appeared or broke, which notes gained or lost inbound
links, which rollups were rewritten, and which sources the new material cites. The reviewer rebuilds that by
hand, or trusts the agent's own account of its work, which is the thing under review.

## What Changes

- A new deterministic command, `ctxr graph diff --since <ref> [--until <ref>]`, compares the wikilink graph at
  the merge base of the two refs with the graph at `--until`, which defaults to `HEAD`. It reports notes added,
  removed, modified, moved (by git rename detection) and archived (moved beneath the configured archive
  destination); links added and removed, with their relation type where the graph types them; dangling links
  introduced and resolved; the notes whose inbound links changed; rollup notes whose rollup region changed; and
  the source entries newly cited by changed notes. Both sides are read from git trees, with no checkout and
  without reading or writing the per-checkout graph cache. Every report names the full base and head commit
  ids it was computed from. It is byte-stable for the same two commits, with no wall-clock input and no
  editorial judgment.
- Three output forms. The default is human text. The standard `--json` envelope is for callers.
  `--format markdown` emits the ready-made **Knowledge changes** block for a pull request body. The block
  carries the two full commit ids, the exact `ctxr graph diff --since <base> --until <head>` command that
  reproduces it, the counts, every introduced dangling link and every archived note, and, from a session
  worktree, the review view's address with the condition under which it resolves.
- `ctxr-submit` runs `ctxr graph diff --since origin/<default> --format markdown` before opening the pull
  request and pastes its output into the body verbatim. The agent writes none of this section. Its own
  account of why stays in the body's existing why / what-changed text. The block in the body is the durable
  record of what the change did to the knowledge, and anyone can check it later by re-running the command it
  names.
- As a convenience, `ctxr serve` gains a **review view** per session worktree. It renders the same report
  through the browsing shell, with lists and tables first, and works with client-side scripting disabled. It
  shows the base and head commit ids it was computed from. When the address carries the head the block
  recorded and the worktree's branch has since moved past it, the view says so. The view resolves only while
  the session's worktree exists and the server is reachable, so it is not the record; the block is. The view
  may also include a diagram of the link delta as a fenced `mermaid` block, drawn where the renderer from
  `render-diagrams-in-notes` is present and left as readable source text where it is not. The view is derived
  from the diff alone. No agent writes it.

## Non-goals

- **An agent-written review page or summary.** The reviewer is checking the agent's account, so the agent must
  not write the review surface or the knowledge summary. The narrative belongs in the pull request body's
  why. design.md D5 and D9 argue the alternatives in full.
- **A drift check on the pull request body.** A CI or doctor step that re-runs the diff and compares it with
  the pasted block is deferred (design.md D9). The block names its reproducing command, so the check is
  possible by hand today.
- **Judging the change.** The report says what changed, not whether it is good. It has no severity, score,
  "suspicious" flag or ranking. Lint and doctor stay the checks that fail.
- **Reviewing uncommitted work.** Both sides are commits, so the report matches what is pushed. Working-tree
  diffs are design.md D4's rejected alternative.
- **Reviewing branches that have no session worktree on the serving host in the served view.** The CLI command
  works on any checkout and any two refs. The served view covers only the worktrees `ctxr serve` already
  enumerates for previews.
- **A navigation area for reviews.** The view is reached from the pull request body. Adding a sixth area to
  the fixed navigation order is deferred until evidence calls for it (design.md D6).
- **New configuration.** The command adds no key. It reuses `serve.base_url` and `serve.previews` as page
  previews do (design.md D7).
- **Persisting the base graph or the report.** Both are computed on demand. Nothing new is written under the
  cache paths, and nothing is committed by the command.
- **Rendering mermaid.** That belongs to `render-diagrams-in-notes`. This change only emits the fenced block.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `context-retrieval`: gains a requirement for the graph delta between two commits (`ctxr graph diff`), next to
  the existing graph build and query requirements.
- `context-browsing`: gains a requirement for the per-worktree review view served by `ctxr serve`.
- `harness-portability`: *Submit and land are owned skills over git and gh* gains the Knowledge changes block,
  pasted verbatim from `ctxr graph diff --format markdown`, in the pull request body.

## Impact

- **Code:** `src/core/notes/list.ts` factors its path-admission rule out so a git-tree enumeration can share
  it. A new `src/core/graph/diff.ts` holds the delta and a tree reader over `git ls-tree` / `git cat-file
  --batch`. Also new: `src/commands/graph-diff.ts`, a `graph diff` registration in `src/run.ts`, a review
  route in `src/commands/serve.ts` with its address helper in `src/core/browse/page-url.ts`, and the review
  route table entry in `src/core/browse/routes.ts`.
- **Shipped prose:** `templates/skills/ctxr-submit.md` step 8 lives in the template, per house rule.
- **Dependency:** the optional diagram depends on `render-diagrams-in-notes`. Without it the diagram shows
  as source text and the lists carry the content.
- **Stores:** nothing changes until a store runs `ctxr update` to receive the new submit skill. Stores that
  never run `ctxr serve` still get the PR-body block, which is the durable record.
