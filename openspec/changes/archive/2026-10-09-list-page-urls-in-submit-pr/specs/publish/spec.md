## ADDED Requirements

### Requirement: A change set's pages are reported at every address they have
`ctxr publish urls` SHALL report, for the pages a change set adds, modifies, moves or removes under the
store's configured publish path, each page's status and the addresses it is served at, so that a caller
describing the change never derives an address. The change set SHALL be the staged changes when `--staged` is
given, or the changes since a base ref when `--since <ref>` is given; the command SHALL require exactly one of
the two and refuse otherwise. A page is identified by its index file, and files outside the publish path or
that are not an index file SHALL NOT produce an entry.

Each entry SHALL carry a status of added, modified, moved or removed. A moved page SHALL additionally carry
the path and published address it had before, which stops working once the move lands. A removed page SHALL
carry only its published address, flagged as ceasing to work, and no preview address. An added, modified or
moved page SHALL be reported at the published address and, when the resolved store root is a session
worktree, also at the address it is previewable at; outside a session worktree only the published address
SHALL be reported. Addresses SHALL follow the same rules as those `ctxr publish new` reports: absolute
against `serve.base_url` when declared, preserving any path it carries, and otherwise the server-relative
route alone with the report stating that no base URL is declared and no origin invented.

When the store configures `serve.previews` as `none`, no preview address SHALL be reported for any page.
`serve.previews` SHALL be optional with no shipped default, and a store that omits it SHALL behave as one that
configures `local`. The command SHALL offer a machine-readable form carrying the same information, SHALL exit
successfully when the change set contains no pages, and SHALL gate nothing.

#### Scenario: A page added in a session worktree is reported at both addresses
- **WHEN** `ctxr publish urls --since <ref>` runs in a session worktree whose change set adds a page's index file
- **THEN** the entry has status added, a preview address naming the worktree, and the published address

#### Scenario: A moved page names the address that stops working
- **WHEN** the change set renames a page's index file into a subject folder
- **THEN** the entry has status moved, the new addresses, and the old path with the old published address

#### Scenario: A removed page has no preview
- **WHEN** the change set deletes a page's index file
- **THEN** the entry has status removed and its published address, and no preview address

#### Scenario: No base URL declared yields bare routes and says so
- **WHEN** the configuration declares no `serve.base_url`
- **THEN** every address is a server-relative route and the report states that none is declared

#### Scenario: Previews configured off drop the preview address
- **WHEN** `serve.previews` is `none` and the change set adds a page in a session worktree
- **THEN** the entry carries the published address only

#### Scenario: A change set with no pages is not an error
- **WHEN** the change set touches nothing under the publish path
- **THEN** the report is empty and the command exits with the success code

#### Scenario: The change set must be named exactly once
- **WHEN** the command runs with neither `--staged` nor `--since`, or with both
- **THEN** it refuses with a usage error and reports nothing
