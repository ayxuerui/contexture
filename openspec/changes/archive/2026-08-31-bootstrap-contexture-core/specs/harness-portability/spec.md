## Purpose

Ensures that a context store's conventions and procedures are readable and followable by any agent harness — not just the one that happens to be running — by naming one canonical entry document, one root-resolution rule, and one executable proof that the store works without harness-specific state.

## ADDED Requirements

### Requirement: `AGENTS.md` is the canonical entry document
Every context store SHALL carry an `AGENTS.md` file at its root that is the canonical, harness-agnostic index of the store's conventions and procedures. A harness-specific entry file (for example, one named for a particular agent product) SHALL contain nothing beyond an import of `AGENTS.md` plus that harness's own extras, and SHALL NOT duplicate canonical content.

#### Scenario: A harness-specific entry file only imports
- **WHEN** a store's `contexture.yaml` declares a harness-specific entry filename
- **THEN** `contexture doctor` fails if that file contains convention text not present in `AGENTS.md`, and passes when it contains only the import plus harness-specific extras

#### Scenario: Reading only `AGENTS.md` is sufficient
- **WHEN** an agent with no harness-specific context reads `AGENTS.md` at a store's root
- **THEN** it finds the root-resolution rule, the frontmatter schema pointer, the write-path rule, and an index of every store procedure, without needing to read any other file

### Requirement: Root resolution precedence
Any contexture command SHALL resolve the store root in this order: an explicit `--root` argument; the `CONTEXTURE_ROOT` environment variable; walking up from the current working directory looking for `contexture.yaml`. If none resolves, the command SHALL exit non-zero naming that no store root was found, and SHALL NOT guess a fallback location.

#### Scenario: Explicit argument overrides an inherited environment variable
- **WHEN** a command is invoked with `--root /path/a` while `CONTEXTURE_ROOT=/path/b` is set in the environment
- **THEN** the command operates against `/path/a`

#### Scenario: No root resolves
- **WHEN** a command is invoked with no `--root`, no `CONTEXTURE_ROOT`, and no `contexture.yaml` found by walking up from the current directory
- **THEN** the command exits non-zero with a message naming that no store root was found, and performs no store operation

### Requirement: Exactly one root environment variable and one root flag
The store root SHALL be addressable by exactly one environment variable and one command-line flag. No alias environment variable or flag name SHALL be introduced for the same purpose.

#### Scenario: No alias is recognized
- **WHEN** an operator sets an environment variable other than the one documented root variable, intending it to select the store root
- **THEN** contexture does not recognize it and falls through to the next resolution step

### Requirement: Procedures are portable markdown reached by path
Reusable store procedures SHALL be markdown files reachable by a documented path from `AGENTS.md`, readable and followable by any agent capable of reading files, independent of any harness's auto-discovery mechanism.

#### Scenario: A non-auto-discovering harness follows a procedure
- **WHEN** an agent harness with no automatic skill-discovery mechanism is given the path to a procedure listed in `AGENTS.md`
- **THEN** the agent can read and follow that procedure's file directly, with no harness-specific adaptation required

### Requirement: Executable portability test
The store SHALL provide a command that exercises core store operations — at minimum, a retrieval query, a derived-artifact build, and following one procedure via the `AGENTS.md` index — from an environment with no harness-specific state present, and SHALL exit non-zero naming the first failing operation if any operation fails.

#### Scenario: Portability test passes with no harness state
- **WHEN** the portability test command runs in a freshly created worktree with no harness-specific configuration or state directories present
- **THEN** it exits 0

#### Scenario: Portability test names the failure
- **WHEN** one of the exercised operations fails during the portability test
- **THEN** the command exits non-zero and its output names which specific operation failed
