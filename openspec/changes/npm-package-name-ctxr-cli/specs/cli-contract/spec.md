## MODIFIED Requirements

### Requirement: The CLI is distributed and invoked as `ctxr`
The command-line interface SHALL be invoked as `ctxr` and SHALL be distributed under the npm package `ctxr-cli`, so that installing the package places the `ctxr` executable on the user's path. The package name carries the conventional `-cli` suffix because the registry's package-name similarity check refuses unscoped `ctxr`; the executable name is not subject to that check and stays short. The package manifest's executable map SHALL expose `ctxr` as the primary executable and `contexture` as a compatibility alias resolving to the same entry point. The CLI's own usage output SHALL name itself `ctxr`.

Throughout this project's specs, a command written as `contexture <command>` denotes invoking this executable with that subcommand. The executable's name and the package's name are bound here and nowhere else, so a future rename of either touches this requirement, not every scenario that names a command.

#### Scenario: The package installs the executable under both names
- **WHEN** the package is packed or installed
- **THEN** its name is `ctxr-cli`, and its executable map declares `ctxr` and `contexture` pointing at the same entry point

#### Scenario: Usage output names the executable
- **WHEN** the CLI is invoked with `--help`
- **THEN** the usage line names `ctxr`, and no usage line names `contexture` as the executable
