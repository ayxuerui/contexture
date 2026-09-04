## Context

`src/commands/verify.ts` (183 lines) is one exported `execute(store, _flags)` that pushes
`VerifyStepResult`s onto an array and returns at the first failure via a shared `finish()`. Its five
steps are all in-process: `readCatalogSection`, `buildGraphFromNotes` + `writeGraph`,
`readFencedRegionFromFile` per managed fence, `checkAgentsMdDrift`, and `scanSkills` + `readFile`. The
`VerifyFlags` interface exists and `src/run.ts:592-601` wires `--portable` into it; the parameter is
named `_flags` and is never read.

The isolation the flag names is argued in the file's header comment rather than performed. That
argument currently holds — `grep -rn "homedir\|process\.env" src/` returns nothing outside
`src/core/env.ts`, which is the sole DI seam (`RunEnv`, `src/core/env.ts:19`) — but nothing keeps it
holding.

Two pieces of plumbing this change needs do not exist yet:

- `src/core/git/worktree.ts` has `addWorktree` (`:22`), which always passes `-b <newBranch>`. A
  portability test wants a detached checkout of a commit, and there is no `worktree remove` helper at
  all.
- `gh` is spawned nowhere in `src/`. The comment at `src/core/publish/script-check.ts:17` cites an
  `adapters/forge/github.ts` "applying the same discipline to gh"; that file does not exist. `gh` is
  driven by the *agent* following `templates/skills/ctxr-submit.md` and `ctxr-land.md`, not by the CLI.
  So the new step resolves `gh` on `PATH` for the first time in this codebase, and there is no existing
  spawn site whose discipline it must join.

The spawn precedent to follow is `src/core/publish/script-check.ts` — one dedicated module per external
program, `process.execPath` for re-entering node, never an ad hoc `execFile` inside a command.

See proposal.md for why this changes; this document covers how.

## Goals / Non-Goals

**Goals:**
- Make `--portable` mean something, using a mechanism a reader can point at rather than a comment.
- Keep bare `ctxr verify` byte-for-byte behaviorally identical, so nothing that runs it today changes.
- Add only operations that can fail for a real reason — no step whose assertion is "produced output".
- Leave the in-process isolation argument standing, but pinned by a test rather than by memory.

**Non-Goals:**
- Isolating bare `verify`. See proposal.md's non-goals.
- Any store-declared tool name, install action, `$HOME` write, or retrieval-quality assertion. See
  proposal.md's non-goals; each is a boundary this change deliberately does not cross.

## Decisions

### D1. `--portable` re-executes the CLI in a child process, rather than isolating in-process

Re-exec is the only mechanism that actually produces the property. Scrubbing `process.env` in-process
would mutate global state shared with the parent, would not survive a library consumer calling
`execute()` directly, and could not change the store root the already-constructed `Store` points at.

The child is launched as `process.execPath` + `process.argv[1]` — never a `PATH` lookup for `ctxr`.
This matters precisely because the environment is scrubbed: a `PATH`-resolved `ctxr` under a modified
environment could be a *different* installation than the one under test, and the test would silently
verify the wrong binary. That failure mode is exactly the one the downstream script hit twice (its lint
check "would have silently tested the WRONG store while still reporting PASS").

Child invocation: `verify --json --root <worktree>`, with `HOME` and `USERPROFILE` pointed at a fresh
empty temp directory, `CONTEXTURE_ROOT` and `XDG_*` deleted, and `GIT_CONFIG_GLOBAL=/dev/null`. `PATH`
is preserved — the prerequisites step needs it, and `PATH` is the thing under test there, not the thing
being isolated from.

The child runs bare `verify` (no `--portable`), so the recursion terminates by construction.

### D2. `--portable` verifies the recorded commit, not the working tree

This is the semantic difference that justifies the flag existing, and it is the property "clone this
store and drive it" actually needs. `git worktree add --detach <tmp> HEAD` gives a checkout of exactly
what is committed.

The consequence is real and must be reported rather than hidden: `--portable` can pass while
uncommitted work is broken, and can fail while the working tree is fine. So the envelope carries the
verified commit sha, and the human summary names it. Bare `verify` keeps working-tree semantics, which
is what makes the pair useful — one checks what you have, the other checks what you would ship.

This also disposes of a wart for free: `verify` calls `writeGraph` (`verify.ts:86`), so today it
mutates the very store it is verifying. Under `--portable` that write lands in the disposable worktree
and the live store is untouched. Bare `verify` keeps writing to its declared derived cache — that write
*is* the derived-artifact-build operation, and removing it would weaken the step to a no-op.

### D3. Two new operations, and one deliberately not ported

**Added — write-path gate.** The step calls `sanctionedPath` with a path that resolves outside the
store and asserts a refusal carrying a reason. The operation under test is "the gate ran and produced a
verdict", not "the answer was yes" — in-process that is a returned value, so none of the exit-code
juggling a shell version needs appears.

The rule exercised is deliberately the symlink-escape one, which `sanctionedPath` enforces
unconditionally. Its sibling, the sanctioned-location rule, engages only once
`write_lifecycle.writable_paths` is declared, so a step built on that half would pass vacuously on a
default store — present in the output, proving nothing. There is no `skip` case: the gate reads config
and a path, and needs no notes.

