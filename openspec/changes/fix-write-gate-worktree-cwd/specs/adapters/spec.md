## MODIFIED Requirements

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
