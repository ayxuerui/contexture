## ADDED Requirements

### Requirement: Session commands work against merge requests on a GitLab store
On a GitLab store, `ctxr session submit` SHALL push the session's branch and open a merge request against the
default branch, or update the one already open for that branch. `ctxr session list --review` SHALL report each
session's open merge request and decision state, and `ctxr session discard --close-pull-request` SHALL close it.
Each SHALL report a merge request in the envelope fields a pull request is reported in.

#### Scenario: Submit opens a merge request
- **WHEN** `ctxr session submit` runs in a session of a GitLab store with no merge request for its branch
- **THEN** the branch is pushed, a merge request against the default branch is opened carrying the session
  marker, and the envelope gives its number and URL

#### Scenario: Resubmitting updates the open merge request
- **WHEN** `ctxr session submit` runs again after more commits
- **THEN** the same merge request's title and description are updated, and no second one is opened

#### Scenario: Discard closes the merge request only when asked
- **WHEN** `ctxr session discard --close-pull-request` runs for a session with an open merge request
- **THEN** the merge request is closed before the worktree is removed

### Requirement: Landing merges a GitLab merge request only at the approved head
On a GitLab store, `ctxr land` SHALL merge a merge request by a call that names the approved head commit, so
that the forge refuses the merge when the head has moved. It SHALL squash when the configured merge method is
`squash` and SHALL NOT squash when it is `merge`. A merge the forge refuses SHALL be reported as landing
already reports a refused merge, with the forge's reason.

#### Scenario: A moved head is not merged
- **WHEN** a decision approves head `h1`, a commit is pushed making the head `h2`, and the merge call is made
  for `h1`
- **THEN** GitLab refuses it, nothing is merged, and the session is reported as not landed with the reason

### Requirement: A session's forge slug may have more than two segments
The forge slug of a GitLab repository SHALL be its full project path. Session markers, decision markers and
every command that reports a store's slug SHALL accept and preserve a slug of two or more segments. A slug of
exactly two segments SHALL be written and read exactly as before.

#### Scenario: A subgroup project's session is grouped
- **WHEN** a session's merge request in `ctx-a/team/work` carries a session marker with home `ctx-a/team/work`
- **THEN** `ctxr review list` reports it as a session whose home slug is `ctx-a/team/work`

### Requirement: A session joined across forges is refused
`ctxr session start --joins` SHALL exit with the setup/usage code, starting nothing, when either the mounted
store or the store that mounts it is on GitLab and the two are not on the same forge and host, naming both.

#### Scenario: A GitLab mount cannot join a GitHub store's session
- **WHEN** a GitHub store mounts a store on the GitLab host and `ctxr session start --joins` runs inside the
  mount
- **THEN** it exits with the setup/usage code naming both forges, and no worktree or branch is created
