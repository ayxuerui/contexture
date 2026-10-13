## 1. Shared note admission

- [x] 1.1 `src/core/notes/list.ts`: factor the path filter (`ALWAYS_SKIP_DIRS`, root-only `AGENTS.md`, harness
      entry files, `excludedPrefixesFor`) into one exported pure predicate `admitsNotePath(relativePath, config)`.
      Have the filesystem walk call it, with no behaviour change. Export a string-input form of `parseNote`
      (or a sibling `parseNoteText(text, relativePath)`) so blobs read from git parse identically.
- [x] 1.2 Tests: the existing `listNotes` suite passes unchanged. A table test shows the predicate agrees with
      the walk for an excluded prefix, the capture root, the publish path, root `AGENTS.md`, a nested
      `AGENTS.md`, and a harness entry file. `npx vitest run test/unit/list-notes.test.ts` exits 0.

## 2. The graph delta

- [x] 2.1 `src/core/graph/tree.ts`: `listNotesAtCommit(git, storeRoot, commit, config)`. Use
      `git rev-parse --show-prefix` for a store below the top level,
      `git ls-tree -r -z --full-tree <commit> -- <prefix>`, filter with `admitsNotePath`, and read the admitted
      blobs through one `git cat-file --batch` process. Return paths relative to the store root, sorted.
      Writes nothing.
- [x] 2.2 `src/core/graph/diff.ts`: `diffGraphs(base, head, renames, config)` over two `buildGraphFromNotes`
      results plus their note lists. It produces notes (added / removed / modified / moved / archived), links
      added/removed as distinct `(src, dst, type)` after mapping base paths through moves and archives,
      dangling introduced/resolved, inbound changes (gained/lost sources plus a head-side rollup flag via
      `hasRollupSection`), rollups touched (comparing the `ROLLUP_FENCE` region text), sources cited (the
      `SOURCES_FIELD` entries new on the head side), and counts. Every list is sorted by path and then by the
      remaining fields. There are no timestamps.
- [x] 2.3 Rename table: `git -c diff.renameLimit=0 diff --name-status -z --relative -M50% --no-ext-diff
      --no-textconv <base> <head> --`. A rename into `organize.archive_destination` from outside it is an
      archive. A rename between admitted paths is a move.
