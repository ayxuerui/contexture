## Purpose

Extends the harness-portability and adapters capabilities (see `bootstrap-contexture-core`): procedures reach harnesses with native skill discovery directly. (An earlier draft of this change generated pointer wrappers; superseded by `entry-doc-generation` D5 — procedures ship as contexture-owned skill copies at the skill-discovery path, with no wrapper.)

## ADDED Requirements

### Requirement: Procedures are reachable at a skill-discovery path
The configured procedures path SHALL be usable as a harness's native skill directory, so a harness with skill auto-discovery finds every procedure without an intermediate file, while any other harness reaches the same file by path from `AGENTS.md`.

#### Scenario: A skill-discovering harness surfaces every procedure without an intermediate hop
- **WHEN** a store's procedures path is that harness's skill directory
- **THEN** every procedure is discoverable there as a complete skill file — the file the harness loads is the file `AGENTS.md` indexes
