## Why

Landing one reviewed session on a real store took four invocations of `ctxr session land` to do what the command advertises as one:

| invocation | outcome |
| --- | --- |
| `land --pr 167 --yes --reap`, from the canonical clone (on `main`) | refused: `"main" is the store's default branch` |
| the same command, from inside the session worktree | `PR #167 merged; sync not attempted; reap skipped: cannot remove the worktree this command is currently running from` |
| the same command, from the canonical clone again | refused again |
| `land --pr 167 --branch session/… --yes --reap`, from the canonical clone | `PR #167 merged; sync ok; reap ok` |

Three defects produced that sequence, and each one is a gap between what `write-lifecycle` already requires and what `src/commands/session-land.ts` does:

1. **`--pr` does not select a target.** The target is computed as `flags.branch ?? currentBranch(store.root)`, so `--pr` never reaches branch resolution: the default-branch refusal fires on the branch of the checkout the agent is standing in. That makes `--pr <n>` alone unusable from the canonical clone — the only place `--reap` can succeed — even though the flag's own help calls it "the pull request number to land".
2. **"the root checkout" is really "whatever checkout ctxr ran from".** Root resolution walks up from the cwd for `contexture.yaml`, which exists in every session worktree, so inside a session `store.root` *is* that worktree. Synchronization then finds a checkout that is not on the default branch and silently does nothing, and `--reap` finds itself and refuses. The spec already says the canonical clone is "the one the default branch is checked out in" and that landing synchronizes "the root checkout"; the implementation's own comment ("in whatever checkout this command runs from") records the drift, and a unit test currently pins it.
3. **A skipped step does not say why.** The human summary prints a reason only for steps it attempted, so a no-op synchronization reads as bare `sync not attempted` — while the shipped `ctxr-land` skill instructs the agent to report "synced or not (with why not)". The reason exists on the JSON outcome and is dropped on the way to the summary.

Together these mean the documented happy path — land a reviewed session in one gated command — is reachable only by an operator who already knows to pass a redundant `--branch` and to stand in the right directory. The skill never says where to run the command from, which is the single fact that decides whether two of its three steps do anything at all.

## What Changes

- `ctxr session land` resolves its target first and from the flag that names it: `--branch` outright, `--pr` by way of the pull request's head branch, and only otherwise from the invoking checkout. The default-branch refusal applies to the resolved target, so a pull request named by number lands from anywhere, and a pull request whose head *is* the default branch is still refused.
- Synchronization and reaping act on the store's canonical clone — the repository's main worktree — rather than on whichever checkout the command was invoked from. Landing from inside a session worktree now fast-forwards the clone instead of silently skipping.
- `--reap` refuses exactly one case: the worktree the command is running from, identified by the invoking cwd rather than by the resolved store root, and the refusal names the canonical clone as the place to retry.
- The human summary carries the reason for every step it did not perform, not only for the ones it attempted.
- The shipped `ctxr-land` skill names the target explicitly and states where a reap must run from, so the prose matches a command that now behaves the same way from every checkout.

No new flag, no new command, no change to the gate, the merge methods, the conflict stop, or the fast-forward-only guarantee.

## Capabilities

### New Capabilities

_None._ Every change lands inside `write-lifecycle`'s existing landing requirement and `harness-portability`'s existing owned-skills requirement.

### Modified Capabilities

- `write-lifecycle`: the landing requirement gains target resolution as an explicit first step, names the canonical clone (not the invoking checkout) as what synchronization and reaping act on, scopes the reap refusal to the running-from case, and requires every unperformed step to carry a reason.
- `harness-portability`: the owned-skills requirement adds that the rendered land skill names its target explicitly and states that a reap cannot remove the worktree the command runs from.

## Non-Goals

- **Letting `--reap` remove the worktree it is running from.** Git can do it, but it strips the caller's working directory out from under an interactive shell. The conservative refusal stays; what changes is that the rest of the command now succeeds around it and the message says where to retry.
- **Changing root resolution.** `resolveExistingRoot` must keep returning the worktree an agent is working in — `session submit` and every write command depend on it. The canonical clone is derived where it is needed (landing), not made the store root everywhere.
- **Teaching `session reap` the same lessons.** It already runs from wherever it is invoked and enumerates worktrees from the store root; whether it should also target the canonical clone is a separate question, deferred until this change's canonical-clone primitive exists to reuse.
- **Enforcing that an agent passes `--branch`/`--pr`.** The command can only be made to behave correctly from every checkout, which is what this change does; the skill prose is a convention, and the assertable guarantee is the rendered skill's content, not the agent's compliance.
- **Any change to `session submit`, the gate, or the forge adapter interface.** The forge is read for a head branch it already returns (`PullRequestState.headBranch`); nothing new is requested of an adapter.

## Impact

Affected code:
- `src/commands/session-land.ts` — target resolution, canonical-clone synchronization, the cwd-scoped reap guard, and the summary's reason handling.
- `src/core/git/worktree.ts` — one new helper returning the main worktree's path, built on the existing `listWorktrees`/`parseWorktreeList`.
- `src/core/errors.ts` — the default-branch refusal's message, so it reads correctly when the branch came from a pull request rather than from the current checkout.
- `templates/skills/ctxr-land.md` — the shipped prose.
- Tests: `test/unit/session-land.test.ts` (one existing case changes meaning: landing from inside the worktree now synchronizes), `test/unit/skills.test.ts` and `test/integration/owned-skills.test.ts` (skill body assertions).

Affected stores: none require migration. `schema_version` is unchanged and no config key is added. Existing invocations keep working — `--branch` still wins, and a bare `ctxr session land` from a session worktree behaves as before except that it now also synchronizes the canonical clone. Stores pick up the new skill prose on their next `ctxr update`.
