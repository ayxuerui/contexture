## ADDED Requirements

### Requirement: Upgrading the CLI is an owned skill that asks before it acts
contexture SHALL ship `ctxr-upgrade` as a contexture-owned skill delivered by init and refreshed by update, like every other owned skill. The rendered skill SHALL take the installed and published versions from the CLI's own release check rather than from an advisory that may have gone stale; SHALL stop, reporting what it found, when the CLI reports the running executable as a linked working copy rather than a global installation, instead of instructing a package-manager install that would not affect the executable in use; SHALL gate the install behind an explicit operator approval, because upgrading the executable changes every store on the machine and not only the one at hand; SHALL order the package upgrade before the store re-render, so the re-render is performed by the upgraded executable rather than by the one being replaced; and SHALL instruct that the re-render happen from a session worktree, since it writes contexture-owned files and is subject to the same write path as any other change.

The skill drives the package manager rather than a contexture command, in the same way the submit and land skills drive `git` and `gh`: there is no contexture command that upgrades the CLI, and the store-update command re-renders a store rather than replacing an executable.

#### Scenario: A linked working copy stops the skill before any install
- **WHEN** an agent follows the rendered upgrade skill and the CLI reports the running executable as a linked working copy
- **THEN** the skill stops and reports the install it found, and instructs no package-manager install

#### Scenario: The upgrade is gated, and ordered before the re-render
- **WHEN** an agent follows the rendered upgrade skill against a global installation with a newer release published
- **THEN** the operator's approval is obtained before any install runs, the package upgrade precedes the store re-render, and the re-render step follows a confirmation that the upgraded executable is the one now on the path

#### Scenario: Update delivers the skill to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** the upgrade skill is present at the configured skills path carrying the managed header, discoverable exactly as every other owned skill is

### Requirement: The lifecycle skill offers the upgrade without blocking the session
The rendered session-lifecycle skill's start step SHALL, when the session-start command reports that a newer release is published, instruct the agent to name the installed and published versions to the operator and to offer the upgrade skill. It SHALL NOT instruct the agent to upgrade unasked, and SHALL NOT make the session's continuation conditional on the operator's answer: a deferred or declined upgrade continues the session unchanged. When the start command reports no newer release, or reports that the check could not be completed, the start step SHALL proceed without raising either as a problem.

#### Scenario: A newer release is offered, not imposed
- **WHEN** an agent follows the rendered lifecycle skill's start step and the start command reports a newer release
- **THEN** the operator is told the installed and published versions and offered the upgrade skill, and the session continues whether the operator accepts, defers, or declines

#### Scenario: A failed check is not raised as a problem
- **WHEN** the start command reports that the release check could not be completed
- **THEN** the start step continues the session without offering an upgrade and without reporting a store problem
