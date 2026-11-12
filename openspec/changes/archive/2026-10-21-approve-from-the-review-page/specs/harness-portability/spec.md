## MODIFIED Requirements

### Requirement: Submit and land are owned skills over git and gh
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL state the entry condition that admits it — an explicit operator request to wrap up, or the operator's own closing signal — alongside the anti-triggers that do not admit it, naming an agent's own judgment that its assigned task is finished as the chief one; that stated condition is what makes the absent confirmation below sound rather than assumed. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, run `ctxr doctor` for store-scope validation, and end in `git push` followed by `gh pr create` — whose body carries a Pages section, listing the preview and published address of every page the change set adds, modifies, moves or removes as reported by `ctxr publish urls`, with the condition under which a preview resolves, whenever that report is non-empty and omitting the section otherwise, and a Knowledge changes section that is the output of `ctxr graph diff --format markdown` pasted verbatim — the agent writes none of that section's text, adds nothing to it and removes nothing from it, so the body carries a record of the change's effect on the store that names its commits and the command reproducing it — without an intervening confirmation step, because the request to submit is itself the consent for both — and SHALL close by reporting the pull request, naming the target a subsequent land will need, and, when the store declares change approval, the pull request's approval page address under `serve.base_url`. The land skill SHALL name its target explicitly (never inferring it from the currently checked-out branch), read the pull request's state and decision state with `gh pr view` and `ctxr review list` before any side effect, and gate the landing behind an explicit confirmation unless the pull request is already `approved` from the approval page, since that recorded decision is the consent. It SHALL then land with `ctxr land <pr>`, passing `--confirm` only after an explicit go. When `ctxr land` reports a conflict, the skill SHALL route it to the lifecycle skill's conflict playbook and then run the command again. The skill SHALL NOT merge with `gh pr merge` itself, because `ctxr land` holds the consent check, the merge confirmation and the synchronization. The lifecycle skill SHALL cover start, including running `ctxr review list` when the store declares change approval and acting on each `changes-requested` comment as review feedback on that session and each `blocked` landing as work to resolve, the session's resting state between turns, re-scan, conflicts, sequencing, and reclaiming worktrees; SHALL state that ending a turn with uncommitted work on the session branch is that resting state rather than an obligation to discharge, and that completing a deliverable is not what ends a session; and SHALL reference both skills without repeating their steps.

#### Scenario: The lifecycle frame names the resting state
- **WHEN** the session-lifecycle skill is rendered for a store
- **THEN** it carries a section on the state between turns, stating that the worktree persists across exchanges, that ending a turn with uncommitted work on the branch is normal rather than unfinished, and that having completed a deliverable is not the signal that ends the session

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
- **THEN** it reads the pull request's state and decision state before landing, gates the landing behind an explicit confirmation unless the pull request is already `approved`, and lands with `ctxr land`, which confirms from the forge that the pull request merged, instead of running `gh pr merge` itself

#### Scenario: Land names its target explicitly
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target by branch name or pull-request number instead of relying on the current checkout

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header, driving `git` and `gh` rather than a `ctxr session` subcommand, and the lifecycle skill no longer contains the submit or land steps

#### Scenario: Submit puts the pages' addresses in the pull request body
- **WHEN** an agent follows the rendered submit skill and the change set adds or moves a page under the publish path
- **THEN** the pull request body carries a Pages section naming each page's status and its addresses, takes them from `ctxr publish urls` rather than deriving them, and states the condition under which a preview resolves

#### Scenario: Submit omits the Pages section when no page changed
- **WHEN** `ctxr publish urls` reports no pages for the change set
- **THEN** the pull request body carries no Pages section

#### Scenario: Submit pastes the knowledge-changes block verbatim
- **WHEN** an agent follows the rendered submit skill
- **THEN** it runs `ctxr graph diff --since` with `--format markdown` before `gh pr create`, and the pull request body carries that command's output unchanged, naming the base and head commit ids and the reproducing command

#### Scenario: Submit carries the block even when no note changed
- **WHEN** `ctxr graph diff` reports no note, link, rollup or source change for the change set
- **THEN** the pull request body still carries the block, which states that the range changes no note, rather than omitting the section or filling it with the agent's own description

#### Scenario: Submit names the approval page
- **WHEN** an agent reaches the end of the rendered submit skill for a store that declares change approval
- **THEN** its hand-off names the pull request's approval page address under `serve.base_url` alongside the pull request's number and url

#### Scenario: Session start picks up requested changes
- **WHEN** the session-lifecycle skill is rendered for a store that declares change approval
- **THEN** its start section runs `ctxr review list` and treats a `changes-requested` comment as review feedback for that session's branch and a `blocked` landing as work to resolve
