## MODIFIED Requirements

### Requirement: The shared skills are one text on both surfaces
The owned skills the plugin carries SHALL be one text, from one template, that an agent follows in a shell running `ctxr` or through the store's server's tools. Each SHALL open with one shared section saying how to tell the two apart and how a `ctxr` step, a path and a commit are done through the server. A store's copy and the plugin's copy SHALL differ only in store values, which the plugin names by placeholders. The second-opinion skill SHALL be one of them, since the store's server runs `ctxr second-opinion`. The upgrade and Circleback skills, which run other local programs, and the land and derived-artifacts skills SHALL stay out of it.

#### Scenario: A store's copy and the plugin's copy differ only in values
- **WHEN** a shared skill is rendered for a store and for the plugin
- **THEN** replacing each of the store's values in the store's copy by its placeholder yields the plugin's copy

#### Scenario: The plugin carries no shell-only skill
- **WHEN** the plugin is built
- **THEN** it carries the capture and second-opinion skills with the shared section, and not the upgrade or land skills

## ADDED Requirements

### Requirement: The plugin opens a second opinion by a typed command
The plugin's command map SHALL map `second-opinion` to `ctxr-second-opinion`, so `/contexture:second-opinion` opens that skill's render through the same check as every other command.

#### Scenario: The second-opinion command opens its skill
- **WHEN** the plugin is built
- **THEN** `commands/second-opinion.md` carries the `ctxr-second-opinion` render followed by the person's arguments

### Requirement: Each model CLI runs from a fresh home holding only its login
Where its run is confined (next requirement), `ctxr second-opinion` SHALL run each model CLI with a fresh temporary folder as both its `HOME` and its working directory, holding at the start only a copy of that CLI's declared login files, and SHALL remove the folder when the run ends. A login file the run changed SHALL be copied back over the original only when the original is unchanged since it was copied.

#### Scenario: A critic starts with only its login
- **WHEN** a confined critique runs with stub CLIs that list their `HOME`
- **THEN** each stub's `HOME` held only its own declared login file, it was the stub's working directory, and it no longer exists after the run

#### Scenario: A refreshed login is kept
- **WHEN** the stub `codex` rewrites its `auth.json` during a confined run, and the original was not changed meanwhile
- **THEN** the original `auth.json` holds the stub's rewrite after the run

### Requirement: A model CLI's run is confined to its folder where the kernel allows
Where `setpriv` applies Landlock rules, `ctxr second-opinion` SHALL wrap each model CLI so that it can read only the declared system paths, the CLI's install directory and its folder, and write only its folder. Where it cannot, the run SHALL use the real `HOME` and a scratch working directory as before. `preflight` SHALL run each CLI as a critique would, confinement included, and report whether it was confined and, if not, why.

#### Scenario: A confined critic cannot read outside its folder
- **WHEN** a critique runs on a machine whose `setpriv` supports Landlock, and the stub `codex` tries to read a file outside its folder
- **THEN** the read fails with a permission error, the stub reports it, and the critique completes

#### Scenario: An unconfined machine says so
- **WHEN** `ctxr second-opinion preflight` runs where `setpriv` has no Landlock support
- **THEN** it reports each CLI as not confined, with the reason, and its exit code is unaffected by that alone
