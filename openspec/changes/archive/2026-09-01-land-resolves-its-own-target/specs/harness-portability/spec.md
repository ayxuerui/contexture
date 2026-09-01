## MODIFIED Requirements

### Requirement: Submit and land are owned skills
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, gate the external side effect, and end in `ctxr session submit`; the land skill SHALL end in `ctxr session land`, SHALL instruct naming the target with `--branch` or `--pr` rather than relying on whichever checkout the agent is in, SHALL state that a reap must run from outside the worktree being reaped, SHALL route conflicts to the lifecycle skill's playbook, and SHALL NOT instruct a manual merge. The lifecycle skill SHALL cover start, re-scan, conflicts, and sequencing and SHALL reference both without repeating their steps.

#### Scenario: Submit ends in the command
- **WHEN** an agent follows the rendered submit skill
- **THEN** its only write instruction after the gate is `ctxr session submit`, and the capture skill is invoked once

#### Scenario: Land never merges by hand
- **WHEN** an agent follows the rendered land skill
- **THEN** the merge step is `ctxr session land` and no forge command appears in the skill

#### Scenario: Land names its target and where a reap runs
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target with `--branch <name>` or `--pr <n>` instead of relying on the current checkout, and states that `--reap` cannot remove the worktree the command is running from

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header and the lifecycle skill no longer contains the submit or land steps