- [x] 2.4 `src/core/graph/diff-document.ts`: one render of the delta to markdown (counts, then a `<details>`
      section per kind, with tables), used by both the human summary and the review view. Paths go in code
      spans, and a path becomes a link only through a caller-supplied predicate. An optional trailing
      ` ```mermaid ` `flowchart` of changed edges: omitted when none changed, and replaced by one line when more
      than 50 changed (a named constant, not config). Mermaid labels are escaped. Every render opens with the
      full base and head commit ids.
- [x] 2.4a `src/core/graph/diff-block.ts`: the **Knowledge changes** block for `--format markdown`. It holds both
      full commit ids, the line `ctxr graph diff --since <base-id> --until <head-id>`, one counts line, every
      introduced dangling link, every archived note, the review address (with `?head=<head-id>`) and its
      reachability line when present, and the "changes no note" statement for an empty delta. The block's fixed
      sentences live in a template under `templates/` (house rule: shipped prose is never a TypeScript string
      literal), and the code only fills in values. The block contains no diagram.
- [x] 2.5 Unit tests in `test/unit/graph-diff.test.ts` over real git fixtures, one per scenario in
      `specs/context-retrieval/spec.md`. Cover: an added note with a resolving and a dangling link; a pure
      move with no link change; a move that changes the stem (dangling introduced); single-note and folder
      archives, each listed once as archived; a link moved between two relation sections; a resolved
      dangling link; a rewritten rollup; a newly cited source; an excluded path invisible on both sides; a
      store root below the repository top level.
- [x] 2.6 Determinism tests: two runs, with a fake clock moved between them, give byte-identical JSON, text and
      markdown block. Re-running the block's own reproducing command from a second clone whose `HEAD` is
      elsewhere gives the same commit ids, counts and lists. An uncommitted edit and an untracked note do not change the output. Deleting or staling
      `graph.json` does not change the output. `git status --porcelain` and the cache directory listing are
      unchanged after a run. A `diff.renames=false` / `diff.renameLimit=1` user config does not change the
      result.

## 3. The command

- [x] 3.1 `src/commands/graph-diff.ts`: require `--since` (usage error when absent). The head is `--until`,
      or `HEAD` when it is absent, and the base is the merge base of `--since` and the head. Either ref failing
      to resolve to a commit gives an error naming it. Accept `--format text|markdown` (default `text`). Any
      other value is a usage error naming the accepted values, and `--format markdown` with `--json` is a
      usage error. `markdown` writes only the 2.4a block to stdout. Read both sides via 2.1,
      diff via 2.2, and attach the review address (4.1) when the root is a session worktree and
      `serve.previews` is not `none`. Return the data in the standard envelope with no findings and exit 0.
      `humanSummary` is the markdown render without the diagram, plus the bare-route line when no base URL
      is declared.
- [x] 3.2 `src/run.ts`: register `graph diff` under the existing `graph` command with
      `.option('--since <ref>', ...)`, `.option('--until <ref>', ...)` and `.option('--format <form>', ...)`, and
      command id `graph.diff`. Route the `--format markdown` output past the envelope reporter, the way
      `serve` and `--json` are special-cased today. Update any command-enumerating contract
      test.
- [x] 3.3 Command tests: no `--since` gives the usage exit code and empty data. An unknown `--since` or
      `--until` ref gives an error naming it. `--format html` and `--format markdown --json` give the usage
      code. Every form names both full ids. The markdown block contains the reproducing command, lists three
      introduced dangling links and two archived notes in full, and states "changes no note" on an empty
      range. In a session worktree the review route is present and the report says it is bare. With a
      base URL carrying a path prefix, the prefix is kept. In the store's own checkout there is no address.
      With `serve.previews: none` there is no address.
- [x] 3.4 `npx vitest run test/unit/graph-diff.test.ts test/unit/run-usage-errors.test.ts` exits 0.

## 4. The review view

- [x] 4.1 `src/core/browse/page-url.ts`: add `REVIEW_ROUTE_PREFIX = '/review/'` and `reviewRoute(worktree)`,
      plus a `reviewServedAt(store)` that uses the same base-URL join and worktree detection as
      `pageServedAt`. Add the prefix to the single-source-literals check.
- [x] 4.2 `src/commands/serve.ts`: handle `REVIEW_ROUTE_PREFIX`. Look up the worktree name in
      `listSessionWorktreeDirs` (miss → 404). Pick the base as `origin/<git.default_branch>` if that ref
      exists, else `<git.default_branch>`, with no fetch. Compute the delta with the worktree as cwd. Render
      the markdown through `renderNoteBody` inside `renderShell`, linking a path only when
      `table.notes.has(path)`. An empty delta renders the "no knowledge changes" view with 200. Print both
      full commit ids. When a `head` query parameter is present and differs from the worktree's `HEAD`, print
      a server-rendered notice naming both ids and show the current delta. No script.
- [x] 4.3 Serve tests in `test/integration/serve-command.test.ts`, one per scenario in `specs/context-browsing/spec.md`. The view's facts equal
      `graph diff --json` in that worktree. A commit message describing absent changes does not appear. The
      response carries the nav and theme markup and no `<script>` this change adds. The diagram's edges are
      all present in the tables. A worktree-only note is unlinked and still 404s on the note route. An
      unknown worktree gives 404. Both ids are printed. `?head=<old-id>` after a new commit gives the
      moved-on notice naming both, and `?head=<current-id>` gives no notice. An empty delta gives 200 with the empty statement. The worktree's
      `git status --porcelain` and cache directory are unchanged after a request.
- [x] 4.4 `npx vitest run test/integration/serve-command.test.ts test/unit/browse-routes.test.ts` exits 0.

## 5. Submit skill

- [x] 5.1 `templates/skills/ctxr-submit.md` step 8: after the Pages paragraph, run
      `ctxr graph diff --since origin/__DEFAULT_BRANCH__ --format markdown` and paste its output into the body
      verbatim as the **Knowledge changes** section, with nothing added, removed or reworded. Always paste it,
      including when it says the range changes no note. Say that the block is the durable record and the review
      address in it is a convenience. This prose lives in the template only, never in a TypeScript string
      literal. Before writing it, check the seven banned tier words and that every `--flag` binds to a
      command `src/run.ts` registers (`--since` and `--format` on `ctxr graph diff`).
- [x] 5.2 `test/unit/skills.test.ts`: the rendered submit step 8 contains
      `ctxr graph diff --since origin/<default> --format markdown`, ordered before `gh pr create`, contains
      `**Knowledge changes**`, and says the output is pasted verbatim. The existing banned-word and
      flag-attribution suites pass over the new text, with `--format` resolving against `graph diff`'s
      registration.
- [x] 5.3 `npx vitest run test/unit/skills.test.ts` exits 0.

## 6. Verify

- [x] 6.1 `openspec validate review-the-knowledge-diff --strict` exits 0.
- [x] 6.2 `npm run typecheck && npm test` exits 0.
- [x] 6.3 Manual check: in a scratch store with a session worktree that adds, moves and archives notes, run
      `ctxr graph diff --since origin/main` and `ctxr serve`. Fetch `/review/<worktree>/` with `curl` and
      confirm the same facts appear. Report the real output.
