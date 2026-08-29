## Purpose

Extends the harness-portability capability (see `bootstrap-contexture-core`, `contexture-home-layout`): the canonical entry document indexes operator-authored convention files, and its procedure surface reflects the store's actual procedure files.

## ADDED Requirements

### Requirement: Operator conventions are referenced documents indexed by the entry document
A store MAY carry operator-authored convention documents as markdown files at a configured path. The generated portion of `AGENTS.md` SHALL include an index of every convention file present — its title and, when declared, a one-line description, both read from the file's frontmatter with a fallback to its first heading or filename — and SHALL reference each by path rather than inlining its content. When no convention files exist, the section SHALL state where to add them.

#### Scenario: A convention file appears in the index on regeneration
- **WHEN** an operator adds a markdown file with a frontmatter title and description at the configured conventions path and the entry document is regenerated
- **THEN** the `AGENTS.md` conventions index lists that title, description, and path, and the file's body is not copied into `AGENTS.md`

#### Scenario: An empty store still explains the mechanism
- **WHEN** a store has no convention files and the entry document is generated
- **THEN** the conventions section names the configured path and states that operator conventions added there will be indexed

### Requirement: The procedure index reflects the files on disk
The `AGENTS.md` procedure index SHALL list every procedure markdown file present at the configured procedures path — the shipped pack and any operator-added files — deriving each entry's name and description from the file itself (frontmatter, first-heading, or filename fallback). Harness skill generation (per `contexture-home-layout`) SHALL cover the same scanned set. The portability test SHALL verify every scanned procedure has an index entry.

#### Scenario: An operator-added procedure joins the index and gains a skill wrapper
- **WHEN** an operator adds a new procedure file at the configured path and regeneration runs
- **THEN** the `AGENTS.md` index lists it and `adapters generate` produces a skill wrapper for it, identically to a shipped procedure

#### Scenario: Deleting a shipped procedure's index entry still fails the portability test
- **WHEN** a procedure file exists on disk but its index entry is removed from `AGENTS.md`
- **THEN** `verify --portable` exits non-zero naming that procedure
