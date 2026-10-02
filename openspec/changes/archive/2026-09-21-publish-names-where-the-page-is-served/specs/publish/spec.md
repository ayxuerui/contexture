## ADDED Requirements

### Requirement: A page command names the address its page is served at
`ctxr publish new` and `ctxr publish check` SHALL each report, alongside their existing result, the
address at which the store's browsing surface serves the page they name, so that address is never
inferred by the caller. The reported address SHALL name the page's index file rather than the page's
directory, because the serving routes address files and answer no directory request.

When the store root the command resolved is a session worktree, the reported address SHALL be the
one that worktree's pages are previewable at, and the command SHALL additionally report the address
the same page is served at once that worktree's work reaches the store's default branch. When the
resolved store root is not a session worktree, the reported address SHALL be the published-pages
address, and no second address SHALL be reported, because that address is already the durable one.
The reported address SHALL name which of the store's serving routes it belongs to, rather than
leaving that to be read off the address itself.

When the store's configuration declares a base URL for its browsing surface, the reported address
SHALL be absolute against it, preserving any path that base URL itself carries. When the
configuration declares none, the server-relative route alone SHALL be reported and no origin SHALL
be invented.

`ctxr publish check` SHALL report no address for a file that lies outside the store's configured
publish path, since no route in the store serves it, and SHALL report the address whether its checks
passed or failed. Reporting an address SHALL gate nothing and SHALL NOT change either command's
exit code.

#### Scenario: A page created in a session worktree is named at its previewable address
- **WHEN** `ctxr publish new folder-a/example-page` runs with the resolved store root being a session worktree
- **THEN** the reported address is the previewable address for that worktree and that page, names the worktree it belongs to, and is reported together with the address the page is served at once that worktree's work lands

#### Scenario: A page created in the store's own checkout is named at its published-pages address
- **WHEN** `ctxr publish new folder-a/example-page` runs with the resolved store root not being a session worktree
- **THEN** the reported address is the published-pages address for that page, and no second address is reported

#### Scenario: A checked page reports its address on both the passing and the failing path
- **WHEN** `ctxr publish check <path>` runs against a page under the store's configured publish path
- **THEN** the address is reported whether the command exits with the success code or names failing checks

#### Scenario: A checked file outside the publish path is reported at no address
- **WHEN** `ctxr publish check <path>` runs against a file that is not under the store's configured publish path
- **THEN** no address is reported, exactly as no filing verdict is reported for such a file

#### Scenario: Without a declared base URL the address is server-relative
- **WHEN** a page's address is reported and the store's configuration declares no base URL for its browsing surface
- **THEN** the reported address is the server-relative route alone and names no host

#### Scenario: With a declared base URL the address is absolute
- **WHEN** a page's address is reported and the store's configuration declares a base URL for its browsing surface
- **THEN** the reported address is that base URL joined to the same route, and any path the base URL itself carries is preserved rather than discarded

#### Scenario: The address names a file, not a directory
- **WHEN** a page's address is reported
- **THEN** it names the page's index file, because the route that serves it answers no request for the page's directory
