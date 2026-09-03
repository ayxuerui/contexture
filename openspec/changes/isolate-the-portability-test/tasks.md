## 1. Git worktree plumbing

- [x] 1.1 `src/core/git/worktree.ts`: `addDetachedWorktree(git, cwd, worktreePath, commit)` running `worktree add --detach <path> <commit>`, beside the existing `addWorktree` (`:22`, which always passes `-b` and so cannot produce a detached checkout)
- [x] 1.2 `src/core/git/worktree.ts`: `removeWorktree(git, cwd, worktreePath, { force })` running `worktree remove --force <path>`, and `pruneWorktrees(git, cwd)` running `worktree prune` — no such helper exists today
- [x] 1.3 `src/core/git/worktree.ts`: `resolveHead(git, cwd)` returning the commit sha, or `null` on an unborn HEAD, so the refusal in 3.2 is a value check rather than a caught git error
- [x] 1.4 `test/unit/worktree.test.ts`: extend for the three new helpers against a real temp repo — detached add produces a checkout at the named commit; remove leaves `worktree list` with one entry; `resolveHead` returns `null` before the first commit
- [x] 1.5 `npx vitest run test/unit/worktree.test.ts` green

## 2. The isolated-run module

- [x] 2.1 `src/core/harness/isolated-run.ts` (new): `runIsolatedVerify(git, storeRoot, env)` — resolves the main worktree (`mainWorktreePath`, `:76`) so a run from inside a linked worktree registers the disposable checkout against the main repo; creates a temp dir for the checkout and a second, empty temp dir for the scrubbed home
- [x] 2.2 Same module: build the child environment from the injected `RunEnv.env` — `HOME` and `USERPROFILE` set to the empty temp dir, `CONTEXTURE_ROOT` and every `XDG_*` key deleted, `GIT_CONFIG_GLOBAL=/dev/null`, `PATH` preserved (the prerequisites step needs it; `PATH` is the subject of that step, not what the run isolates from)
- [x] 2.3 Same module: spawn `process.execPath` with `[process.argv[1], 'verify', '--json', '--root', <checkout>]` — never a `PATH` lookup for `ctxr`, since a scrubbed environment could otherwise resolve a different installation and the run would verify the wrong binary (D1). The child runs bare `verify`, so recursion terminates by construction
- [x] 2.4 Same module: parse the child's envelope, return its steps plus the verified commit sha; `finally` block removes the checkout with `--force`, prunes, and deletes both temp dirs — reclaim must survive a failing child, not just a passing one
- [x] 2.5 `test/unit/isolated-run.test.ts` (new): the constructed child environment has `HOME` repointed, `CONTEXTURE_ROOT` and `XDG_*` absent, and `PATH` intact — asserted on the env object, so no spawn is needed
- [x] 2.6 `npx vitest run test/unit/isolated-run.test.ts` green

## 3. Wire `--portable`

- [x] 3.1 `src/commands/verify.ts`: `execute(store, flags)` — stop naming the parameter `_flags`; when `flags.portable`, delegate to `runIsolatedVerify` and map its steps onto this command's `VerifyData`, adding the verified commit to `data`
- [x] 3.2 Same file: refuse an unborn HEAD in portable mode with `ExitCode.Usage`, naming that there is no commit to verify, before any checkout is created
- [x] 3.3 Same file: add `'skip'` to `VerifyStepResult['status']`; `finish()` treats only `'fail'` as failing, so a skipped step never changes the exit code
- [x] 3.4 Same file: `humanSummary` names the verified commit in portable mode, so nobody reads a portable pass as a statement about the working tree (D2)
- [x] 3.5 `src/run.ts`: reword `--portable`'s option description to state that it verifies the recorded commit in a disposable checkout with a scrubbed environment — the current text ("the portability test: a retrieval query, a derived-artifact build, and following one skill") describes bare `verify`'s steps and predates both this change and the removal of the skill index
- [x] 3.6 `npx vitest run test/unit/verify-command.test.ts` green

## 4. The two new operations

- [x] 4.1 `src/commands/verify.ts`: write-path gate step calling `sanctionedPath` with a path that resolves outside the store; passes on a refusal carrying a reason. Exercise the symlink-escape rule, not the sanctioned-location one, which is inert until `writable_paths` is declared and would pass vacuously (D3). No `skip` case — the gate needs no notes
- [x] 4.2 `src/core/environment/probe.ts` (new): `resolveOnPath(command, env)` — `fs.access(X_OK)` across the injected `PATH`, returning the resolved path or `null`. Reads `PATH` from the passed environment, never `process.env`, so tests fake it without touching the real one. Nothing is executed
- [x] 4.3 `src/commands/verify.ts`: write-path prerequisites step resolving `gh` — the tool `templates/skills/ctxr-submit.md` and `ctxr-land.md` invoke. Hardcoded name; no `gh auth status`; no configuration input (D4, and proposal.md's non-goals)
- [x] 4.4 `test/unit/environment-probe.test.ts` (new): found / absent / present-but-not-executable / empty `PATH` / unset `PATH` / first-match-wins across multiple entries, using a stub written into a temp dir and `makeFakeEnv({ env: { PATH: tmp } })` — nothing global is mutated, so the suite stays parallel-safe
- [x] 4.5 `test/unit/verify-command.test.ts`: step count and order; a store with `writable_paths` undeclared still fails the escaping path, proving the step is not inert on a default store; a store whose graph build fails stops there and runs no later step
- [x] 4.6 `npx vitest run test/unit/verify-command.test.ts test/unit/environment-probe.test.ts` green

## 5. Pin the invariant the in-process argument rests on

- [x] 5.1 `test/unit/single-source-literals.test.ts`: assert `process.env` appears in no `src/` module except `src/core/env.ts`, and that the `child_process` importers are exactly `core/git/exec.ts`, `core/publish/script-check.ts` and `core/harness/isolated-run.ts` — turning "nothing reads harness state" from a header comment into a failing test
- [x] 5.2 Fix the stale cross-reference at `src/core/publish/script-check.ts:17`, which cites `adapters/forge/github.ts` as gh's spawn site; no such file exists and nothing in `src/` spawns `gh`
- [x] 5.3 `npx vitest run test/unit/single-source-literals.test.ts` green

## 6. End-to-end verification

- [x] 6.1 `test/integration/verify-portable.test.ts` (new): on a real initialized store with a commit — `ctxr verify --portable --json` exits 0 and its envelope names the HEAD sha; `git worktree list` has exactly one entry afterwards; the scrubbed home directory is empty afterwards
- [x] 6.2 Same file, red path: commit a store with a managed `AGENTS.md` fence removed → exits 3, names that operation, and the envelope contains no step after it; `git worktree list` still has one entry, proving cleanup survives a failure
- [x] 6.3 Same file: unborn HEAD → exits 2 and creates no checkout; and a run launched from inside a linked worktree succeeds, registering the disposable checkout against the main repo (the common path under contexture's own session model, per Risks)
- [x] 6.4 Same file: an uncommitted edit that breaks an operation does not affect `--portable`, while bare `ctxr verify` reports it — the pair that demonstrates D2
- [x] 6.5 `npm test` — full suite green
- [x] 6.6 `npx openspec validate isolate-the-portability-test --strict` passes
