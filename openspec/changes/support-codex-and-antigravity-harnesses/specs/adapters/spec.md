## ADDED Requirements

### Requirement: A harness-generation adapter may declare how much of the entry document its harness reads
A harness-generation adapter SHALL be permitted to declare the largest entry document, in bytes, that the harness it represents loads in full; content past that size is content the harness never sees. The declaration SHALL be optional — an adapter whose harness reads the entry document whole declares none — and adding it SHALL NOT change the harness-generation interface version. A store MAY override an adapter's declared limit in its own adapter declaration, with a positive integer, so a harness its operator has configured to read more (or less) is expressible without changing the adapter. The override SHALL be optional and SHALL carry no shipped default: a store that declares none uses the adapter's declaration, and a store whose adapter declares none and that sets none has no limit for that harness.

#### Scenario: An adapter's declared limit is the effective one
- **WHEN** a store declares a harness whose adapter declares a read limit, and the store's declaration for it names none
- **THEN** that adapter's declared limit is the harness's effective limit

#### Scenario: A store override replaces the adapter's limit
- **WHEN** a store's declaration for that harness names its own entry-document read limit
- **THEN** the store's value is the effective limit, in place of the adapter's

#### Scenario: A harness with no declared limit has none
- **WHEN** a store declares a harness whose adapter declares no read limit and the store names none
- **THEN** no limit applies to that harness, and nothing is reported about the entry document's size on its account

#### Scenario: A non-positive override is refused
- **WHEN** a store's adapter declaration names an entry-document read limit of zero or a negative number
- **THEN** loading the configuration fails, naming the adapter and the key
