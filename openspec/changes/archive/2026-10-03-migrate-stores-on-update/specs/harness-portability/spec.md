## MODIFIED Requirements

### Requirement: Upgrading the CLI is an owned skill that asks before it acts
contexture SHALL ship `ctxr-upgrade` as a contexture-owned skill delivered by init and refreshed by update, like every other owned skill. The rendered skill SHALL take the installed and published versions from the CLI's own release check rather than from an advisory that may have gone stale; SHALL stop, reporting what it found, when the CLI reports the running executable as a linked working copy rather than a global installation, instead of instructing a package-manager install that would not affect the executable in use; SHALL likewise stop when the CLI reports a global installation that the running user cannot write to, stating that the executable is managed by whatever installed it and is upgraded there — for a container image, by moving to a newer image — instead of instructing a package-manager install that would be refused; SHALL gate the install behind an explicit operator approval, because upgrading the executable changes every store on the machine and not only the one at hand; SHALL order the package upgrade before the store re-render, so the re-render is performed by the upgraded executable rather than by the one being replaced; and SHALL instruct that the re-render happen from a session worktree, since it writes contexture-owned files and is subject to the same write path as any other change.

The skill drives the package manager rather than a contexture command, in the same way the submit and land skills drive `git` and `gh`: there is no contexture command that upgrades the CLI, and the store-update command re-renders a store rather than replacing an executable.

#### Scenario: A linked working copy stops the skill before any install
- **WHEN** an agent follows the rendered upgrade skill and the CLI reports the running executable as a linked working copy
- **THEN** the skill stops and reports the install it found, and instructs no package-manager install

#### Scenario: The upgrade is gated, and ordered before the re-render
- **WHEN** an agent follows the rendered upgrade skill against a global installation the running user can write to, with a newer release published
- **THEN** the operator's approval is obtained before any install runs, the package upgrade precedes the store re-render, and the re-render step follows a confirmation that the upgraded executable is the one now on the path

#### Scenario: Update delivers the skill to an existing store
- **WHEN** a store initialized before this change runs the update command
- **THEN** the upgrade skill is present at the configured skills path carrying the managed header, discoverable exactly as every other owned skill is

#### Scenario: An install the user cannot write stops the skill before any install
- **WHEN** an agent follows the rendered upgrade skill and the CLI reports a global installation that the running user cannot write to
- **THEN** the skill stops, reports the install location and that it is managed by whatever installed it, names moving to a newer image as the remedy when the executable shipped in one, and instructs no package-manager install
