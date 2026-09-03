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
- **WHEN** two `contexture session start` invocations run one after another without either reaching the default branch first
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
- **WHEN** a staged note violates the store's frontmatter schema
- **THEN** the pre-commit hook refuses the commit and names the violation

#### Scenario: A clean commit proceeds
- **WHEN** all staged changes pass every pre-commit check
- **THEN** the commit proceeds normally

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
