## Purpose

Lets a member who has no shell and no clone, working in a native chat app, find, read and capture against a store through a remote MCP server whose every computation is deterministic, whose admission is decided by the operator, and whose writes reach the default branch only through a gate the store's own CI runs.

## ADDED Requirements

### Requirement: The store is served over MCP from a dedicated checkout
`ctxr mcp serve` SHALL serve the Model Context Protocol over the Streamable HTTP transport at the path `/mcp`, answering `initialize`, `ping`, `tools/list` and `tools/call`, accepting notifications with HTTP 202, and answering any other method with the JSON-RPC method-not-found error. It SHALL refuse to start unless the store root is a checkout of the configured default branch with no uncommitted change outside the derived paths. It SHALL emit exactly one result envelope once it is listening and then continue serving. No tool SHALL call a language model.

#### Scenario: The tool list answers
- **WHEN** an authorised client sends `initialize` and then `tools/list`
- **THEN** the server answers with its protocol version and server information, and lists every tool the token's scopes reach

#### Scenario: A dirty checkout is refused
- **WHEN** `ctxr mcp serve` is started on a checkout holding an uncommitted change to a note
- **THEN** it exits non-zero naming the uncommitted path, and serves nothing

#### Scenario: An unknown method is refused in protocol
- **WHEN** a client sends a method the server does not implement
- **THEN** the response is a JSON-RPC error with the method-not-found code, and the server keeps serving

### Requirement: The server binds to loopback unless the operator names a public address
The server SHALL bind to loopback by default. Binding to any other address SHALL require the operator to name the public HTTPS URL clients reach, which SHALL be the issuer of every authorisation the server grants and the base of its resource identifier. A request carrying an `Origin` header that matches neither that URL's origin nor, on a loopback bind, a loopback origin SHALL be refused with HTTP 403.

#### Scenario: A wide bind without a public URL is refused
- **WHEN** `ctxr mcp serve` is started with a non-loopback host and no public URL
- **THEN** it exits with the usage exit code and does not listen

#### Scenario: A foreign origin is refused
- **WHEN** a request to `/mcp` carries an `Origin` header naming a site other than the public URL
- **THEN** the server answers 403 and performs no tool call

### Requirement: Admission is decided by the operator and denied by default
Every request to `/mcp` SHALL carry a bearer token the server itself issued, or be answered 401 with a `WWW-Authenticate` header naming the server's protected-resource metadata. The server SHALL act as an OAuth 2.1 authorisation server for its own resource: it SHALL publish protected-resource and authorisation-server metadata, accept dynamic registration of public clients, require PKCE with the S256 method, refuse a redirect URI that is not exactly one the client registered, refuse a `resource` parameter naming any resource but its own, grant authorisation only to a person who presents a member access code the operator issued, and honour each authorisation code at most once, so a second redemption of a code already exchanged is refused. Unauthenticated operation SHALL be possible only on a loopback bind, by explicit operator choice.

#### Scenario: A request without a token is challenged
- **WHEN** a client calls `/mcp` without a bearer token
- **THEN** the server answers 401 with a challenge naming its protected-resource metadata, and performs no tool call

#### Scenario: A wrong access code grants nothing
- **WHEN** a person submits an access code that matches no member at the authorisation step
- **THEN** no authorisation code is issued and the client is not redirected with one

#### Scenario: An authorisation code is single use
- **WHEN** a client redeems an authorisation code for a token and then presents the same code and verifier again
- **THEN** the second redemption is refused and issues no token

#### Scenario: Plain PKCE is refused
- **WHEN** an authorisation request names the `plain` code-challenge method or no code challenge
- **THEN** the server refuses it and issues nothing

#### Scenario: Unauthenticated mode is refused off loopback
- **WHEN** `ctxr mcp serve` is started with authentication disabled and a non-loopback host
- **THEN** it exits with the usage exit code and does not listen

### Requirement: Scopes are assigned by the operator and checked on every call
Each member SHALL hold a set of scopes the operator assigns: `read`, which reaches `find` and `gather`, and `capture`, which reaches `capture`. A token SHALL carry at most its member's scopes; a client SHALL be able to request a narrower set but never a wider one. `tools/list` SHALL list only the tools the token's scopes reach, and every `tools/call` SHALL re-check both the scope and that the member still exists, so that removing a member refuses that member's next call even while a token issued to them has not expired.

#### Scenario: A read-only member cannot capture
- **WHEN** a member holding only `read` calls `capture`
- **THEN** the call is refused as insufficient scope and nothing is written

