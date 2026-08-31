## ADDED Requirements

### Requirement: Requesting-context resolution precedence
Any command that filters by a requesting context SHALL resolve that context in this order: an explicit command argument; the requesting-context environment variable; a context declared for the current working directory by a store-recognized marker file, the longest matching path prefix winning; a default declared in `contexture.yaml`. If none resolves, the command SHALL behave exactly as it does when no requesting context is supplied, and SHALL report which step produced the context it used, or that none did. It SHALL NOT guess a context that appears in no note and no configuration.

#### Scenario: An explicit argument overrides the environment
- **WHEN** a command is invoked naming `ctx-a` while the requesting-context environment variable is set to `ctx-b`
- **THEN** the command filters as `ctx-a` and reports that the explicit argument produced it

#### Scenario: A marker file scopes a working directory
- **WHEN** a command is invoked with no explicit argument and no environment variable, from a directory covered by a marker file declaring `ctx-a`
- **THEN** the command filters as `ctx-a` and reports that the marker file produced it

#### Scenario: The longest matching prefix wins
- **WHEN** two marker files cover the current working directory, one at a path that is a prefix of the other
- **THEN** the more specific one's context is used

#### Scenario: Nothing resolves and behavior is unchanged
- **WHEN** no argument, environment variable, marker file, or configured default resolves a requesting context
- **THEN** the command behaves exactly as it does today when no requesting context is supplied, and reports that no context was resolved

### Requirement: A store can report what it would resolve
`ctxr doctor` SHALL report the requesting context the store would resolve in the current working directory and which step produced it, and SHALL report as a non-failing finding when that resolution reaches neither an explicit source nor a configured default — so an operator can see that filtered retrieval is, in this store, still opt-in per invocation.

#### Scenario: Resolution is visible without running a retrieval command
- **WHEN** `ctxr doctor` runs in a store with a configured default requesting context
- **THEN** it reports that context and names the step that produced it

#### Scenario: An unresolved context is surfaced without failing
- **WHEN** `ctxr doctor` runs in a store where no step resolves a requesting context
- **THEN** it reports that finding and does not fail the run on that basis alone
