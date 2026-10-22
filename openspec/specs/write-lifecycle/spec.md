# write-lifecycle Specification

## Purpose

Defines how any write reaches the store: isolated in a CLI-managed session worktree, validated at commit, never landing on the default branch directly, and merged only through review — the same mechanism that makes concurrent agents safe on one store.

## Requirements

### Requirement: Writes happen in a CLI-managed session worktree
`contexture session start` SHALL create an isolated git worktree checked out from a freshly fetched
default branch, and SHALL report that worktree's path as the location where subsequent work should
happen. The store's canonical clone (the one the default branch is checked out in) SHALL NOT be handed
out as a working location for a session.

The command SHALL accept an optional caller-supplied label naming what the session is for, and SHALL
incorporate that label into the name it generates for the session's branch and worktree, so that a
session is identifiable by its subject and not only by when it started. The label SHALL be normalized
by the same rule the store applies to any other caller-supplied name segment, and MAY be shortened to
keep the resulting directory name usable. Supplying a label SHALL NOT be required: with none given,
the command SHALL name the session as it does when the capability is absent, and the generated name
SHALL remain unique without any caller involvement.

Whether or not a label is given, every session SHALL receive its own distinct worktree and branch.
A label SHALL identify at most one session at a time: when a session that still exists already carries
the label, or when the label normalizes to nothing, the command SHALL refuse with the setup/usage exit
code, SHALL name what it refused and why, and SHALL NOT create a worktree, a branch, or any part of
one. A label SHALL become available again once the session holding it no longer exists. The command SHALL NOT alter a
caller-supplied label to resolve a collision. A refusal by the underlying git worktree creation SHALL
likewise be reported with the setup/usage exit code, naming what git refused, and SHALL NOT be
reported as an internal error.

#### Scenario: A session gets its own worktree
- **WHEN** `contexture session start` is run
- **THEN** it creates a new git worktree on a new branch and prints that worktree's path, distinct from the canonical clone's path

#### Scenario: Concurrent sessions do not collide
- **WHEN** two `contexture session start` invocations run one after another without either reaching the default branch first
- **THEN** each receives its own distinct worktree and branch, and work in one does not block or corrupt work in the other

#### Scenario: A labelled session carries its label
- **WHEN** `contexture session start` is run with the label `ctx-a`
- **THEN** the branch it creates and the worktree directory it creates both carry `ctx-a` in their names, and the reported worktree path is that directory

#### Scenario: An unlabelled session is named without caller involvement
- **WHEN** `contexture session start` is run with no label
- **THEN** it creates a session whose generated name is unique without the caller supplying anything, and it neither prompts for a label nor refuses for the lack of one

#### Scenario: A label already carried by a session is refused
- **WHEN** `contexture session start` is run with a label that an existing session already carries, whatever time has passed since that session started
- **THEN** it exits with the setup/usage code naming the existing session's worktree, creates no worktree and no branch, and does not start a session under an altered form of the label

#### Scenario: A label that normalizes to nothing is refused
- **WHEN** `contexture session start` is run with a label that normalizes to an empty name
- **THEN** it exits with the setup/usage code naming the label as unusable, and does not fall back to naming the session as if no label had been given

#### Scenario: A git refusal is reported as a usage error
- **WHEN** the underlying git worktree creation refuses `contexture session start`'s request
- **THEN** the command reports what git refused with the setup/usage exit code, not as an internal error

### Requirement: Nothing commits to the default branch directly
The store SHALL install a version-controlled pre-push hook, at `init` time, that refuses a push targeting the default branch's remote ref. `contexture doctor` SHALL detect and report if this hook is missing or has been altered from its installed form, and SHALL be able to reinstall it.

#### Scenario: A direct push to the default branch is refused
- **WHEN** any git client attempts to push a commit directly to the default branch's remote ref
- **THEN** the installed pre-push hook rejects the push and reports why

#### Scenario: A missing hook is detected and repaired
- **WHEN** `contexture doctor` finds that the pre-push hook is absent or modified
- **THEN** it reports the finding as a failing check and offers to reinstall the canonical hook

### Requirement: Commits are validated before they are accepted
The store SHALL install a version-controlled pre-commit hook that runs a staged-changes validation (schema conformance, fence integrity, a secret-pattern scan, a path allowlist, and a diff-size ceiling) and refuses the commit if any check fails, naming the specific violation.

The diff-size ceiling SHALL count the changed lines of every staged file except a file under the configured skills path whose staged content is byte-identical to the content the installed version ships for that path — an owned skill's `SKILL.md`, an owned skill's supporting file, or a packaged file of a vendored skill the store declares. The exemption SHALL be decided by comparing the staged content with the shipped content, never by location alone: a file under the skills path that differs from what the installed version ships, a file the installed version does not ship, an operator-authored skill, and a deletion SHALL all be counted as before. When the exemption applies to any staged file, the ceiling's finding SHALL state how many changed lines were left out of the count.

