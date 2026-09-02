## MODIFIED Requirements

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query,
a derived-artifact build, a disclosure-gate evaluation, following one skill by path at the configured
skills path, and confirming that the external tooling the shipped write-path skills invoke is present —
and SHALL exit non-zero naming the first failing operation if any operation fails.

The command SHALL offer an isolated mode. In that mode it SHALL create a disposable checkout of the
store's recorded commit, SHALL run the exercised operations against that checkout in a separate process
whose environment has the harness home directory and the store-root variable removed, SHALL report
which commit it verified, and SHALL remove the disposable checkout whether or not the operations
succeeded. Isolation SHALL be produced by that mechanism rather than asserted of the implementation.
Outside that mode the command SHALL operate on the working tree.

Presence of external tooling SHALL be determined by resolving a tool name that contexture itself
names, on the executable search path. The command SHALL NOT execute a tool in order to check it, SHALL
NOT install one, and SHALL NOT accept a tool name, version constraint, or command line from the store's
configuration.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in isolated mode against a store whose operations all succeed
- **THEN** it exits 0, and its output names the commit that was verified

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero, its output names which specific operation failed, and no later operation is run

#### Scenario: The isolated run cannot see the operator's home directory
- **WHEN** the portability test runs in isolated mode
- **THEN** the operations execute in a process whose home directory is an empty location containing no harness state, and that location is still empty when the run finishes

#### Scenario: Uncommitted work does not affect the isolated run
- **WHEN** the working tree contains an edit that would fail an exercised operation, and the portability test runs in isolated mode against a commit that predates that edit
- **THEN** the run reports the operations as they behave at that commit, and names the commit it verified

#### Scenario: The disposable checkout is always reclaimed
- **WHEN** the portability test runs in isolated mode and an exercised operation fails
- **THEN** the disposable checkout is removed and the repository is left with the same checkouts registered as before the run

#### Scenario: No commit to verify
- **WHEN** the portability test runs in isolated mode against a repository with no commit yet
- **THEN** it exits non-zero naming that there is no commit to verify, and creates no checkout

#### Scenario: The disclosure gate is exercised as a store operation
- **WHEN** the portability test evaluates the disclosure gate for a note against a context the store does not declare
- **THEN** the operation passes if the gate returns a verdict naming the rung that decided it, whichever verdict that is, and fails only if no verdict is produced

#### Scenario: Missing write-path tooling is reported by the portability test, not by the gate
- **WHEN** the external tool that the shipped submit and land skills invoke is absent from the executable search path
- **THEN** the portability test exits non-zero naming that tool, while `ctxr doctor` and `ctxr lint` report nothing about it
