## MODIFIED Requirements

### Requirement: Submit and land are owned skills over git and gh
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL state the entry condition that admits it — an explicit operator request to wrap up, or the operator's own closing signal — alongside the anti-triggers that do not admit it, naming an agent's own judgment that its assigned task is finished as the chief one; that stated condition is what makes the absent confirmation below sound rather than assumed. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, run `ctxr doctor` for store-scope validation, and end in `git push` followed by `gh pr create` — without an intervening confirmation step, because the request to submit is itself the consent for both — and SHALL close by reporting the pull request and naming the target a subsequent land will need. The land skill SHALL name its target explicitly (never inferring it from the currently checked-out branch), read the pull request's state and mergeability with `gh pr view` before any side effect, gate the merge behind an explicit confirmation, merge with `gh pr merge`, confirm the forge reports merged before synchronizing, and route conflicting or unknown mergeability to the lifecycle skill's conflict playbook. The lifecycle skill SHALL cover start, re-scan, conflicts, sequencing, and reclaiming worktrees, and SHALL reference both skills without repeating their steps.

#### Scenario: Submit states what admits it
- **WHEN** the submit skill is rendered for a store
- **THEN** it carries an entry-condition section, positioned ahead of the procedure's first step, naming the operator request or closing signal that admits it and the anti-triggers that do not — including that having finished the assigned task is not a closing signal and that the agent's own summary is not one either

#### Scenario: Submit ends in git and gh, gated
- **WHEN** an agent follows the rendered submit skill
- **THEN** `ctxr doctor` runs before staging, the capture skill is invoked exactly once, and the branch rename is followed directly by `git push` and `gh pr create` with no confirmation step between them — the gate on this path is `ctxr doctor`, which submit may not proceed past, not a confirmation of the push itself

#### Scenario: Submit hands off with a target land can use
- **WHEN** an agent reaches the end of the rendered submit skill
- **THEN** it reports the pull request's number and url and names the target that landing it will take, without merging or invoking the land skill itself

#### Scenario: Land checks state before merging and confirms after
- **WHEN** an agent follows the rendered land skill
- **THEN** it reads the pull request's state and mergeability with `gh pr view` before merging, gates the merge behind an explicit confirmation, and re-reads state after `gh pr merge` to confirm the forge reports merged rather than trusting the merge command's exit code

#### Scenario: Land names its target explicitly
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target by branch name or pull-request number instead of relying on the current checkout

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header, driving `git` and `gh` rather than a `ctxr session` subcommand, and the lifecycle skill no longer contains the submit or land steps
