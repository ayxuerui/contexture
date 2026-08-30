## Purpose

Extends the agent-identity capability (see `bootstrap-contexture-core`): identity files are edited by section, never rewritten wholesale.

## ADDED Requirements

### Requirement: Identity files are edited by section
`ctxr identity add|replace|remove <file> --section <name>` SHALL append a line under the named heading (creating it when absent), replace the line matching a given prefix, or remove it, leaving every other section unchanged. It SHALL refuse a file with no section headings rather than guess its structure.

#### Scenario: A fact is added under a new section
- **WHEN** `identity add` targets a section that does not exist
- **THEN** the section is created at the end of the file containing the new line and all existing sections are byte-identical

#### Scenario: A structureless file is refused
- **WHEN** the target file contains no headings
- **THEN** the command exits with a distinct error and writes nothing
