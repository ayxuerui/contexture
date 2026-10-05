## Context

See proposal.md, Why, for the motivation. The approach follows from how the code is laid out today:

- **Three entry points, two code paths.**
  - `runInitCore` (`src/commands/init.ts`) has a fresh path and an already-initialized path.
  - The already-initialized path is `readConfig` then `reconcileStore` (`src/core/reconcile.ts`). Its
    comment says it is "exactly `ctxr update`'s job — one shared implementation".
  - `ctxr update` (`src/commands/update.ts`) is `reconcileStore` then `generateAdapterOutputs`. So
    update is the only one of the three that generates adapter outputs. The comment is wrong because
    the adapter call sits outside the shared function.
- **The generator needs only a root and a configuration.** `generateAdapterOutputs(git, store)`
  (`src/commands/adapters-generate.ts`) uses `store.root` and `store.config`. It never uses `git`.
  - It writes each adapter's entry-file fence with `upsertFencedRegionInFile`.
  - It retires the old hook script, then merges the permission config with `mergeJsonArrayLists`.
  - It returns `{ path, changed }` per file. It reads no git state and needs no commit, so it can run
    on the fresh path before the initial commit.
- **What claude-code writes on a fresh store.** `render()` gives one `@AGENTS.md` line. It depends on
  `AGENTS.md`'s file name, not its content, so ordering against the section builders is about tidiness
  rather than correctness. `permissionConfig.render` returns `{}`. Under `retire-the-write-gate` D3,
  a fresh store gets no `.claude/settings.json`, and the generator reports that path as
  `changed: false`.
- **The fresh path builds its commit from explicit lists.** `addPaths` stages a named list:
  configuration, `.gitignore`, `AGENTS.md`, gitkeeps, skills, templates, bridges, guidance and hooks.
  `created` repeats most of that list. Naming a path that was never written would make `git add` fail,
  so only paths actually written may be added.
- **`update --worktree` goes through `execute`.** Whatever `execute` does, the worktree variant does
  too, with no separate wiring.
