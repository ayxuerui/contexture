## MODIFIED Requirements

### Requirement: The baseline conventions carry the every-turn rules of any store
The shipped baseline conventions, inlined into every store's entry document, SHALL state:
- that notes are written in outliner bullets rather than prose paragraphs unless the operator asks otherwise;
- that notes link liberally with wikilinks, and that creating a note includes suggesting links to existing notes;
- that a note's existing content is extended rather than overwritten unless a rewrite is asked for;
- the task format: a checkbox with a dated parenthetical for added, due, and done, and a marker for in progress;
- that credentials and full card or account numbers never enter the store, only their last four digits;
- that scratch and intermediate files go in the store's configured scratch path, `harness.scratch_path` (a convention key defaulting to `/tmp/`), never into the store or the home directory;
- that notes carry no access control, so sensitive material is placed deliberately and marked in the note when it must not be quoted onward;
- that a tool the agent needs is installed as the running user, with its publisher's own installer, into the user's home — never with elevated privileges and never into the store — and that when the package manager's global location is not writable the agent reports it and stops rather than escalating.

A store's house conventions MAY state a different rule, and the more specific rule applies.

#### Scenario: The baseline states the every-turn rules
- **WHEN** the entry document is generated for a store on the default configuration
- **THEN** its baseline conventions state the outliner, wikilink, preserve-content, task-format, last-four-digits, scratch-path, no-access-control, and tool-install rules

#### Scenario: The scratch path follows configuration
- **WHEN** a store sets `harness.scratch_path` to `/var/tmp/ctx/` and the entry document is regenerated
- **THEN** the baseline names `/var/tmp/ctx/` as where scratch files go

#### Scenario: The install rule names no deployment's layout
- **WHEN** the entry document is generated for a store on the default configuration
- **THEN** the tool-install rule names the user's home, the publisher's own installer, and the check of the package manager's global location, and names no particular directory, environment variable, or container

### Requirement: Upgrading the CLI is an owned skill that asks before it acts
contexture SHALL ship `ctxr-upgrade` as a contexture-owned skill delivered by init and refreshed by update, like every other owned skill. The rendered skill SHALL take the installed and published versions from the CLI's own release check rather than from an advisory that may have gone stale; SHALL stop, reporting what it found, when the CLI reports the running executable as a linked working copy rather than a global installation, instead of instructing a package-manager install that would not affect the executable in use; SHALL likewise stop when the CLI reports a global installation that the running user cannot write to, instead of instructing a package-manager install that would be refused, SHALL forbid retrying it with elevated privileges, and SHALL name the remedies for the operator: a package-manager global prefix in the user's home, which makes the next install writable, or, for an executable that shipped in a container image, a newer image; SHALL gate the install behind an explicit operator approval, because upgrading the executable changes every store on the machine and not only the one at hand; SHALL order the package upgrade before the store re-render, so the re-render is performed by the upgraded executable rather than by the one being replaced; and SHALL instruct that the re-render happen from a session worktree, since it writes contexture-owned files and is subject to the same write path as any other change.

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
- **THEN** the skill stops, reports the install location, forbids retrying the install with elevated privileges, names a package-manager global prefix in the user's home and, for an executable that shipped in a container image, a newer image as the remedies, and instructs no package-manager install
