## MODIFIED Requirements

### Requirement: The path gate
A markdown path being staged or captured SHALL be refused when its canonical location is outside the store or when reaching it traverses a symbolic link whose target is outside the store. When configuration declares writable paths, such a path SHALL additionally be refused unless it falls under a configured taxonomy layer, the configured capture root, a declared writable path, or a contexture-owned location; with no declaration every in-store path is accepted. Sanctioning the capture root — rather than only the inbox within it — is what keeps the retained-capture write that ingest itself performs from being refused by a store that declares writable paths. The staged path check (run by `doctor --staged` from the pre-commit hook) and the capture command SHALL apply the same rule.

#### Scenario: A symlink escape is refused at commit time
- **WHEN** a staged markdown file's path resolves through a link to a directory outside the store
- **THEN** `doctor --staged` fails with a finding naming the path

#### Scenario: Undeclared writable paths accept any in-store note
- **WHEN** configuration declares no writable paths and a note is staged outside every layer
- **THEN** the path check passes

#### Scenario: Declared writable paths gate capture
- **WHEN** configuration declares writable paths and a proposal item targets a path under none of the sanctioned locations
- **THEN** `session capture` refuses that item, writes nothing for it, and still applies the other items

#### Scenario: A retained capture is sanctioned outside the inbox
- **WHEN** configuration declares writable paths and ingest moves a capture from the inbox into the capture tier's dated directory
- **THEN** the path check passes, because the destination falls under the configured capture root