- **The doctor entry-file check skips an absent file** (`integrity-checks.ts`, "nothing generated for
  this adapter yet"). No existing check notices the gap.

## Goals / Non-Goals

**Goals:**

- `init` (fresh), `init` (existing), `update` and `update --worktree` all produce the same
  contexture-owned files for the same configuration.
- Each step is reached through one call site. A future owned-file step added to the reconcile reaches
  every entry point except fresh init, and the invariant test catches fresh init.
- The initial commit contains the adapter outputs. Init leaves a clean working tree, as it does today.

**Non-Goals:**

- No change to the `InitData` envelope shape. `created` gains entries; no field is added.
- No change to `ctxr adapters generate`'s output or its exit codes.

## Decisions

### D1: Adapter generation moves inside `reconcileStore`, and the generator moves to core

`reconcileStore` calls the generator as its last file-writing step, after the `AGENTS.md` sections are
written and reordered and before the git hooks are installed. Every written path joins `changed`. The
function moves to a new `src/core/adapter-outputs.ts` and drops the unused `git` parameter.
`src/commands/adapters-generate.ts` keeps its command and its `AdaptersGenerateData` shape, and calls
the core function. `update.ts` deletes its own call and the merge of the two `changed` lists.

*Alternative: add a second call in `init.ts`'s already-initialized branch, next to `reconcileStore`.*
Rejected. This bug is the result of exactly that shape: a step that has to be called beside the shared
function, at every call site, and was missed at one. Two call sites would fix init today and leave the
next owned-file step exposed to the same miss.

*Alternative: leave the generator in `src/commands/` and import it from core.* Rejected. Nothing in
`src/core/` imports from `src/commands/`. The generator is store logic that happens to have a command
as one caller, so it belongs with the reconcile.

### D2: The fresh path calls the generator and stages only what it wrote

After `buildAgentsConventionsSection` (the last `AGENTS.md` writer) and before `installHooks`, fresh
init calls the generator with `{ root, config }`. The order matches D1, so fresh and existing stores
render in the same sequence. Paths reported `changed: true` are appended to both the `addPaths` list
and `created`. A path reported unchanged is never staged. For claude-code on a fresh store, that keeps
`.claude/settings.json` out of `git add`, which would otherwise fail on a missing file.

*Alternative: stage everything under `.claude/` and the entry file names.* Rejected. It hardcodes one
adapter's paths into init and would stage operator files that happen to be there when init runs in a
directory that already has a repository (`toplevel.kind === 'this-dir'`).

### D3: Init generates rather than printing a next step

The rejected option is the issue's own fallback: keep init minimal, and make its output say that
`ctxr adapters generate` (or `ctxr update`) must run before the harness is configured. That case is
stronger than it first looks, so it is set out in full first.

**The case for keeping init minimal:**

1. **The spec gives adapter outputs to update.** `harness-portability` lists adapter outputs only
   under the update command, and names skills and entry-document sections as `init`'s obligations.
   Under the current spec, an init that does not generate is not in violation. Init scaffolds and
   update renders, and each has one job.
2. **Committing a harness file into a harness-portable store is a real choice.** A store's premise is
   that any harness can operate it. A committed `CLAUDE.md` is one vendor's file in every clone, and
   the next operator, on Codex or a human at a terminal, inherits it. The portability integration test
   treats "no `CLAUDE.md` in the session worktree" as the clean case worth asserting. Leaving the file
   out of the commit keeps the initial commit vendor-neutral.
3. **A printed step is zero-risk.** It changes no file and no commit. It cannot fail an `init` that
   works today, for example in a directory that already has a repository, where init's commit
   composition matters more.
4. **Init's commit becomes larger and harder to describe.** Every adapter output is another entry
   whose presence depends on the selection.

**Why it still loses:**

1. **The spec point is about wording, not about behavior anyone wants.** The requirement says init
   writes skills because that was the case worth stating when it was written. The init-harness
   requirement asks the operator which harnesses to target, and an answer that has no effect is
   the defect. This change amends the spec in the same delta, which is what proposals are for.
2. **The store already commits the harness choice.** The bootstrap commit already holds the
   `.claude/skills` bridge, a Claude-Code-specific path, and the declared adapter in
   `contexture.yaml`. `CLAUDE.md` adds one managed import line to a choice that is already
   recorded. It duplicates no canonical content (the "entry file only imports" requirement, enforced
   by `doctor`). It is not vendor lock-in. An operator who drops the harness edits the configuration
   and deletes the file, exactly as for the bridge. Any store that has run `update` is already headed
   for committing it, because `update` writes it and the session flow commits what `update` changed. Keeping it out of the initial commit
   only delays the same commit to whoever runs `update` first, and puts it in a PR that has nothing
   to do with it.
3. **A printed step is an instruction, and this project prefers checks to instructions.** The
   project's own rule is that the CLI verifies with "checks that fail, not instructions that decay".
   Non-interactive init has no reader for the message: provisioning scripts, the container image,
   and tests. The doctor check skips an absent entry file, so nothing would back the message either.
   The likeliest outcome is the one in the issue: an operator who never sees it, and a harness that
   never loads the conventions.
4. **Even with the message, init on an existing store would still diverge from update.** The
   already-initialized path would also have to print the message or call the generator. Calling the
   generator is D1, and D1 alone already makes the case for one shared step.
5. **The commit composition worry is bounded by D2.** Only paths the generator reports as written are
   staged, so the commit grows by exactly the files that already appear after the first `update`.

The minimal option would fit a tool whose harness files are local, untracked state. contexture's are
not: they are contexture-owned files that `update` already maintains and the session flow already
commits. Init generates them.

*Middle option: generate the file but leave it untracked.* Rejected. Init would end with a dirty
working tree, the first session worktree would lack the file (worktrees carry only committed content),
and the first PR to touch the store would commit it as a side effect.

### D4: The fresh path is not folded into `reconcileStore`

Considered: fresh init writes the configuration, the seeds and the layer gitkeeps, calls
`reconcileStore`, and stages `changed`. That would remove the parallel lists entirely.

Not done here, for three reasons:

- The fresh path's section order relies on call order, and the reconcile relies on
  `reorderFencedRegionsInFile`. The two converge today, but only by that reorder step.
- The note templates are staged but missing from `created`, an existing discrepancy that a unification
  would have to resolve one way or the other.
- The reconcile also does work that is redundant but harmless on a fresh store, such as removing
  retired fences.

Each of these is a behavior question in its own right, outside this issue. The new requirement, "a
freshly initialized store is already current", is enforced by a test that runs `update` straight after
`init`. That test catches drift between the two paths for any owned file. It makes the unification a
safe refactor later rather than a precondition now.

### D5: `init` on an existing store keeps its reporting shape

Init on an existing store returns `created: []` and drops the reconcile's `changed`. It will now also
silently write a missing `CLAUDE.md`. Changing what it reports would change the `InitData` contract
for one case, and `ctxr update` already exists to report changes. The behavior is left as it is.

## Risks / Trade-offs

- **[The portability integration test asserts no `CLAUDE.md` in a session worktree]** That assertion
  held only because the test never committed the file. After this change, `init` commits it.
  → The test's real property is "verify passes with no harness entry file". It is kept by deleting
  the entry file from the worktree before `verify`, so the same isolation is now produced explicitly
  instead of by accident. The spec requirement it backs is about the harness home directory, not
  store files, so the spec is unchanged.
- **[`reconcileStore` now writes the harness entry file in every caller]** Its callers are update,
  update --worktree and init-on-existing, and all three should write it. → Its direct unit tests in
  `test/unit/agents-doc.test.ts` build a config with the default adapter. They may now see `CLAUDE.md`
  appear, which they do not assert against. Check them during implementation.
- **[An operator's hand-written `CLAUDE.md` in a directory init adopts]** The generator only upserts
  its fenced region and keeps surrounding content. That behavior is already tested
  (`adapters-generate-command.test.ts`, the hand-written-text case). The file is then staged in the
  initial commit with the operator's text in it. → This is the same outcome as the first `update`
  today, one step earlier. Nothing is lost, and the commit is local and unpushed.
- **[README drift]** The quick start teaches the extra step, and the on-disk listing shows retired
  write-gate files. → Corrected in this change (tasks section 4).

## Migration Plan

None. No store needs action. A store initialized by an earlier release and missing its entry file gets
it on the next `update`, as it would today, or now also on the next `init`. Rollback is a revert. The
only stored effect of the new behavior is a committed `CLAUDE.md`, which earlier releases would also
have written on their first `update`.