#### Scenario: Removal takes effect on the next call
- **WHEN** the operator removes a member and that member's client then calls any tool with an unexpired token
- **THEN** the call is refused and no tool runs

#### Scenario: A client cannot widen its grant
- **WHEN** a client requests `capture` for a member who holds only `read`
- **THEN** the token issued carries `read` alone

### Requirement: Membership is managed on the host and its secrets never enter the store
`ctxr mcp member add <name>` SHALL create a member with the scopes named on the invocation and return a freshly generated access code exactly once; only a one-way hash of the code SHALL be stored. `ctxr mcp member remove <name>` SHALL delete the member, after which every token issued to them SHALL be refused; a member later added under the same name SHALL NOT revive a token issued before. The server SHALL persist no issued client registration, authorisation code or token. `ctxr mcp member list` SHALL report each member's name and scopes and never a code or a hash. All server state SHALL live in a state directory the server refuses to use when it lies inside the store root.

#### Scenario: A code is shown once
- **WHEN** `ctxr mcp member add ctx-a --scope read` runs and `ctxr mcp member list` runs after it
- **THEN** the first reports an access code, and the second reports `ctx-a` with `read` and no code

#### Scenario: A state directory inside the store is refused
- **WHEN** any `ctxr mcp` command is given a state directory beneath the store root
- **THEN** it exits non-zero naming the directory and writes nothing there

### Requirement: `find` stands in for a client's own content matching
`find` SHALL accept an optional text, an optional path prefix and an optional result limit. Given text, it SHALL return every note the store's note enumeration admits that contains the text as a case-insensitive literal substring, each with its path, its catalog gloss, up to three matching lines with their line numbers, and a link to the note's browsing route when the store declares a base URL for its browsing surface, or none when it declares none. Results SHALL be ordered by path, SHALL carry no score or other relevance measure, and SHALL report how many matches a limit omitted. Matching captures under the capture root SHALL be returned in a separate field holding only unfiled material, each with its path and matching lines, never among the notes and never with a link. That field SHALL also hold matching inbox files on `capture/` branches the remote holds but the default branch does not yet contain, each marked as pending merge and naming its branch. A `capture/` branch SHALL count as pending only while its tip is not an ancestor of the default branch. Given no text, `find` SHALL return the catalog's sections, each with its notes' paths and glosses, narrowed by the prefix when one is given.

#### Scenario: A literal match is found and ordered by path
- **WHEN** `find` is called with text that appears in `work/b.md` and `work/a.md`
- **THEN** it returns `work/a.md` before `work/b.md`, each with its matching lines, and no score

#### Scenario: An excluded note is never returned
- **WHEN** the text appears only in a file under a path the store's exclusion configuration declares
- **THEN** that file appears in no field of the result

#### Scenario: An unfiled capture is reported apart from the notes
- **WHEN** the text appears in a capture waiting under the inbox path and in one note
- **THEN** the note is in the notes field, and the capture is in the unfiled field only

#### Scenario: A capture awaiting merge is visible as pending
- **WHEN** the text appears in an inbox file that exists only on an unmerged `capture/` branch
- **THEN** that file is in the unfiled field, marked pending merge and naming its branch, and in no other field

#### Scenario: No text returns the map
- **WHEN** `find` is called with no text
- **THEN** it returns the catalog's sections with each note's path and gloss, and performs no content matching

### Requirement: `gather` returns the retrieval pass with the bodies a client cannot read itself
`gather` SHALL accept the retrieval pass's entry selectors and traversal options and return the pass's result in the pass's order, adding to each note either its body or, once a declared byte budget is spent, no body. Bodies SHALL be attached to a prefix of the order only, so a later note never carries a body while an earlier one does not; when the first note alone exceeds the budget it SHALL be returned clipped to the budget and marked as clipped. A seed lying under the capture root SHALL be refused with a finding stating that the capture is not yet filed, before the pass runs.

#### Scenario: Bodies fill a prefix of the pass
- **WHEN** `gather` is called with a seed whose pass returns three notes and the budget admits only the first two bodies
- **THEN** the first two notes carry bodies, the third carries none, and the order is the pass's own

#### Scenario: A capture cannot seed the pass
- **WHEN** `gather` is called with a seed naming a file under the inbox path
- **THEN** the call fails stating the capture is not yet filed, and no pass runs

