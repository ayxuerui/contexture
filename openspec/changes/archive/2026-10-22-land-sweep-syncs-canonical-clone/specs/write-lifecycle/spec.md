## ADDED Requirements

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
