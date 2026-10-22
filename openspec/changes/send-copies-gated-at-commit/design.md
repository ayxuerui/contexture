## Context

The send-copy rule lives in three places today, none of which reaches every commit:

- `src/commands/publish-check.ts` holds the page-root listing (`sendCopiesAtPageRoot`) and the name check
  (`checkSendCopyNames`) as private functions, run when an agent checks one page.
- `templates/skills/ctxr-publish.md` states "never overwrite", which nothing checks.
- `src/core/publish/send-copies.ts` holds only the format list and `sendCopyExtension`.

The pre-commit hook runs `ctxr doctor --staged`, which runs every check whose scopes include `staged`
(`WRITE_LIFECYCLE_CHECKS` in `src/core/checks/write-lifecycle-checks.ts`). Every store contexture installs gets
the same hook, and it locates the CLI from `PATH`, so a check added there reaches each store once its CLI is
updated. `getStagedFiles` (`src/core/git/staged.ts`) reads `git diff --cached --name-status` and keeps only the
status letter; a rename's similarity score (`R100`, `R087`) is dropped.

Lint's store-scope observations (`organize.page_representation`, `organize.disposable_page_due`) walk page
folders with `publishedPageFolders` and report without failing.

## Goals / Non-Goals

**Goals:**
- The dated-name rule and the never-overwrite rule are both refused at commit, in every store, by the gate
  every store already runs.
- `publish check`, the staged check and lint read send copies through one function.

**Non-Goals:**
- Inspecting a file's bytes to judge what it is. The check reads paths, statuses and rename scores only.

## Decisions

### D1. Gate at pre-commit, report at lint

*Alternative considered: report only, in lint.* The best case: lint already reports the page backlog, it never
blocks an agent mid-session, and a store that drifts is visible to the operator at the next audit. The rule is
also a judgment-light one, where a refusal at commit can feel heavy for a file name. It loses because "never
overwrite" cannot be seen by lint at all — lint reads the tree, and an overwritten file looks like any other —
and because a report only helps if somebody runs it. The commit is the one moment every store passes through
and the only one where "this file changed" is known.

*Alternative considered: a CI check in each store's repository.* The stores run different CI or none (pkm and
its siblings run none on content branches); it would have to be added three times and kept in step. The hook
is already installed by contexture in all of them.

Lint keeps the store-wide view for what is already committed, as an observation: the stores pass today, and a
future change to the rule must not turn existing content into a failing build.

### D2. "Changed" is a staged status, read from git, not from content

A staged send copy with status `M` is changed. A rename is changed when its similarity score is below 100;
`getStagedFiles` keeps the score as `renameScore` on the staged file. A pure move (`R100`) is the shape of a
store reorganising pages — pkm's own migration in pkm #402 moved PDFs with `git mv` — and stays allowed.

A rename git does not detect (heavy change under its default 50% threshold) appears as a deletion plus an
addition. The addition is then judged as a new file: allowed if dated. That is the rule working, not a gap: a
new dated file beside the deleted one is exactly "write a new dated file", and a same-named file changed in
place is always `M`.

### D3. A page folder is judged in the commit's resulting tree

A staged file is a send copy when its folder holds `index.html` in the tree the commit produces: staged as
added or modified, or present in the working tree and not staged for deletion. Reading the resulting tree,
rather than the parent's, means a commit that creates a page and its first send copy together is checked, and
one that deletes a whole page is not.

### D4. One shared reading

`sendCopiesAtPageRoot` and the name check move into `src/core/publish/send-copies.ts`, beside the format list,
as exported functions: `sendCopyNameProblem(fileName)` (null when dated) and `sendCopiesAtPageRoot(dir)`.
`publish check`, the lint observation and the staged check call them. The staged check needs only the name
check and the page-folder test; it never lists a directory.

### D5. The refusal says what to do

Each finding names the file and the fix: "write the new send as a new dated file" for `modified`, "name it
`<YYYY-MM-DD>-<name>.<ext>`" for `undated`. The skill states the same before the agent reaches the hook.

## Risks / Trade-offs

- **[A copy committed and then corrected before it was ever sent is refused]** → the fix is a new name (a new
  date, or a `-v2` suffix after the date). `--no-verify` remains the operator's escape, as for every check.
- **[Two CLI versions in one store]** → a store's agents commit with the CLI on `PATH`; until each harness has
  the new release, some commits are gated and some are not. Accepted, as for every pre-commit change; the
  release propagation chain closes it.
- **[A rename's score is lost if git's output format changes]** → `renameScore` is parsed from the status code;
  an unparseable code leaves it undefined, which the check treats as changed, failing closed to a refusal the
  operator can see.

## Migration Plan

None for stores: all three pass today (audit 2026-10-22). Ship in a release; the gate applies from each
store's next commit on the new CLI. Rollback is reverting the release.
