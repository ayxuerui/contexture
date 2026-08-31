# write-lifecycle Specification

## Purpose

Defines how any write reaches the store: isolated in a CLI-managed session worktree, validated at commit, never landing on the default branch directly, and merged only through review — the same mechanism that makes concurrent agents safe on one store.

## Requirements

### Requirement: Writes happen in a CLI-managed session worktree
`contexture session start` SHALL create an isolated git worktree checked out from a freshly fetched default branch, and SHALL report that worktree's path as the location where subsequent work should happen. The store's canonical clone (the one the default branch is checked out in) SHALL NOT be handed out as a working location for a session.

#### Scenario: A session gets its own worktree
- **WHEN** `contexture session start` is run
- **THEN** it creates a new git worktree on a new branch and prints that worktree's path, distinct from the canonical clone's path

#### Scenario: Concurrent sessions do not collide
- **WHEN** two `contexture session start` invocations run one after another without either being submitted or abandoned first
- **THEN** each receives its own distinct worktree and branch, and work in one does not block or corrupt work in the other

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

#### Scenario: A schema violation blocks the commit
- **WHEN** a staged note violates the store's frontmatter schema (for example, an unresolvable visibility field value)
- **THEN** the pre-commit hook refuses the commit and names the violation

#### Scenario: A clean commit proceeds
- **WHEN** all staged changes pass every pre-commit check
- **THEN** the commit proceeds normally

### Requirement: Session submission validates, commits, pushes, and opens review
`contexture session submit` SHALL run the store's full validation (equivalent to `doctor --staged`), then commit, push the session's branch, and open a pull request via the configured forge adapter. It SHALL NOT push directly to the default branch under any circumstance.

#### Scenario: A validated session opens a pull request
- **WHEN** `contexture session submit` is run in a session worktree whose changes pass validation, with a forge adapter configured
- **THEN** the branch is pushed and a pull request targeting the default branch is opened

#### Scenario: A failing validation blocks submission
- **WHEN** `contexture session submit` is run with changes that fail validation
- **THEN** no commit, push, or pull request is made, and the command exits non-zero naming the validation failure

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
- **THEN** `contexture session submit`'s resulting pull request contains no diff for that artifact
