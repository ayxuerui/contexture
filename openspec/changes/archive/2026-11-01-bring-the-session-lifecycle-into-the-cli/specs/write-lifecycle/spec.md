## ADDED Requirements

### Requirement: `ctxr session status` re-scans a session
`ctxr session status` SHALL report, for one session worktree, its short status, the diff stat of its committed and uncommitted work, and the commits it carries ahead of the remote default branch, and with `--diff` the unified diff of uncommitted work. Run with no session named outside a session worktree, it SHALL exit with the usage code.

#### Scenario: A session's uncommitted work is reported
- **WHEN** `ctxr session status ctx-a-intro --json` runs on a session with one edited and one new file and no commit
- **THEN** it exits `0` and reports both paths as uncommitted and zero commits ahead

### Requirement: `ctxr session submit` gates, commits, pushes and opens the pull request
`ctxr session submit` SHALL take a session, a branch name, a commit message, a title and a body. It SHALL stage every change in the session worktree outside derived paths, and SHALL exit with the failed-check code, committing nothing and leaving the index as it was, when the index holds any derived path, whoever staged it. It SHALL then run the store-scope check pass `ctxr doctor` runs and exit with the failed-check code, committing nothing, when it fails. It SHALL then commit, rename the branch when the given name differs (refusing with the usage code a name the default branch or another live branch carries), push the branch (with lease when its history was rewritten), and open a pull request against the default branch with the title and a body formed from the given body followed by a Knowledge changes section that is the output of `ctxr graph diff --since` the remote default branch `--format markdown`, and, when `ctxr publish urls` lists a page for the range, a Pages section built from that report; when a pull request is already open for the branch it SHALL update its title and body instead. A given body that already carries either section's heading SHALL be refused with the usage code. Before re-pushing or re-opening, it SHALL read the remote branch and the forge's pull requests for it, so a retried call publishes an existing commit or pull request once. It SHALL report the pull request's number and address and, when the store declares `change_approval`, the approval page's address for the session. It SHALL NOT push or commit to the default branch, and SHALL NOT merge.

#### Scenario: A session is submitted
- **WHEN** `ctxr session submit ctx-a-intro --branch notes/intro --message "Rewrite the intro" --title "Rewrite the intro" --body "Why: ..."` runs on a session with uncommitted work and a passing store
- **THEN** one commit holds the work, `notes/intro` exists on the remote, an open pull request carries the title and a body that ends with the `graph diff` block verbatim, and the command exits `0` naming the pull request

#### Scenario: A failing store stops submit before the commit
- **WHEN** the store-scope check fails in the session
- **THEN** the command exits with the failed-check code and no commit, push or pull request is made

#### Scenario: A derived file staged earlier is not committed
- **WHEN** a derived file was staged in the session before `ctxr session submit` runs, alongside an ordinary edit
- **THEN** the command exits with the failed-check code naming the derived path, and no commit, push or pull request is made

#### Scenario: A hand-written knowledge section is refused
- **WHEN** the given body contains the Knowledge changes heading
- **THEN** the command exits with the usage code and nothing is committed

#### Scenario: A retry after a lost response publishes once
- **WHEN** a submit pushed and opened its pull request but its caller saw a transport error, and the same submit is run again
- **THEN** no second commit or pull request is made and the existing pull request is reported

#### Scenario: Requested changes are answered on the same pull request
- **WHEN** a submitted session gains further uncommitted work and is submitted again
- **THEN** a second commit is pushed to the same branch and the open pull request is updated, not duplicated

### Requirement: `ctxr session rebase` brings a session onto the default branch
`ctxr session rebase` SHALL fetch the default branch and rebase the session onto it. On conflict it SHALL exit with the failed-check code, report each conflicting path with both sides' content, and leave the rebase in progress; `--continue` SHALL stage the resolved paths and continue, and `--abort` SHALL restore the session as it was. While a rebase is in progress, `ctxr session submit` SHALL be refused naming `ctxr session rebase`.

#### Scenario: A conflict is reported for resolution
- **WHEN** the default branch and the session changed the same line and `ctxr session rebase ctx-a-intro` runs
- **THEN** it exits with the failed-check code naming the path with both sides, and `ctxr session submit` on that session is refused until `--continue` or `--abort`

### Requirement: `ctxr session discard` removes only a session, and only clean unless forced
`ctxr session discard` SHALL remove a session worktree and its local branch. It SHALL refuse with the usage code a path that is not a worktree under the configured worktrees path on a session branch, and SHALL refuse with the failed-check code a session carrying uncommitted changes or commits its remote branch lacks, unless `--force` is given. It SHALL close the session's open pull request only with `--close-pull-request`.

#### Scenario: Unpublished work is not discarded by accident
- **WHEN** `ctxr session discard ctx-a-intro` runs on a session with uncommitted changes
- **THEN** it exits with the failed-check code naming them, and the worktree and branch remain

#### Scenario: The canonical clone cannot be discarded
- **WHEN** `ctxr session discard` names the canonical clone or a worktree outside the configured worktrees path
- **THEN** it exits with the usage code and removes nothing

### Requirement: `ctxr session list` reports each session's state
`ctxr session list` SHALL report, for each session, its branch, worktree, head, whether it carries uncommitted changes, and its commits ahead of the remote default branch, without contacting the forge. With `--review` it SHALL also report each session's open pull request's number and state and, when the store declares `change_approval`, the decision state and comment `ctxr review list` reports for that pull request; when the forge cannot be reached, those fields SHALL read unknown and the command SHALL still exit `0`.

#### Scenario: Requested changes show on the session
- **WHEN** a session's pull request was marked changes-requested with a comment on the approval page
- **THEN** `ctxr session list --review --json` carries that state and comment on the session's row
