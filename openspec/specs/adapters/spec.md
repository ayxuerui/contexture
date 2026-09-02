# adapters Specification

## Purpose

Defines one contract governing every extension point where contexture's core behavior is augmented by pluggable, optional code — currently harness-specific file generation — so core never assumes any particular plugin is installed. A ranked/semantic search kind is deferred to v2 (see design.md) and is out of scope here.

## Requirements

### Requirement: Adapters are discovered through one declared registration mechanism
An adapter SHALL be discoverable via a declared registration mechanism, resolved by kind and id against a registry, SHALL declare which capability interface(s) it implements and at which version, and SHALL be independently addable, removable, and upgradable without modifying core contexture code. A declaration that does not resolve to a registered adapter SHALL be refused rather than silently ignored.

#### Scenario: An unresolvable adapter declaration is refused
- **WHEN** a registered adapter's (kind, id) pair matches no built-in adapter
- **THEN** resolving it exits non-zero naming the kind and id, rather than registering nothing and continuing silently

### Requirement: Core documents its behavior when an adapter of a relevant kind is absent
Every core command SHALL define and document its behavior when no adapter of a relevant kind is configured, and that behavior SHALL be a documented degradation, not a crash or a silent no-op.

#### Scenario: No harness-generation adapter configured
- **WHEN** no harness-generation adapter is configured
- **THEN** `ctxr adapters generate` exits zero and reports zero files changed, rather than crashing or producing no report at all

### Requirement: Incompatible adapter versions are refused, not silently run
If a registered adapter declares a capability-interface version that the installed contexture version does not support, the command that would invoke it SHALL exit non-zero naming the adapter and the version mismatch, rather than invoking the adapter and risking undefined behavior.

#### Scenario: Version mismatch is caught before invocation
- **WHEN** a registered adapter's declared interface version is not one the current contexture release supports
- **THEN** the relevant command refuses to invoke that adapter and reports the specific version mismatch

### Requirement: A harness's generated permission config scopes writes to the active session worktree
For a harness whose adapter declares a permission config, `contexture adapters generate` SHALL emit rules that, through whichever enforcement primitive the harness provides (a permission rule, a pre-tool hook, or equivalent), deny edits to the store's own content in the canonical checkout while leaving the active session worktree editable, regardless of where the configured session worktree path is nested relative to the store root. The generator SHALL NOT emit a rule the harness accepts but does not enforce. The enforcement primitive's own runtime resolution of "the store" (for example, walking up from a working directory to the nearest store config file) SHALL still resolve the active session worktree as editable even when that working directory is inside the worktree itself, not only when it is the canonical checkout.

When the enforcement primitive is invoked by an absolute path (for example, a hook command), `contexture adapters generate` SHALL resolve that absolute path against the store's main/canonical worktree, never against whichever checkout is currently running the generator, so the primitive keeps resolving after a session worktree that once ran the generator is removed. A primitive that fails to resolve SHALL NOT be treated as equivalent to a passing enforcement decision — an enforcement primitive that cannot run MUST NOT cause the edit it would have evaluated to be silently allowed.

#### Scenario: The canonical checkout is protected without disabling the worktree
- **WHEN** a permission config is generated for a store whose session worktree path is nested inside the store root, and a session runs with that config in effect
- **THEN** an edit to a file in the store root outside the worktree is denied, and an edit to a file inside the active session worktree succeeds

#### Scenario: A working directory inside the worktree still resolves the worktree as editable
- **WHEN** a session's own working directory is already inside the active session worktree (itself a full checkout carrying its own copy of the store's configuration) rather than the canonical checkout
- **THEN** an edit to a file inside that worktree succeeds, the same as when the session's working directory is the canonical checkout

#### Scenario: No unenforceable rule is emitted
- **WHEN** the harness accepts a rule shape but never consults it when deciding whether to allow an edit
- **THEN** the generator does not emit a rule of that shape