This replaces the disclosure-gate step this design originally specified. `evaluateDisclosure` was
deleted with the access axes (`retire-the-access-axes`), and the write-path gate is the refusal
mechanism that survived it. Without some gate in the set, every exercised operation is a happy path and
nothing in the portability test confirms the store still refuses what it should.

**Added — write-path prerequisites.** Resolve `gh` on `PATH` via `fs.access(X_OK)`. Contexture ships
`ctxr-submit` and `ctxr-land` as owned skills that drive `gh pr create` / `gh pr merge`; on a machine
without `gh` the first signal today arrives after `git push` has already run, leaving a pushed branch
and no pull request. Presence only — nothing is executed, and `gh auth status` is specifically not run
(see proposal.md's non-goals).

**Not ported — a graph query step.** The downstream script's version asserted `grep -q "."` over the
query's output, which passes on any byte including an empty envelope. A step that cannot meaningfully
fail is worse than no step: it costs runtime and buys a false sense of coverage. The derived-artifact
build step already proves the graph is constructible.

### D4. The prerequisites step belongs to `verify`, not to `lint` or `doctor`

This was the least obvious call, and the alternatives are worth recording:

- **`lint`** is scoped by `context-organize/spec.md:28` to content-quality observations over notes —
  orphans, catalog gaps, broken links, uningested material — and `store-integrity/spec.md:5` *defines*
  lint by that contrast with doctor. A binary-presence probe is not a note observation; putting it in
  lint would silently widen lint's subject matter from the store's content to the store's environment.
- **`doctor`** is the pre-commit gate and the gate `ctxr-submit` may not proceed past. An invariant
  that fails when `gh` is absent would fail `ctxr doctor` in any CI container on a store that is
  perfectly healthy, and would make `--no-verify` routine — which corrodes the staged checks that
  actually matter. store-integrity's rule that each condition is classified exactly once also means it
  cannot be hedged into both.
- **`verify`** already answers "is this store drivable from this environment?" — which is the question,
  and is precisely the question the downstream bootstrap script existed to answer. It is run at
  bootstrap and in CI, which is when a missing prerequisite is actionable.

### D5. One new module owns the re-exec

`src/core/harness/isolated-run.ts` holds the worktree setup, the environment scrubbing, the spawn, the
envelope parse, and the cleanup. `verify.ts` calls it and maps the result. Putting the spawn inline in
`verify.ts` would add a second scattered `child_process` site, which the single-source-literals guard
exists to prevent.

`src/core/git/worktree.ts` gains `addDetachedWorktree(git, cwd, worktreePath, commit)` and
`removeWorktree(git, cwd, worktreePath)`, alongside the existing `addWorktree`. Both go through
`GitRunner`, so git stays spawned from exactly one place.

## Risks / Trade-offs

- **[Risk] A crash between worktree creation and cleanup leaves a registered worktree behind.**
  → Mitigation: `removeWorktree --force` plus `git worktree prune` in a `finally`. The integration test
  asserts `git worktree list` has exactly one entry after a run, including the failing-verify case.
- **[Risk] Running `--portable` from inside a linked worktree adds a nested worktree, or adds it in the
  wrong place.** → Mitigation: resolve the main worktree first (`mainWorktreePath`, already in
  `src/core/git/worktree.ts:76`; `isLinkedWorktreeRoot` at `src/core/git/repo.ts:51` detects the case).
  Tested explicitly, because contexture's own session model puts every write in a linked worktree, so
  this is the *common* path, not the edge case.
- **[Risk] An unborn HEAD has no commit to check out.** → Mitigation: refuse with the usage exit code,
  naming that there is no commit to verify, rather than emitting a confusing git error.
- **[Risk] `--portable` becomes seconds rather than milliseconds.** → Accepted: it is a bootstrap and CI
  command, and this is the reason it stays behind a flag instead of becoming `verify`'s default.
- **[Risk] Scrubbing `HOME` without scrubbing `USERPROFILE` is a no-op on Windows**, so the test would
  pass while isolating nothing. → Mitigation: both are set, and the assertion is positive — the
  integration test checks the temp home is *empty afterwards*, proving nothing wrote to it, rather than
  merely checking the variable was set.
- **[Trade-off] The `verify --json` envelope gains a `'skip'` status and a commit field.** Additive per
  cli-contract, but any consumer exhaustively switching on `status` sees a new value. Accepted: `skip`
  already exists in the check registry's vocabulary (`CheckStatus`), so this aligns `verify` with a
  shape the rest of the tool already emits.
- **[Trade-off] The prerequisites step hardcodes `gh`.** If a second tool ever qualifies, the honest
  move is another hardcoded entry, not a config key — the moment the list comes from `contexture.yaml`
  it is the trust boundary this change's non-goals refuse.

## Migration

None. No configuration key, no store file, no behavior change to any command a store runs today. A
store gets the new behavior by upgrading the CLI and passing a flag that previously did nothing.

## Open Questions

- Should `verify --portable` fetch before checking out, so it verifies the remote's tip rather than the
  local commit? Deliberately not doing so here: it would make a verification command network-dependent,
  and "what I would ship" is the local commit. Worth revisiting only if a store reports the local-commit
  semantics being misleading in practice.
