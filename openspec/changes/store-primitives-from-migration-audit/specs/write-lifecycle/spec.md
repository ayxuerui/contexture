## Purpose

Extends the write-lifecycle capability (see `bootstrap-contexture-core`): a session can be landed, not only submitted, and every external side effect is gated.

## ADDED Requirements

### Requirement: A session can be landed end-to-end
`ctxr session land` SHALL resolve the pull request for the current session branch, report its number and title, and — after an explicit gate — merge it with the configured strategy, synchronize the default branch, and remove the session worktree. It SHALL branch on the pull request's state: an open mergeable request is merged; an open conflicting request stops with the conflict guidance; an already-merged request skips to synchronization; a closed request stops. It SHALL refuse to run on the default branch.

#### Scenario: A mergeable session lands
- **WHEN** the session branch has an open, mergeable pull request and the gate is passed
- **THEN** the request is merged, the default branch is synchronized, the worktree is removed, and the command reports each step

#### Scenario: A conflicting session stops before any side effect
- **WHEN** the pull request reports conflicts
- **THEN** nothing is merged or removed and the command exits with a distinct error naming the conflict guidance

#### Scenario: A retry re-reads state
- **WHEN** a previous `session land` merged the request but failed before removing the worktree, and the command is run again
- **THEN** it observes the merged state, skips the merge, and performs only the remaining steps

### Requirement: Submission accepts branch and title
`ctxr session submit` SHALL accept `--branch <name>` and `--title <text>` so a caller can name the branch and pull request without interactive input.

#### Scenario: Non-interactive submit
- **WHEN** `session submit --branch topic/x --title "x" --no-input` runs
- **THEN** the branch and request are created with those names and no prompt is shown
