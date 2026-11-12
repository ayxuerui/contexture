## ADDED Requirements

### Requirement: The server follows changes to the store's configuration
While it runs, `ctxr serve` SHALL check the store's configuration file before it answers each request. It SHALL
compare the file's modification time, size and file identity with the values from its last read. When any of
them differs, the server SHALL read and validate the file again, and SHALL answer that request and the following
ones with the result. A route SHALL answer exactly as it would after a restart with the same file. A check that
finds the file unchanged SHALL NOT read it.

When the file changes and does not load, the server SHALL keep answering every route this capability defines
with the last configuration that loaded. It SHALL write one line to stderr naming the file and the reason, and
SHALL write it again only when a later change also fails to load. A later change that loads SHALL take effect
with no restart. Nothing about a failed load SHALL reach a response body.

At startup a configuration that does not load still stops the command before it binds, as for any command.

#### Scenario: A changed setting applies without a restart
- **WHEN** `serve.previews` is changed from `local` to `none` in the configuration file of a running server
- **THEN** the next response computed from that setting follows `none`, and the server process is the same one
  that started

#### Scenario: A configuration that does not load leaves browsing up
- **WHEN** the configuration file of a running server is replaced with text that fails validation
- **THEN** every note, catalog, graph, published-page and review route answers as it did before the change, and
  stderr carries one line naming the configuration file and the reason

#### Scenario: A fix after a bad change applies
- **WHEN** a configuration that failed to load is replaced with one that loads
- **THEN** the next request uses the new configuration, and no further failure line is written

#### Scenario: An unchanged file is not read again
- **WHEN** a running server answers ten requests and the configuration file does not change
- **THEN** the file is read once in all, at startup
