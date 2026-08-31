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

### Requirement: A session can be landed end-to-end
`ctxr session land` SHALL resolve the pull request for the current session branch (or one named by `--pr` / `--branch`), report its number, title, and url, and branch on its state: open and mergeable → after an explicit gate, merge with the configured or requested method and confirm the forge reports merged; already merged → skip to synchronization; closed → stop; conflicting or unknown → stop with the conflict guidance. It SHALL then synchronize the default branch in the root checkout by fast-forward only, reporting rather than forcing a checkout that will not fast-forward, and with `--reap` SHALL remove the session's worktree only when it was created by `session start`, is clean, and the pull request is merged. The gate SHALL be an interactive confirmation or `--yes`; with `--no-input` and no `--yes` the command SHALL fail before any side effect. It SHALL refuse to run on the default branch and when the resolved head branch differs from the branch requested. A retry SHALL re-read state and perform only the remaining steps.

#### Scenario: A mergeable session lands
- **WHEN** the session branch has an open, mergeable pull request and the gate is passed
- **THEN** it is merged, the forge reports merged, the root checkout's default branch is fast-forwarded, and the report names each step

#### Scenario: A conflicting session stops before any side effect
- **WHEN** the pull request reports conflicts
- **THEN** nothing is merged or removed and the command exits with a distinct error naming the conflict guidance

#### Scenario: Non-interactive without consent
- **WHEN** the command runs with `--no-input` and without `--yes`
- **THEN** it exits with a distinct error before reading or changing anything on the forge

#### Scenario: A retry performs only what remains
- **WHEN** a previous run merged the pull request but failed before synchronizing, and the command runs again
- **THEN** it observes the merged state, skips the merge, synchronizes, and reports the merge as already done

#### Scenario: A diverged root checkout is reported, not forced
- **WHEN** the root checkout is on another branch or cannot fast-forward
- **THEN** the command reports what it found and leaves the checkout unchanged

### Requirement: Submission can rename the session branch
`ctxr session submit --branch <name>` SHALL rename the current session branch to the given name before pushing and opening the pull request, and the worktree SHALL remain a recognized session worktree afterwards.

#### Scenario: Rename before push
- **WHEN** a session on a generated branch name submits with `--branch topic/x`
- **THEN** the pushed branch and the pull request head are `topic/x`, and `session list` still shows the worktree

### Requirement: The path gate
A markdown path being staged or captured SHALL be refused when its canonical location is outside the store or when reaching it traverses a symbolic link whose target is outside the store. When configuration declares writable paths, such a path SHALL additionally be refused unless it falls under a configured taxonomy layer, the inbox, a declared writable path, or a contexture-owned location; with no declaration every in-store path is accepted. The staged path check (run by `doctor --staged` from the pre-commit hook) and the capture command SHALL apply the same rule.

#### Scenario: A symlink escape is refused at commit time
- **WHEN** a staged markdown file's path resolves through a link to a directory outside the store
- **THEN** `doctor --staged` fails with a finding naming the path

#### Scenario: Undeclared writable paths accept any in-store note
- **WHEN** configuration declares no writable paths and a note is staged outside every layer
- **THEN** the path check passes

#### Scenario: Declared writable paths gate capture
- **WHEN** configuration declares writable paths and a proposal item targets a path under none of the sanctioned locations
- **THEN** `session capture` refuses that item, writes nothing for it, and still applies the other items

### Requirement: Capture applies an approved proposal item by item
`ctxr session capture --proposal <file>` SHALL read a proposal of store notes and identity deltas, validate each item independently (path gate, frontmatter shape, unique identity match), write every valid item — creating a note, appending to an existing note without altering its prior content, writing the visibility field when a value is given, applying identity deltas through the entry primitive — and report per item what was written, appended, refused with a reason, or skipped, computed from the writes performed. It SHALL exit non-zero when any item was refused and SHALL never scan or infer content beyond the proposal.

#### Scenario: One bad item does not block the rest
- **WHEN** a proposal has three notes and one path fails the gate
- **THEN** two notes are written, the third is reported refused with its reason, and the exit code is non-zero

#### Scenario: Append preserves prior content
- **WHEN** an item appends to an existing note
- **THEN** the note's prior bytes are unchanged and the new content follows them

#### Scenario: Visibility lands under the configured key
- **WHEN** an item supplies a visibility value
- **THEN** the created note carries it under the configured visibility field and `note resolve` reports the source as explicit
