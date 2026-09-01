## Context

`ctxr session land` (`src/commands/session-land.ts`) is one linear state machine: resolve a target branch, read its pull request, gate and merge, synchronize the default branch, optionally reap the worktree. Every step re-reads live state so a retry is just running the command again (D1 of the archived `session-submit-and-land` change). That property is preserved here — this change fixes *what* two of those steps point at, not how they sequence.

Mechanics this design builds on rather than around:

- `listWorktrees` / `parseWorktreeList` (`src/core/git/worktree.ts`) already parse `git worktree list --porcelain`, which always emits the repository's main worktree as its first block. The reap step already calls it.
- `PullRequestState.headBranch` (`src/adapters/forge/types.ts`) is already returned by every forge adapter and already read by the head-mismatch check — the target-resolution fix consumes a field that exists.
- `resolveExistingRoot` (`src/core/root.ts`) walks up from `env.cwd` for `contexture.yaml`. Inside a session worktree that file is present, so `store.root` is the worktree. This is correct for every write command and is why landing cannot use `store.root` to mean "the clone".
- `RunEnv.cwd` (`src/core/env.ts`) is the invoking directory, distinct from `store.root`, and is already threaded into every command.

## Goals / Non-Goals

**Goals:**

- `ctxr session land --pr <n> --yes --reap` succeeds from the canonical clone, which is where an agent must stand for a reap to be possible.
- The same command from inside the session worktree merges, synchronizes the clone, and reports exactly one skipped step with a reason and a retry location.
- No step's guarantee weakens: fast-forward only, never a checkout/reset/force; reap only a clean, merged, `session start`-created worktree; the gate unchanged.

**Non-Goals:**

- Detecting a canonical clone that is not the git main worktree (a bare repository with only linked worktrees, or `session.workspaces_external` pointing worktrees outside the store). See Open Questions.
- Reporting *which* checkout the command ran from in the JSON outcome. The summary names the canonical clone in the one message where it matters (the reap refusal); adding a field to `SessionLandData` for it is unused surface.

## Decisions

### D1: `--pr` is a target selector, not a filter over the current checkout

Resolution becomes: `--branch` if given; otherwise the pull request's head branch if `--pr` is given; otherwise the branch checked out at `store.root`. The three cases are mutually exclusive and decided before anything else runs.

The default-branch refusal then applies to the *resolved* target, which preserves both properties the current code conflates. When the target came from `--branch` or from the invoking checkout, the refusal still fires before any forge call — the existing "refuses to land the default branch, before any forge call" test stays green unchanged. When it came from `--pr`, the head branch is only knowable after a read, so the refusal fires after that read and before the gate; a read is not a side effect, and the consent check (which genuinely must precede any forge contact) already runs first, ahead of all of this.

The head-mismatch check (`PullRequestHeadMismatchError`) applies only when the target was named independently of the pull request — `--branch` or the invoking checkout. When the target *is* the head branch, there is nothing to mismatch, and keeping the check would compare a value against itself.

Alternative considered: keep the current resolution and simply exempt `--pr` from the default-branch refusal. Rejected — the target would still be the invoking checkout's branch, so the reap step would look for the wrong worktree and the head-mismatch check would reject every cross-checkout invocation. The bug is that `--pr` never reaches resolution, not that the guard is too strict.

### D2: One canonical-clone primitive, derived at the point of use

Add `mainWorktreePath(git, cwd): Promise<string>` to `src/core/git/worktree.ts`, returning the first entry of `listWorktrees` — the main worktree, per `git worktree list --porcelain`'s documented ordering — and falling back to the passed `cwd` if the list is empty or unparseable, so a repository without linked worktrees behaves exactly as today. Synchronization takes that path: `currentBranch`, `hasRemote`, `fetchOrigin`, and `merge --ff-only` all run with `cwd` set to the clone, and the skip reasons say "the canonical clone" instead of "root checkout". `removeWorktree`/`deleteBranch` run there too, so a reap invoked from a third worktree does not operate through an unrelated checkout.

Alternative considered: `git rev-parse --git-common-dir` and take its parent. Rejected — it is a second way to ask the same question, it is wrong for a bare repository or a `.git` file indirection, and `listWorktrees` is already called on the reap path.

Alternative considered: make `resolveExistingRoot` return the clone. Rejected in the proposal's Non-Goals — it would break every command that must act on the session worktree.

### D3: The reap self-reference guard keys off the invoking cwd, not the store root

Today the guard compares the target worktree against `store.root`, which only coincides with "the directory I am running in" because root resolution walks up from the cwd. Once synchronization stops using `store.root` as "the clone", the guard should say what it actually means: refuse when `env.cwd` *is* the target worktree or lies inside it. The message names the canonical clone's path, so the retry is a directory the agent can read straight out of the report.

This keeps the existing behavior for the case the current test covers (invoked from inside the worktree, even after a branch rename) and adds the case that was silently broken: invoked from a *different* session worktree, where the reap is safe and now proceeds.

### D4: Every unperformed step reports its reason

`outcome()` currently formats `attempted ? 'skipped: ' + reason : 'not attempted'`, which discards a reason that the `SyncOutcome`/`ReapOutcome` already carry. Print `skipped: <reason>` whenever a reason exists and reserve bare `not attempted` for the reasonless case. The JSON shape is untouched — `attempted` still distinguishes "decided not to" from "tried and failed", which the summary was overloading into its own wording.

## Risks / Trade-offs

- **[Risk]** `--pr <n>` from any checkout now merges that pull request without the invoking branch acting as a second confirmation. **Mitigation**: the gate still prints the number, title, url, state and mergeability and requires an interactive confirmation or an explicit `--yes` — the same consent this command has always required; what disappears is a coincidental guard that rejected the *correct* invocation more often than a wrong one.
- **[Risk]** Synchronizing a clone the caller is not standing in makes `land` touch a checkout the operator may have left mid-work. **Mitigation**: the operation is unchanged and remains fast-forward only, on a clone that must already be on the default branch; anything else is reported and left alone. A dirty clone on the default branch cannot lose work to a fast-forward.
- **[Trade-off]** The default-branch refusal now fires after a forge read on the `--pr` path, so the guarantee "refuses before contacting the forge" narrows to the two paths where the branch is known locally. Accepted, and stated in the requirement rather than left implicit: a pull-request read changes nothing, and the case it costs (a `--pr` naming a pull request whose head is the default branch) is pathological.
- **[Trade-off]** One existing unit test changes meaning rather than being added to: landing from inside a session worktree previously asserted `sync: { attempted: false, reason: 'root checkout is not on the default branch' }`. That assertion was pinning the defect. It becomes an assertion that the canonical clone is synchronized and only the reap is skipped.

## Open Questions

- Should `land` fail loudly when the canonical clone cannot be identified (an empty or unparseable `worktree list`), instead of falling back to the invoking checkout? Deferred: the fallback reproduces today's behavior exactly, and no reported store has hit the case.
- Should `session reap` also enumerate and operate through the canonical clone? Left out here (proposal Non-Goals) so this change stays reviewable as a landing fix, but the `mainWorktreePath` helper is placed where `session reap` can adopt it without moving.