The pre-commit hook SHALL locate the `contexture` executable it runs from its own runtime environment — an explicit override read from a `CONTEXTURE_*` environment variable if set, otherwise the executable resolved on `PATH` — and SHALL NOT have any installation-specific filesystem path baked into it at install time, so the installed hook is byte-identical regardless of which machine or checkout installed it. When neither the override nor `PATH` resolves an executable, the hook SHALL refuse the commit, naming what to fix, rather than allowing the commit to proceed unvalidated.

#### Scenario: A schema violation blocks the commit
- **WHEN** a staged note violates the store's frontmatter schema
- **THEN** the pre-commit hook refuses the commit and names the violation

#### Scenario: A clean commit proceeds
- **WHEN** all staged changes pass every pre-commit check
- **THEN** the commit proceeds normally

#### Scenario: A checkout without the executable has its commit refused
- **WHEN** a commit is attempted in a checkout where no `CONTEXTURE_*` override is set and no `contexture` executable is found on `PATH`
- **THEN** the pre-commit hook refuses the commit and names what to install or set to fix it, instead of allowing the commit to proceed unvalidated

#### Scenario: A fresh store's first commit is not refused for the skills it ships
- **WHEN** `ctxr init` stages a new store whose skill files alone exceed the configured ceiling
- **THEN** the pre-commit hook accepts the commit, because those files are byte-identical to what the installed version ships and are not counted

#### Scenario: A shipped skill file edited by one byte is counted
- **WHEN** a staged file under the skills path differs from the content the installed version ships for that path by any amount
- **THEN** its changed lines count toward the ceiling in full

#### Scenario: A file the installed version does not ship is counted wherever it sits
- **WHEN** a staged file under the skills path, or inside an owned skill's directory, is not one the installed version ships
- **THEN** its changed lines count toward the ceiling in full

#### Scenario: Other staged content still reaches the ceiling
- **WHEN** a commit stages enough operator-authored or agent-authored lines to exceed the ceiling, alongside shipped skill files
- **THEN** the pre-commit hook refuses it, and the finding names how many lines were left out of the count

#### Scenario: A deletion is counted
- **WHEN** a commit stages the removal of a skill file
- **THEN** the removed lines count toward the ceiling as they did before

### Requirement: Shared append-only files use an append-via-queue
A write that only appends to a shared, append-only file (such as a chronological log) SHALL be represented as a uniquely named, self-contained intent file in a queue directory, applied to the target file by a queue-reconciling operation, rather than by two concurrent sessions editing the same file's branch history directly.

#### Scenario: Two concurrent appends both survive
- **WHEN** two sessions each queue an append to the same shared append-only file at the same time
- **THEN** the reconciling operation applies both queued appends, and neither is lost or silently overwritten

### Requirement: Derived artifacts are written atomically and never ride review
Any command that writes a derived artifact (per the context-store derived-file declaration) SHALL write it via a temporary file followed by an atomic rename, and SHALL NOT stage, commit, or include it in any session's pull request.

#### Scenario: A concurrent rebuild does not corrupt the artifact
- **WHEN** a derived artifact is being rebuilt at the same moment another process reads it
- **THEN** the reading process sees either the old complete artifact or the new complete artifact, never a partially written file

#### Scenario: A derived artifact never appears in a pull request diff
- **WHEN** a session runs a command that rebuilds a derived artifact during its work
- **THEN** the session's resulting pull request contains no diff for that artifact

### Requirement: The path gate
A markdown path being staged or captured SHALL be refused when its canonical location is outside the store or when reaching it traverses a symbolic link whose target is outside the store. When configuration declares writable paths, such a path SHALL additionally be refused unless it falls under a configured taxonomy layer, the configured capture root, a declared writable path, or a contexture-owned location; with no declaration every in-store path is accepted. Sanctioning the capture root — rather than only the inbox within it — is what keeps the retained-capture write that ingest itself performs from being refused by a store that declares writable paths. The staged path check (run by `doctor --staged` from the pre-commit hook) and the capture command SHALL apply the same rule.

#### Scenario: A symlink escape is refused at commit time
- **WHEN** a staged markdown file's path resolves through a link to a directory outside the store
- **THEN** `doctor --staged` fails with a finding naming the path

#### Scenario: Undeclared writable paths accept any in-store note
- **WHEN** configuration declares no writable paths and a note is staged outside every layer
- **THEN** the path check passes

#### Scenario: Declared writable paths gate capture
- **WHEN** configuration declares writable paths and a proposal item targets a path under none of the sanctioned locations
- **THEN** `session capture` refuses that item, writes nothing for it, and still applies the other items

#### Scenario: A retained capture is sanctioned outside the inbox
- **WHEN** configuration declares writable paths and ingest moves a capture from the inbox into the capture tier's dated directory
- **THEN** the path check passes, because the destination falls under the configured capture root

### Requirement: Capture writes only what an approved proposal names
`ctxr session capture --proposal <file>` SHALL read a proposal of store notes, validate each item independently (path gate, frontmatter shape), write every valid item — creating a note, or appending to an existing note without altering its prior content — and report per item what was written, appended, refused with a reason, or skipped, computed from the writes performed. It SHALL exit non-zero when any item was refused and SHALL never scan or infer content beyond the proposal.