#### Scenario: The enforcement primitive's path survives the generating worktree's removal
- **WHEN** `contexture adapters generate` runs from inside a session worktree, and that worktree is later removed
- **THEN** the absolute path the generated config invokes still resolves, because it was resolved against the store's main worktree rather than the worktree that ran the generator

### Requirement: Regenerating a permission config repairs a previously generated one
`contexture adapters generate` SHALL remove, by exact match, any rule that a previous version of the generator emitted and the current version no longer emits, before writing the current rules, so a store whose permission config was generated by an earlier, defective version converges to the corrected behavior on the next run. A rule not previously emitted by the generator (including one an operator added by hand) SHALL be left untouched.

For a rule whose enforcement primitive is invoked by an absolute path resolved per the requirement above, `contexture adapters generate` SHALL additionally remove any existing rule that matches the current rule in every respect except that resolved absolute path, before writing the current rule — so a permission config that has accumulated one such rule per checkout that has ever run the generator converges to exactly one rule on the next run, not only when the generator's own version changes.

#### Scenario: A stale generated rule is removed on regenerate
- **WHEN** `contexture adapters generate` runs against a permission config file containing a rule emitted by a previous version of the generator that the current version no longer emits
- **THEN** the stale rule is absent from the file after generation, and a rule the current version does emit is present

#### Scenario: A hand-added rule survives regeneration
- **WHEN** an operator has added a rule to the permission config file that the generator has never emitted
- **THEN** running `contexture adapters generate` again leaves that rule in place

#### Scenario: A rule left behind by a prior run from a different checkout is replaced, not accumulated
- **WHEN** a permission config already contains a rule this same generator emitted on an earlier run, whose only difference from the rule the current run would emit is the absolute path baked into it
- **THEN** running `contexture adapters generate` leaves exactly one such rule in the file — the one it just emitted — and removes the other

### Requirement: A harness-generation adapter declares where that harness reads skills
A harness-generation adapter at interface version 2 SHALL declare the store-relative directory the harness it represents reads skills from. Contexture SHALL treat that declaration as the location to bridge to the store's canonical skills directory, and SHALL NOT derive it by inspecting the host machine. A store MAY override an adapter's declared directory in its own adapter declaration, so a harness configured to read a different location — including the canonical one directly, needing no bridge — is expressible without changing the adapter. `adapters.compatibility` SHALL report a configured harness-generation adapter whose interface version is below 2, and the commands that write skills SHALL refuse to run it per the existing version-mismatch rule rather than guessing a directory for it.

#### Scenario: The declared directory is what gets bridged
- **WHEN** a store declares a harness-generation adapter whose declared skills directory differs from the configured skills path
- **THEN** that directory is bridged to the configured skills path, taken verbatim from the adapter's declaration

#### Scenario: A store overrides an adapter's directory
- **WHEN** a store's adapter declaration names its own skills directory for that harness
- **THEN** the store's value is used instead of the adapter's default, and a value equal to the configured skills path results in no bridge being created

#### Scenario: A stale harness adapter is reported
- **WHEN** a configured harness-generation adapter declares interface version 1
- **THEN** `doctor` reports an `adapters.compatibility` finding naming it, before any command relies on it for a skills directory

### Requirement: Generating a harness entry file is optional at interface version 2
A harness-generation adapter at interface version 2 SHALL be permitted to declare no entry file and no entry-file rendering, so a harness that reads the canonical entry document directly can be expressed without inventing a redundant wrapper file for it. Contexture SHALL generate an entry file for exactly those adapters that declare one, and the absence of a declaration SHALL NOT be treated as an error or a degraded configuration.

#### Scenario: A skills-only adapter writes no entry file
- **WHEN** a store declares a harness-generation adapter that declares a skills directory but no entry file
- **THEN** no harness entry file is generated for it, no error is reported, and its skills directory still receives every skill

#### Scenario: An adapter that declares an entry file still gets one
- **WHEN** a store declares a harness-generation adapter that declares an entry file
- **THEN** that file is generated exactly as before this change
