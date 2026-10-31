## ADDED Requirements

### Requirement: A command brings the canonical clone up to date
`ctxr sync` SHALL fetch the forge's default branch into the store's canonical clone and fast-forward the clone to it
by the rule every landing run applies: only when the clone is on the default branch, has no uncommitted changes to
tracked files, and has not diverged. Otherwise it SHALL leave the clone exactly as it was and report which condition
failed, as a warning that keeps the success exit code.

#### Scenario: A clone behind the forge is fast-forwarded
- **WHEN** the canonical clone is clean, on the default branch, and behind the forge, and `ctxr sync` runs
- **THEN** the clone is fast-forwarded and the command reports the commit it moved from and the commit it moved to

#### Scenario: A clone with local work is left alone
- **WHEN** the canonical clone has uncommitted changes to a tracked file, and `ctxr sync` runs
- **THEN** the clone is unchanged, the command exits with the success code, and it reports the uncommitted changes as the reason

### Requirement: The canonical-clone sync fetches as landing does and changes nothing else
`ctxr sync` SHALL authenticate its fetch as landing does, so in App mode it fetches as the App. It SHALL report its
outcome as landing reports `canonical_sync`. A fetch that fails SHALL exit with the setup/usage code, naming the forge
as unreachable. It SHALL push nothing, and SHALL touch no path under `shared/`.

#### Scenario: An unreachable forge is reported
- **WHEN** the fetch fails because the forge cannot be reached
- **THEN** the command exits with the setup/usage code, naming the forge as unreachable, and the clone is unchanged