#### Scenario: One bad item does not block the rest
- **WHEN** a proposal has three notes and one path fails the gate
- **THEN** two notes are written, the third is reported refused with its reason, and the exit code is non-zero

#### Scenario: Append preserves prior content
- **WHEN** an item appends to an existing note
- **THEN** the note's prior bytes are unchanged and the new content follows them

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

### Requirement: In App mode, landing's git transport authenticates as the App
When `ctxr land` runs with a GitHub App credential (as change-approval defines it), every `git fetch` and
`git push` it performs against the store's `origin` SHALL authenticate with the App's current installation
token, so the command needs no other git credential. The token SHALL reach git only through the environment
of that one git process, read by a credential helper that the command passes on the command line. It SHALL NOT
be written into a remote URL, into any git configuration file, or into the command's output. Without an App
credential, `ctxr land` SHALL use whatever credential git already has, as before.

#### Scenario: A runner with only the App credential lands
- **WHEN** `ctxr land --pending` runs with the App variables set, no `GH_TOKEN`, and no git credential
  configured for `origin`
- **THEN** it fetches, pushes a carried-over rebase, and merges an approved pull request

#### Scenario: The token is never stored
- **WHEN** `ctxr land` has pushed as the App
- **THEN** `git remote get-url origin`, the repository's git configuration files and the command's output
  contain no part of the installation token

### Requirement: One landing runs per repository at a time
`ctxr land` SHALL hold an exclusive lock in the repository's common git directory for the whole of a run, and
SHALL release it when the run ends, however it ends. A lock left by a process that no longer exists SHALL be
taken over. When another live process holds the lock, `ctxr land --pending` SHALL do nothing and exit `0`,
reporting a notice that names the holder. `ctxr land <pr>` SHALL exit with the failed-check code with a finding
naming the holder, and SHALL perform no side effect.

#### Scenario: A concurrent sweep steps aside
- **WHEN** `ctxr land --pending` starts while another `ctxr land` is running against the same repository
- **THEN** it exits `0` without reading the forge, and reports that a landing is already running, with that
  process's id

#### Scenario: A stale lock is taken over
- **WHEN** the lock names a process id that no longer exists
- **THEN** `ctxr land` takes the lock and runs

### Requirement: Landing commits on a host with no git identity
When git has no committer name or email configured for the checkout `ctxr land` rebases in, the command SHALL
commit the rebase with the recording login as the committer's name, and an address in the forge's no-reply
domain as the committer's email. It SHALL pass that identity in the git process's environment only, and SHALL
NOT write it to any git configuration. A configured identity SHALL be used as it is.

#### Scenario: A bare host rebases
- **WHEN** `ctxr land` catches up an approved branch on a host where `git config user.email` returns nothing
- **THEN** the rebase succeeds, its commits name the recording login as committer, and the repository's git
  configuration is unchanged

### Requirement: Every landing run brings the canonical clone up to date when it is safe to
At the end of every `ctxr land --pending` run, whether or not it landed anything, and after `ctxr land <pr>` has
merged, the command SHALL fetch the configured default branch from `origin` and fast-forward the canonical clone to
it. It SHALL do so only when all of these hold: the canonical clone has the default branch checked out, it has no
uncommitted changes to tracked files, and its branch is an ancestor of the fetched one. When any of them does not
hold, the command SHALL leave the clone exactly as it was (no reset, stash, checkout or forced merge), and SHALL
report which condition failed.

The command SHALL report the outcome as `canonical_sync` in its envelope. For a fast-forward, the outcome SHALL
give the commit before and after. When the clone was already current, the outcome SHALL say so. When the command
did not sync, the outcome SHALL give the reason. A sync that does not happen SHALL be reported as a warning finding,
and SHALL NOT change the command's exit code.

#### Scenario: A change merged elsewhere reaches the canonical clone on the next sweep
- **WHEN** a pull request is merged on the forge by something other than `ctxr land`, and `ctxr land --pending` then
  runs with no approved pull request
- **THEN** the canonical clone's default branch is at the merged commit, and `canonical_sync` names the commits
  before and after

#### Scenario: Uncommitted work in the canonical clone is left alone
- **WHEN** the canonical clone has an uncommitted change to a tracked file and the forge's default branch has moved
  on
- **THEN** the clone's branch, index and working tree are unchanged, `canonical_sync` reports uncommitted changes,
  and the exit code is what it would be without the sync

#### Scenario: A clone on another branch is left alone
- **WHEN** the canonical clone has a branch other than the default branch checked out
- **THEN** nothing is checked out or merged, and `canonical_sync` names the branch that is checked out

#### Scenario: A diverged clone is left alone
- **WHEN** the canonical clone's default branch has a commit the forge's does not
- **THEN** the clone is unchanged, and `canonical_sync` reports that it has diverged

#### Scenario: A merged configuration change reaches a running server within a sweep
- **WHEN** a pull request changing `contexture.yaml` is merged on the forge while `ctxr serve` runs and lands
  automatically
- **THEN** within one sweep the canonical clone holds the change, and the server answers with the new
  configuration with no restart
