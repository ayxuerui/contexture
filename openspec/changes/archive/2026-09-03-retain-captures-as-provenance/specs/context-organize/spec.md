## MODIFIED Requirements

### Requirement: Lint reports; it never fails a build
`contexture lint` SHALL report findings (orphaned notes, notes with no catalog entry as covered by context-catalog, broken links, material still sitting in the inbox) and SHALL always exit 0 when it completes its scan successfully, regardless of how many findings it reports. It SHALL NOT be used as a gate that blocks a commit or a session submission. A "broken link" finding SHALL cover a link that resolves to no note at all; a link that resolves ambiguously, to more than one note, is doctor's (per store-integrity), not lint's. The inbox finding SHALL be determined by a file's location under the configured inbox path, not by which frontmatter fields it carries, since a capture is not a note and is not enumerable as one.

#### Scenario: Findings do not produce a non-zero exit
- **WHEN** `lint` finds several orphaned notes and broken links
- **THEN** `lint` still exits 0, and its findings are only visible in its report output

#### Scenario: Lint is distinct from doctor
- **WHEN** an operator wants a check that fails on a real invariant violation rather than merely reports a health observation
- **THEN** they run `doctor` (defined in the store-integrity capability), not `lint`

#### Scenario: An ambiguous link is not a lint finding
- **WHEN** a link's target matches two or more notes' basenames
- **THEN** `lint` does not report it as a broken link, since ambiguous resolution is doctor's invariant (per store-integrity), not a lint observation

#### Scenario: Inbox material is reported by location, not by frontmatter
- **WHEN** a capture sits under the configured inbox path, whether or not it already carries a source type and source id
- **THEN** `lint` reports it as material still awaiting ingest, and stops reporting it once ingest has moved it out of the inbox
