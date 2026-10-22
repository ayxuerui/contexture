## MODIFIED Requirements

### Requirement: Landing merges only a head that carries consent
`ctxr land <pr>` SHALL land one open pull request, and `ctxr land --pending` SHALL land, one after another, every
pull request the approval index lists whose decision state is `approved` (as change-approval defines it) and that
the forge does not mark as a draft, whether or not a session worktree for it exists locally.
Before any side effect, the command SHALL read the pull request's state, head branch, head commit and
mergeability from the forge. It SHALL refuse a pull request whose head branch is the configured default
branch, and a pull request that is not open. The command SHALL merge only when it holds consent for the exact
head it is about to merge. Consent is either:
- a decision by the configured recording login that approves that head, or approves a head that this head
  carries over from; or
- the `--confirm` flag, which a caller passes only after obtaining an explicit go for that pull request.

`--pending` SHALL NOT accept `--confirm`. With neither form of consent, the command SHALL exit with the
failed-check code, naming the pull request and its decision state, and SHALL NOT push, merge or write
anything.

After the merge call, the command SHALL re-read the pull request from the forge and SHALL report it merged
only when the forge says so. It SHALL then fast-forward the canonical clone's default branch to the forge's,
and SHALL report, without forcing, a canonical clone that is on another branch or has diverged. It SHALL then
remove the session's worktree and branch when one exists and has no uncommitted work, and report why when it
does not. It SHALL record the landing (pull request number, merged commit, and worktree name when there was one) in a
derived cache path that the approval page reads, keyed by pull request number. Every step's outcome SHALL be reported through the standard envelope. A
record that this capability has the command make on the pull request (a carry-over, a block, a needs-re-approval
note) SHALL be posted only when the command's forge credential is the recording login; otherwise the command
SHALL report it in its envelope alone. A retry SHALL re-read state and perform only what remains.

#### Scenario: An approved head lands
- **WHEN** pull request 7's latest decision approves its current head, and the pull request is mergeable
- **THEN** `ctxr land 7` merges it, confirms from the forge that it is merged, fast-forwards the canonical
  clone, removes the session worktree and branch, and exits `0`

#### Scenario: No consent, no side effect
- **WHEN** `ctxr land 7` runs on a pull request with no decision and without `--confirm`
- **THEN** it exits with the failed-check code naming the state `awaiting`, and the forge, the branch and the
  canonical clone are unchanged

#### Scenario: The default branch is never landed
- **WHEN** `ctxr land` targets a pull request whose head branch is the configured default branch
- **THEN** it refuses with the setup/usage code and performs no side effect

#### Scenario: A merge is not claimed from the merge call alone
- **WHEN** the forge's merge call returns an error, and re-reading the pull request shows it merged
- **THEN** the command reports it merged and continues with the remaining steps

#### Scenario: --pending lands only approved pull requests
- **WHEN** three session pull requests are open, one `approved`, one `awaiting`, one `changes-requested`
- **THEN** `ctxr land --pending` lands the approved one and leaves the other two untouched

#### Scenario: --pending lands an approved pull request opened elsewhere
- **WHEN** pull request 12, from a branch of the store's repository with no local session worktree, carries an
  approval of its current head
- **THEN** `ctxr land --pending` merges it through a temporary worktree, reports it merged, and leaves no worktree
  behind
