## MODIFIED Requirements

### Requirement: Writes happen in a CLI-managed session worktree
`contexture session start` SHALL create an isolated git worktree checked out from a freshly fetched default branch, and SHALL report that worktree's path as the location where subsequent work should happen. The store's canonical clone (the one the default branch is checked out in) SHALL NOT be handed out as a working location for a session.

#### Scenario: A session gets its own worktree
- **WHEN** `contexture session start` is run
- **THEN** it creates a new git worktree on a new branch and prints that worktree's path, distinct from the canonical clone's path

#### Scenario: Concurrent sessions do not collide
- **WHEN** two `contexture session start` invocations run one after another without either reaching the default branch first
- **THEN** each receives its own distinct worktree and branch, and work in one does not block or corrupt work in the other

## REMOVED Requirements

### Requirement: Session submission validates, commits, pushes, and opens review
**Reason**: `contexture session submit` is removed. Its validation pass duplicated `ctxr doctor`'s store-scope check pass exactly; its commit/push/pull-request sequencing is now the `ctxr-submit` skill driving `git` and `gh` directly. The requirement that nothing pushes directly to the default branch does not depend on this command — it is carried by the pre-push hook, asserted in this same capability's "Nothing commits to the default branch directly" requirement, unchanged.
**Migration**: Run `ctxr doctor` for store-scope validation, then `git add`, `git commit`, `git push`, and `gh pr create` as instructed by the rewritten `ctxr-submit` skill.

### Requirement: A session can be landed end-to-end
**Reason**: `ctxr session land` is removed. Its state machine (resolve target, read pull-request state, gate, merge, confirm, synchronize the canonical clone) was tested only against a mocked forge and a mocked git runner — it asserted its own behavior against synthetic inputs, not anything a user experienced. The decisions worth keeping (re-query on unknown mergeability before stopping, read state back after merging rather than trusting the merge command's exit code, refuse a pull request whose head does not match the requested branch, refuse the default branch as a target) move into the `ctxr-land` skill as explicit steps. The gate itself was never mechanical: an agent that could decline to run this command could equally decline a skill step, and `--yes` bypassed the interactive confirmation entirely — custody of the gate was always the skill's.
**Migration**: Follow the rewritten `ctxr-land` skill: `gh pr view <n> --json number,url,title,state,mergeable,headRefName` to resolve and check the target, an explicit go before `gh pr merge`, a state re-read to confirm the merge, then `git fetch origin && git merge --ff-only origin/<default>` in the canonical clone to synchronize.

### Requirement: External workspace ownership disables worktree reclamation
**Reason**: `ctxr session reap`, the only command this requirement governed, is removed (see the `adapters` and `harness-portability` capability deltas in this change for the config key it disabled). Reap's own clean-and-merged pre-checks duplicated refusals `git worktree remove` and `git branch -d` already make unprompted — a dirty worktree or an unmerged branch was never actually at risk. The `session.workspaces_external` configuration key this requirement depended on is removed with it: an operator documenting that worktrees are externally managed now does so in an operator-authored file under the guidance directory, which the store's conventions-inlining mechanism surfaces in `AGENTS.md` — a fact stated in prose, which is what it always was.
**Migration**: Reclaim a session by hand: `git worktree remove <path>` and `git branch -d <branch>` for a merged, clean session (both refuse on their own if that is not the case); `git worktree remove --force <path>` and `git branch -D <branch>` to deliberately discard unmerged work. The rewritten `ctxr-session-lifecycle` skill's reclaiming section instructs both, behind its existing explicit-go gate, scoped by `ctxr session list`.

### Requirement: Submission can rename the session branch
**Reason**: This requirement existed only to give `ctxr session submit --branch <name>` a documented effect. With submit removed, renaming a session branch before it reaches the forge is `git branch -m <name>`, plain git with no session-specific behavior to specify.
**Migration**: Run `git branch -m <name>` before `git push`, as the rewritten `ctxr-submit` skill instructs.
