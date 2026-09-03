## MODIFIED Requirements

### Requirement: Commits are validated before they are accepted
The store SHALL install a version-controlled pre-commit hook that runs a staged-changes validation (schema conformance, fence integrity, a secret-pattern scan, a path allowlist, and a diff-size ceiling) and refuses the commit if any check fails, naming the specific violation.

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