### Requirement: `capture` writes one new capture onto a pushed branch and never onto the default branch
`capture` SHALL accept a title, a body, a source type and optionally a source id; absent a source id, it SHALL assign one formed from the source type and a server-generated identifier. Before writing, it SHALL run the store's source check against the candidate over the identity records on the default branch together with the captures waiting on unmerged `capture/` branches, and refuse any verdict but new, naming the matching records, and SHALL refuse a body that fails the store's required-section rule for that source type. It SHALL then write exactly one new markdown file under the configured inbox path, whose name carries the same identifier as its branch so that no two captures can name the same file, on a new branch under the `capture/` prefix created from the remote default branch, in a worktree outside the store root; commit it with a trailer naming the member; push that branch to the store's remote; and return the branch, the file's path and the commit. It SHALL NOT write to, commit on, or push the default branch, and SHALL NOT modify any existing file. Captures SHALL be serialised from the duplicate check through the push, so that two simultaneous calls carrying one source identity produce at most one branch.

#### Scenario: A capture lands on its own branch
- **WHEN** a member holding `capture` calls `capture` with a title, a body and a source type
- **THEN** a new branch under `capture/` exists on the remote holding one new file under the inbox path, its commit names the member, and the remote default branch is unchanged

#### Scenario: Material already in the store is refused
- **WHEN** `capture` is called with a source id an identity record in the store already carries
- **THEN** the call is refused naming that record, and no branch is created

#### Scenario: A capture awaiting merge is a duplicate
- **WHEN** `capture` is called with a source id that an inbox file on an unmerged `capture/` branch already carries
- **THEN** the call is refused naming that branch's file, and no branch is created

#### Scenario: Simultaneous duplicates produce one branch
- **WHEN** two `capture` calls carrying the same source id arrive at the same moment
- **THEN** exactly one creates a branch, and the other is refused naming it

#### Scenario: A missing required section is refused before writing
- **WHEN** the store declares a required section for the source type and the body lacks it
- **THEN** the call is refused naming the section, and no branch is created

### Requirement: Merging a capture branch is gated by a check the store's CI runs
`ctxr mcp check-branch --base <ref>` SHALL exit with the check exit code, reporting one finding per violation, unless every change between the merge base with `<ref>` and `HEAD` adds a new markdown file directly under the configured inbox path, and every added file carries the capture source-identity fields context-ingest requires a capture to arrive with, carries neither field ingest alone assigns, and satisfies the store's required-section rule for its source type. It SHALL read the store's configuration from `<ref>`, never from the branch it judges, so a branch cannot redefine what the inbox path is. It SHALL exit zero otherwise. Whether a passing branch merges automatically or awaits review SHALL be the store's own configuration of its CI, not the server's.

#### Scenario: A branch that only adds a capture passes
- **WHEN** `check-branch` runs on a branch whose only change adds a well-formed capture under the inbox path
- **THEN** it exits zero with no finding

#### Scenario: A branch that edits a note fails
- **WHEN** `check-branch` runs on a branch that adds a capture and also modifies an existing note
- **THEN** it exits with the check exit code, naming the modified note

#### Scenario: A branch cannot move the inbox to pass itself
- **WHEN** `check-branch` runs on a branch that changes the configured inbox path in `contexture.yaml` and adds a file under the new path
- **THEN** it judges against the base's inbox path, exits with the check exit code, and names both changed paths

#### Scenario: A capture claiming to be ingested fails
- **WHEN** `check-branch` runs on a branch adding an inbox file that already carries a source hash
- **THEN** it exits with the check exit code, naming the file

### Requirement: The server keeps its checkout current and says what it served
Before serving a tool call, the server SHALL fetch the remote default branch and the remote's `capture/` branches and fast-forward its checkout to the default branch, at most once per a configured interval, never merging and never rebasing, and SHALL rebuild the derived graph whenever its `HEAD` moves or the graph is absent. Every tool call SHALL read from a single commit: no sync SHALL change the checkout or the graph while a tool call is reading, and no tool call SHALL read while a sync is changing them. A failed sync SHALL leave the checkout and the derived graph both at its last good commit, or, when that cannot be restored, the server SHALL refuse tool calls until a sync succeeds; and every tool result SHALL name the commit it was computed from and the last sync failure, or none, with no wall-clock value.

#### Scenario: A failed pull serves the last good state
- **WHEN** the remote is unreachable at sync time
- **THEN** the tool call is answered from the current checkout, and its result names that commit and the sync failure

#### Scenario: A call in flight is not split across commits
- **WHEN** a sync becomes due while a `gather` call is still reading
- **THEN** the sync starts only after that call completes, and the call's result names the commit it read throughout

#### Scenario: A moved head rebuilds the graph
- **WHEN** a sync fast-forwards the checkout to a commit adding a note that links to an existing one
- **THEN** a `gather` seeded at the existing note within one hop returns the new note
