# adapters Specification

## Purpose

Defines one contract governing every extension point where contexture's core behavior is augmented by pluggable, optional code — harness-specific file generation and forge (PR-hosting) integration — so core never assumes any particular plugin is installed. A third kind, for ranked/semantic search, is deferred to v2 (see design.md) and is out of scope here.

## Requirements

### Requirement: One contract for every adapter kind
An adapter, regardless of kind (harness generation, forge), SHALL be discoverable via a declared registration mechanism, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code.

#### Scenario: Two adapter kinds share the same discovery mechanism
- **WHEN** a harness-generation adapter and a forge adapter are both registered in `contexture.yaml`
- **THEN** both are discovered and validated using the same underlying discovery mechanism, not two separate ones

### Requirement: Core never depends on an adapter being present
Every core command SHALL define and document its behavior when no adapter of a relevant kind is configured, and that behavior SHALL be a documented degradation, not a crash or a silent no-op.

#### Scenario: No forge adapter configured
- **WHEN** no forge adapter is configured
- **THEN** `contexture session submit` completes the commit-and-push portion of its work and reports that the operator must open a pull request manually, rather than failing the entire submission

### Requirement: Incompatible adapter versions are refused, not silently run
If a registered adapter declares a capability-interface version that the installed contexture version does not support, the command that would invoke it SHALL exit non-zero naming the adapter and the version mismatch, rather than invoking the adapter and risking undefined behavior.

#### Scenario: Version mismatch is caught before invocation
- **WHEN** a registered adapter's declared interface version is not one the current contexture release supports
- **THEN** the relevant command refuses to invoke that adapter and reports the specific version mismatch

### Requirement: Forge adapters read state and merge
A forge adapter at interface version 2 SHALL provide, in addition to availability and pull-request opening: a state query for a branch or number returning the pull request's number, url, state (open, merged, or closed), mergeability (mergeable, conflicting, or unknown), and head branch; and a merge operation taking a number and a method. The built-in GitHub adapter SHALL implement both. `adapters.compatibility` SHALL report a configured forge adapter whose interface version is below 2.

#### Scenario: State query maps the forge's vocabulary
- **WHEN** the forge reports a pull request as open with unknown mergeability
- **THEN** the adapter returns state open and mergeability unknown, and `session land` re-queries before stopping

#### Scenario: A stale forge adapter is reported
- **WHEN** a configured forge adapter declares interface version 1
- **THEN** `doctor` reports an `adapters.compatibility` finding naming it before any session command relies on it

### Requirement: A harness's generated permission config scopes writes to the active session worktree
For a harness whose adapter declares a permission config, `contexture adapters generate` SHALL emit rules that, through whichever enforcement primitive the harness provides (a permission rule, a pre-tool hook, or equivalent), deny edits to the store's own content in the canonical checkout while leaving the active session worktree editable, regardless of where the configured session worktree path is nested relative to the store root. The generator SHALL NOT emit a rule the harness accepts but does not enforce. The enforcement primitive's own runtime resolution of "the store" (for example, walking up from a working directory to the nearest store config file) SHALL still resolve the active session worktree as editable even when that working directory is inside the worktree itself, not only when it is the canonical checkout.

#### Scenario: The canonical checkout is protected without disabling the worktree
- **WHEN** a permission config is generated for a store whose session worktree path is nested inside the store root, and a session runs with that config in effect
- **THEN** an edit to a file in the store root outside the worktree is denied, and an edit to a file inside the active session worktree succeeds

#### Scenario: A working directory inside the worktree still resolves the worktree as editable
- **WHEN** a session's own working directory is already inside the active session worktree (itself a full checkout carrying its own copy of the store's configuration) rather than the canonical checkout
- **THEN** an edit to a file inside that worktree succeeds, the same as when the session's working directory is the canonical checkout

#### Scenario: No unenforceable rule is emitted
- **WHEN** the harness accepts a rule shape but never consults it when deciding whether to allow an edit
- **THEN** the generator does not emit a rule of that shape

### Requirement: Regenerating a permission config repairs a previously generated one
`contexture adapters generate` SHALL remove, by exact match, any rule that a previous version of the generator emitted and the current version no longer emits, before writing the current rules, so a store whose permission config was generated by an earlier, defective version converges to the corrected behavior on the next run. A rule not previously emitted by the generator (including one an operator added by hand) SHALL be left untouched.

#### Scenario: A stale generated rule is removed on regenerate
- **WHEN** `contexture adapters generate` runs against a permission config file containing a rule emitted by a previous version of the generator that the current version no longer emits
- **THEN** the stale rule is absent from the file after generation, and a rule the current version does emit is present

#### Scenario: A hand-added rule survives regeneration
- **WHEN** an operator has added a rule to the permission config file that the generator has never emitted
- **THEN** running `contexture adapters generate` again leaves that rule in place
