## Purpose

Extends the context-store capability (see `bootstrap-contexture-core`) with a structured append primitive.

## ADDED Requirements

### Requirement: A line can be appended into a named fenced region
`ctxr entry append <note> --region <name>` SHALL insert the given text as a new line at the end of the note's `contexture:<name>` fenced region, creating the region at the end of the body when absent, and SHALL leave every byte outside the region — including frontmatter — unchanged. It SHALL report the region name and its resulting line count.

#### Scenario: Append into an existing region
- **WHEN** the note contains a `contexture:ledger` region with two lines and the command appends one
- **THEN** the region holds three lines, the reported count is 3, and the rest of the note is byte-identical

#### Scenario: The region is created when absent
- **WHEN** the note has no `contexture:ledger` region
- **THEN** the region is created at the end of the body containing the single appended line
