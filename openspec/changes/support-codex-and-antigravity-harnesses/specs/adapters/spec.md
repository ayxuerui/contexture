## ADDED Requirements

### Requirement: A harness-generation adapter may declare how much of the entry document its harness reads
A harness-generation adapter SHALL be permitted to declare the largest entry document, in bytes, that the harness it represents loads in full. Content past that size is content the harness never sees. The declaration SHALL be optional: an adapter whose harness reads the entry document whole declares none. Adding the declaration SHALL NOT change the harness-generation interface version. The declarations are the record of each harness's measured limit, and the entry document's global size limit is derived from them (harness-portability). A store SHALL NOT override an individual adapter's declaration.

#### Scenario: An adapter's declared limit is readable
- **WHEN** the built-in `antigravity` adapter is resolved
- **THEN** it declares an entry-document read limit of 24,000 bytes

#### Scenario: A harness with no declared limit has none
- **WHEN** the built-in `claude-code` adapter is resolved
- **THEN** it declares no entry-document read limit
