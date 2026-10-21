## ADDED Requirements

### Requirement: Landing merges only a head that carries consent
`ctxr land <pr>` SHALL land one open session pull request, and `ctxr land --pending` SHALL land, one after
another, every open session pull request whose decision state is `approved` (as change-approval defines it).
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
remove the session's worktree and branch when the worktree has no uncommitted work, and report why when it
does not. It SHALL record the landing (pull request number, merged commit, worktree name) in a derived cache
path that the approval page reads. Every step's outcome SHALL be reported through the standard envelope. A
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

### Requirement: An approval carries across a catch-up rebase only when the patches are unchanged
When the pull request's branch is behind the default branch, `ctxr land` SHALL rebase it onto the forge's
default branch in the session's worktree, or in a temporary worktree when the session's worktree is absent.
When the rebase completes without conflict, the command SHALL compare the patch identity of every commit on
the rebased branch with that of the approved range. Only when they are equal, commit for commit, SHALL the
rebased head carry over the approval. The command SHALL then push with a lease on the approved head, and record
the carry-over on the pull request as an approving review by the recording identity, naming both heads and the
original decider. A rebase whose patches
differ, or that conflicts, SHALL NOT carry the approval over. A push refused by its lease SHALL stop the
command with the failed-check code, because the branch moved under it.

#### Scenario: A clean catch-up keeps the approval
- **WHEN** a decider approved head `h1`, the default branch moved on without touching the same lines, and
  `ctxr land` rebases `h1` to `h2`
- **THEN** the patch identities match, the pull request carries a review by the recording login naming `h1`
  and `h2`, and the command proceeds to merge `h2`

#### Scenario: A rebase that changes a patch does not keep the approval
- **WHEN** the rebased commits' patch identities differ from the approved range's
- **THEN** the command does not merge, and `ctxr review list` reports `needs-reapproval`

#### Scenario: A moved branch stops the push
- **WHEN** someone pushes to the branch after the approval and before `ctxr land`'s push
- **THEN** the leased push is refused, nothing is merged, and the command exits with the failed-check code

### Requirement: A conflict is resolved by the configured resolver and returns for re-approval
When the catch-up rebase conflicts, `ctxr land` SHALL abort the rebase, leaving the branch as it was. When the
store declares no conflict resolver, the command SHALL record the pull request as `blocked` with reason
`conflict`, and exit with the failed-check code. When the store declares one (an argument vector in
`change_approval`, with no shipped default), the command SHALL run it in the session's worktree. The command
SHALL give the resolver the pull request number, the default branch, and the conflict playbook the shipped
lifecycle skill carries, and SHALL wait for it to exit. The command SHALL accept the resolver's result only when
all of these hold: the worktree has no rebase in progress and no uncommitted work, the branch contains the
forge's default branch, and `ctxr doctor` passes in the worktree. It SHALL then push with a lease, and record
on the pull request, with the recording identity, that the conflict was resolved and the change needs
re-approval. It SHALL NOT merge a resolved conflict on the earlier approval. A resolver that exits non-zero, or
a result that fails acceptance, SHALL leave the branch as the forge had it and record `blocked` with the
reason.

#### Scenario: A resolved conflict waits for a new decision
- **WHEN** an approved pull request's rebase conflicts, the configured resolver resolves it, and the result
  passes acceptance
- **THEN** the branch is pushed, the pull request is not merged, it carries a note that it needs re-approval,
  and `ctxr review list` reports `needs-reapproval`

#### Scenario: No resolver, the conflict blocks
- **WHEN** an approved pull request's rebase conflicts and no resolver is declared
- **THEN** the branch is unchanged on the forge, `ctxr review list` reports `blocked` with reason `conflict`,
  and the command exits with the failed-check code

#### Scenario: A resolver result that fails doctor is not pushed
- **WHEN** the resolver exits `0` but `ctxr doctor` fails in the worktree
- **THEN** nothing is pushed, and the pull request is recorded `blocked` naming the doctor failure
