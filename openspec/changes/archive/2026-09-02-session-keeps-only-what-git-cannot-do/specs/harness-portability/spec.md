## ADDED Requirements

### Requirement: Submit and land are owned skills over git and gh
contexture SHALL ship `ctxr-submit` and `ctxr-land` as contexture-owned skills delivered by init and update. The submit skill SHALL run the re-scan, run the capture skill exactly once, stage named paths, run `ctxr doctor` for store-scope validation, gate the external side effect, and end in `git push` followed by `gh pr create`. The land skill SHALL name its target explicitly (never inferring it from the currently checked-out branch), read the pull request's state and mergeability with `gh pr view` before any side effect, gate the merge behind an explicit confirmation, merge with `gh pr merge`, confirm the forge reports merged before synchronizing, and route conflicting or unknown mergeability to the lifecycle skill's conflict playbook. The lifecycle skill SHALL cover start, re-scan, conflicts, sequencing, and reclaiming worktrees, and SHALL reference both skills without repeating their steps.

#### Scenario: Submit ends in git and gh, gated
- **WHEN** an agent follows the rendered submit skill
- **THEN** `ctxr doctor` runs before staging, the capture skill is invoked exactly once, and the only write instructions after the fire gate are `git push` and `gh pr create`

#### Scenario: Land checks state before merging and confirms after
- **WHEN** an agent follows the rendered land skill
- **THEN** it reads the pull request's state and mergeability with `gh pr view` before merging, gates the merge behind an explicit confirmation, and re-reads state after `gh pr merge` to confirm the forge reports merged rather than trusting the merge command's exit code

#### Scenario: Land names its target explicitly
- **WHEN** the land skill is rendered for a store
- **THEN** it instructs naming the target by branch name or pull-request number instead of relying on the current checkout

#### Scenario: Update delivers both to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** both skills are present at the configured skills path with the managed header, driving `git` and `gh` rather than a `ctxr session` subcommand, and the lifecycle skill no longer contains the submit or land steps

## REMOVED Requirements

### Requirement: Submit and land are owned skills
**Reason**: This requirement's scenarios described skills ending in `ctxr session submit` / `ctxr session land`, both removed in this change, and one ("Land never merges by hand") forbade any forge command in the land skill — a ban this change deliberately inverts (see design.md D6): with no CLI merge path left to route through, `gh pr merge` becomes the land skill's own merge step, and the pull request plus its merge commit are the audit trail. The requirement is restated under "Submit and land are owned skills over git and gh" with scenarios matching the git/gh-driven content.
**Migration**: Follow the rewritten `ctxr-submit` and `ctxr-land` skill templates; `ctxr update` delivers them to any existing store.

### Requirement: The session-lifecycle skill reflects external workspace ownership
**Reason**: The `session.workspaces_external` configuration key this requirement rendered from is removed (see the `write-lifecycle` and `adapters` capability deltas in this change). Its rendering was not internally consistent even before removal: only the reclaiming section of the lifecycle skill was conditional on the key, while the Start section remained unconditional, so a store with the key set received a skill that both instructed and forbade worktree creation in the same document — a defect this requirement's own scenarios did not catch, since they asserted the prohibition text was present, never that the rendered document was coherent. An operator who needs "worktrees here are externally managed" documented now states it in an operator-authored file under the guidance directory, which the store's conventions-inlining mechanism already surfaces in `AGENTS.md`.
**Migration**: Add the fact to an operator-authored file under `harness.guidance_path`; it is inlined into `AGENTS.md` alongside the store's other conventions without any config key or rendering branch.
