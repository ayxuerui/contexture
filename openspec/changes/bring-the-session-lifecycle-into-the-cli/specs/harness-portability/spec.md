## REMOVED Requirements

### Requirement: Submit and land are owned skills over git and gh
**Reason**: The submit and lifecycle skills now drive `ctxr session status`, `submit`, `rebase` and `discard`, which the MCP surface shares, instead of `git` and `gh` sequences.
**Migration**: Replaced by *Submit and land are owned skills over the session commands*; `ctxr update` delivers the reworded skills.

## ADDED Requirements

### Requirement: Submit and land are owned skills over the session commands
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL state the entry condition that admits it — an explicit operator request to wrap up, or the operator's own closing signal — alongside the anti-triggers that do not admit it, naming an agent's own judgment that its assigned task is finished as the chief one. It SHALL run `ctxr session status` as the re-scan, offer a rollup for any entity `ctxr rollup stale` flags, run the capture skill exactly once, hold one coherent unit per pull request, and end in `ctxr session submit` with a branch name, a commit message, a title and a body answering why, what changed, route, verification and follow-ups, without an intervening confirmation, because the request to submit is the consent and the command's store-scope check is the gate. It SHALL NOT instruct writing the Knowledge changes or Pages sections, which the command writes. It SHALL close by reporting the pull request, naming the target a land needs, and, when the store declares change approval, the approval page address. The land skill SHALL be as before: name its target explicitly, read state with `gh pr view` and `ctxr review list` before any side effect, gate on an explicit go unless already approved, land with `ctxr land`, and route a conflict to the lifecycle skill. The lifecycle skill SHALL cover start, including acting on `changes-requested` and `blocked` rows `ctxr session list --review` reports when the store declares change approval, the resting state between turns, re-scan through `ctxr session status`, conflicts through `ctxr session rebase`, sequencing, and removal through `ctxr session discard`, and SHALL reference submit and land without repeating their steps.

#### Scenario: Submit ends in the session command, gated
- **WHEN** an agent follows the rendered submit skill
- **THEN** it re-scans with `ctxr session status`, invokes the capture skill exactly once, and ends with `ctxr session submit` and no confirmation step, naming no `git push` or `gh pr create`

#### Scenario: Submit leaves the generated sections to the command
- **WHEN** the submit skill is rendered for a store
- **THEN** it does not instruct running `ctxr graph diff` or `ctxr publish urls` to paste their output, and states that the command appends those sections

#### Scenario: Submit still states what admits it
- **WHEN** the submit skill is rendered for a store
- **THEN** it carries an entry-condition section ahead of the first step naming the admitting request and the anti-triggers, including that a finished task and the agent's own summary are not closing signals

#### Scenario: The lifecycle skill drives the session commands
- **WHEN** the session-lifecycle skill is rendered for a store that declares change approval
- **THEN** it reads requested changes from `ctxr session list --review`, re-scans with `ctxr session status`, resolves conflicts with `ctxr session rebase`, and removes a session with `ctxr session discard`

#### Scenario: Land is unchanged
- **WHEN** an agent follows the rendered land skill
- **THEN** it reads the pull request's state and decision state before landing, gates on an explicit go unless already approved, and lands with `ctxr land`

#### Scenario: Update delivers the reworded skills
- **WHEN** a store initialized before this change runs the update command
- **THEN** the submit and lifecycle skills are present with the managed header and drive the session commands, and a second update reports nothing changed
