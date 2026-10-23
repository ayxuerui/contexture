## Purpose

Lets a member who has no shell and no clone, working in a native chat app, find, read and capture against a store through an MCP surface that `ctxr serve` adds. Every computation the surface makes is deterministic, members sign in with the same verified identity the approval page uses, and a capture reaches the default branch only as a session pull request a decider approves.

## ADDED Requirements

### Requirement: The MCP surface is opt-in, requires change approval, and is absent until configured
A store SHALL enable the MCP surface only by declaring an `mcp` block in `contexture.yaml`, listing `readers`, `capturers` and `editors`, each entry an exact email address or an `@domain` suffix as `change_approval.deciders` entries are. The block SHALL carry no shipped default. Configuration validation SHALL reject an `mcp` block when `change_approval` is absent, naming both keys. With no `mcp` block in the configuration `ctxr serve` has loaded, a `GET` or `HEAD` to any MCP path (`/mcp`, `/authorize`, `/token`, `/register`, and the authorisation and protected-resource metadata documents) SHALL answer `404`, and any other method SHALL answer `405`. The surface SHALL follow configuration reloads as the approval routes do: a loaded change that adds, alters or removes the block SHALL take effect with no restart, and a surface that cannot be built after startup SHALL answer `503` on every MCP path while every other route keeps answering.

#### Scenario: A store without the block has no MCP surface
- **WHEN** `ctxr serve` runs for a store whose `contexture.yaml` has no `mcp` block, and `/.well-known/oauth-authorization-server` is requested
- **THEN** the response is `404`

#### Scenario: The block requires change approval
- **WHEN** `contexture.yaml` declares `mcp` and no `change_approval`
- **THEN** configuration loading fails, naming `mcp` and `change_approval`

#### Scenario: Removing the block turns the surface off without a restart
- **WHEN** a running server's configuration file loses its `mcp` block
- **THEN** the next `GET` of the authorisation-server metadata answers `404`, and notes and the approval page still answer as before

### Requirement: The store is served over MCP's Streamable HTTP transport
When the loaded configuration declares `mcp`, `ctxr serve` SHALL answer `POST /mcp` as an MCP server: `initialize`, `ping`, `tools/list` and `tools/call` answered as JSON-RPC 2.0 with an `application/json` body, every notification accepted with `202`, and any other method answered with the JSON-RPC method-not-found error. `GET` and `DELETE` on `/mcp` SHALL answer `405`. A request to `/mcp` carrying an `Origin` header other than the origin of `serve.base_url` SHALL be refused with `403`. No tool SHALL call a language model.

#### Scenario: The tool list answers
- **WHEN** an authorised client sends `initialize` and then `tools/list`
- **THEN** the server answers with its protocol version and server information, and lists every tool the token's scopes reach

#### Scenario: An unknown method is refused in protocol
- **WHEN** a client sends a method the server does not implement
- **THEN** the response is a JSON-RPC error with the method-not-found code

#### Scenario: A foreign origin is refused
- **WHEN** a request to `/mcp` carries an `Origin` header naming a site other than the origin of `serve.base_url`
- **THEN** the server answers `403` and runs no tool

### Requirement: A member signs in with the verified identity the approval page uses
Every request to `/mcp` SHALL carry a bearer token the server itself issued, or be answered `401` with a `WWW-Authenticate` header naming the server's protected-resource metadata. The server SHALL act as an OAuth 2.1 authorisation server for its own `/mcp`: it SHALL publish protected-resource and authorisation-server metadata, accept dynamic registration of public clients, require PKCE with the S256 method, refuse a redirect URI that is not exactly one the client registered, and refuse a `resource` parameter naming any resource but its own `/mcp`. Every `/authorize` request SHALL verify the identity assertion `change_approval.identity` configures, exactly as the approval routes verify it, answering `401` when it does not verify and `403` when the verified email is on none of `readers`, `capturers` or `editors`. A verified member SHALL be shown a consent page naming the client, its redirect host, the store, their email and the scopes to be granted, and a code SHALL be issued only on a `POST` from that page carrying an `Origin` equal to the origin of `serve.base_url`. An authorisation code SHALL be honoured at most once.

#### Scenario: A request without a token is challenged
- **WHEN** a client calls `/mcp` without a bearer token
- **THEN** the server answers `401` with a challenge naming its protected-resource metadata, and runs no tool

#### Scenario: Authorisation without a verified assertion grants nothing
- **WHEN** `/authorize` is requested with no identity assertion, as from a client that reached the server without passing through the access proxy
- **THEN** the response is `401` and no code is issued

#### Scenario: A verified non-member is refused
- **WHEN** the assertion verifies with an email on none of `readers`, `capturers` or `editors`
- **THEN** the response is `403` and no code is issued

#### Scenario: No code without the member's confirmation
- **WHEN** a verified member opens a valid authorisation link
- **THEN** the response is a page naming the client and its redirect host, and no redirect carrying a code is issued until the member confirms on that page

#### Scenario: Plain PKCE is refused
- **WHEN** an authorisation request names the `plain` code-challenge method or no code challenge
- **THEN** the server refuses it and issues nothing

#### Scenario: An authorisation code is single use
- **WHEN** a client redeems an authorisation code for a token and then presents the same code and verifier again
- **THEN** the second redemption is refused and issues no token

### Requirement: Scopes follow the configuration on every call
A member on `readers` SHALL hold the `read` scope, which reaches `find`, `gather`, `Read`, `Grep` and `Glob`; a member on `capturers` SHALL hold the `capture` scope, which reaches `capture`; a member on `editors` SHALL hold the `edit` scope, which reaches `Edit` and `Write`. A token SHALL carry at most the scopes its member held when it was issued, and a client SHALL be able to request fewer but never more. On every request to `/mcp`, the token's scopes SHALL be narrowed to those its email holds in the configuration the server last loaded. `tools/list` SHALL list only the tools those scopes reach, and a `tools/call` naming a tool they do not reach SHALL be refused as insufficient scope. The server SHALL store no client registration, authorisation code or token, and SHALL read no secret from `contexture.yaml`.

#### Scenario: A reader cannot capture
- **WHEN** a member on `readers` only calls `capture`
- **THEN** the call is refused as insufficient scope and nothing is written

#### Scenario: Removal from the configuration takes effect on the next call
- **WHEN** a member's email is removed from `readers`, `capturers` and `editors`, and their client then calls any tool with an unexpired token
- **THEN** the request is refused and no tool runs

#### Scenario: A client cannot widen its grant
- **WHEN** a client requests `capture` for a member who is on `readers` only
- **THEN** the token issued carries `read` alone

### Requirement: `find` stands in for a client's own content matching
`find` SHALL accept an optional text, an optional path prefix and an optional result limit. Given text, it SHALL return every note the note enumeration admits that contains the text as a case-insensitive literal substring, each with its path, its catalog gloss, up to three matching lines with their line numbers, and a link to the note's browsing route under `serve.base_url`. Results SHALL be ordered by path, SHALL carry no score or other relevance measure, and SHALL report how many matches a limit omitted. Matching captures SHALL be returned in a separate field holding only unfiled material, never among the notes and never with a link: inbox files at the commit being served, and inbox files added by the branch of any session worktree that has an open pull request, each of the latter marked as pending merge and naming its branch. Given no text, `find` SHALL return the catalog's sections, each with its notes' paths and glosses, narrowed by the prefix when one is given.

#### Scenario: A literal match is found and ordered by path
- **WHEN** `find` is called with text that appears in `work/b.md` and `work/a.md`
- **THEN** it returns `work/a.md` before `work/b.md`, each with its matching lines, and no score

#### Scenario: An excluded note is never returned
- **WHEN** the text appears only in a file under a path the store's exclusion configuration declares
- **THEN** that file appears in no field of the result

#### Scenario: A capture awaiting approval is visible as pending
- **WHEN** the text appears in an inbox file that exists only on a session branch with an open pull request
- **THEN** that file is in the unfiled field, marked pending merge and naming its branch, and in no other field

#### Scenario: No text returns the map
- **WHEN** `find` is called with no text
- **THEN** it returns the catalog's sections with each note's path and gloss, and performs no content matching

### Requirement: `gather` returns the retrieval pass with the bodies a client cannot read itself
`gather` SHALL accept the retrieval pass's entry selectors and traversal options and return the pass's result in the pass's order, adding to each note either its body or, once a declared byte budget is spent, no body. Bodies SHALL be attached to a prefix of the order only; when the first note alone exceeds the budget it SHALL be returned clipped to the budget and marked as clipped. A seed lying under the capture root SHALL be refused, stating that the capture is not yet filed, before the pass runs.

#### Scenario: Bodies fill a prefix of the pass
- **WHEN** `gather` is called with a seed whose pass returns three notes and the budget admits only the first two bodies
- **THEN** the first two notes carry bodies, the third carries none, and the order is the pass's own

#### Scenario: A capture cannot seed the pass
- **WHEN** `gather` is called with a seed naming a file under the inbox path
- **THEN** the call fails stating the capture is not yet filed, and no pass runs

### Requirement: `capture` opens a session pull request and never writes the default branch
`capture` SHALL accept a title, a body, a source type and optionally a source id; absent a source id, it SHALL assign one formed from the source type and the body's content hash, so the same material always receives the same identity. Before writing, it SHALL run the store's source check against the candidate over the identity records at the commit being served together with the inbox files of session branches that have an open pull request, refusing any verdict but new and naming the matching records, and SHALL refuse a body that fails the store's required-section rule for that source type. It SHALL then start a session worktree as `ctxr session start` does, write exactly one new markdown file under the configured inbox path, commit it with the member's verified email as its author and a trailer naming them, push the session branch to the store's remote with the server's forge credential, and open a pull request for it against the default branch. It SHALL return the pull request's number and address and the approval page's address for the worktree. It SHALL NOT write to, commit on or push the default branch, SHALL NOT modify any existing file, and SHALL NOT record a decision. Captures SHALL be serialised from the duplicate check through the pull request, so that two simultaneous calls carrying one source identity produce at most one pull request. A capture session whose branch carries the candidate's source identity but has no open pull request SHALL be resumed rather than duplicated: its branch pushed if the remote lacks it, an existing open pull request for it found before one is opened, and that pull request returned. A capture session whose pull request was closed without merging SHALL be removed, worktree and local branch, before the duplicate check.

#### Scenario: A capture becomes a session awaiting a decision
- **WHEN** a member on `capturers` calls `capture` with a title, a body and a source type
- **THEN** a session worktree exists whose branch adds one file under the inbox path, its commit's author is the member's verified email, an open pull request exists for that branch, the approval index lists the worktree as awaiting a decision, and the remote default branch is unchanged

#### Scenario: Material already in the store is refused
- **WHEN** `capture` is called with a source id an identity record at the served commit already carries
- **THEN** the call is refused naming that record, and no worktree, branch or pull request is created

#### Scenario: A capture awaiting approval is a duplicate
- **WHEN** `capture` is called with a source id that an inbox file on an unmerged session branch already carries
- **THEN** the call is refused naming that branch's file, and no pull request is opened

#### Scenario: A capture interrupted before its pull request resumes
- **WHEN** a capture's push succeeded but opening its pull request failed, and the same material is captured again
- **THEN** no second worktree or branch is created, one pull request is opened for the existing branch, and it is returned

#### Scenario: A rejected capture can be captured again
- **WHEN** a capture's pull request was closed without merging, and the same material is captured again
- **THEN** the old capture session is removed and a new pull request is opened

#### Scenario: Simultaneous duplicates produce one pull request
- **WHEN** two `capture` calls carrying the same source id arrive at the same moment
- **THEN** exactly one opens a pull request, and the other is refused naming it

#### Scenario: A missing required section is refused before writing
- **WHEN** the store declares a required section for the source type and the body lacks it
- **THEN** the call is refused naming the section, and nothing is written

### Requirement: The surface reads from a checkout of its own, one commit per call
The MCP surface SHALL read store content from a detached worktree of the store's repository that it alone writes, under the store's derived cache path, and SHALL NOT change the `HEAD`, index or working tree of the checkout `ctxr serve` was started on. Before serving a tool call, it SHALL bring that worktree to the remote default branch at most once per a declared interval, and SHALL build that worktree's own graph whenever its commit changes or the graph is absent. Every tool call SHALL read from a single commit: no sync SHALL change the worktree or its graph while a tool call is reading, and no tool call SHALL read while a sync is changing them. A sync that cannot finish SHALL leave the worktree and its graph both at the last commit it served, or, when that cannot be restored, every tool SHALL be refused until a sync succeeds. Every tool result SHALL name the commit it was computed from and the last sync failure, or none, with no wall-clock value.

#### Scenario: The started checkout is never touched
- **WHEN** tool calls trigger syncs while the started checkout has an uncommitted change and is behind its remote
- **THEN** the started checkout's `HEAD`, working tree and index are unchanged afterward

#### Scenario: A failed fetch serves the last good state
- **WHEN** the remote is unreachable at sync time
- **THEN** the tool call is answered from the worktree's current commit, and its result names that commit and the sync failure

#### Scenario: A call in flight is not split across commits
- **WHEN** a sync becomes due while a `gather` call is still reading
- **THEN** the sync starts only after that call completes, and the call's result names the commit it read throughout

### Requirement: `Read`, `Grep` and `Glob` give file-shaped access with Claude Code's parameters
The surface SHALL offer `Read`, `Grep` and `Glob` with the names and parameters of Claude Code's own tools, reading the commit being served. Paths SHALL be store-relative, a leading `/` naming the store root; a path that leaves the store root, or lies under the store's retrieval exclusions other than the capture tier, its derived paths, its configuration, its skills or `.git`, SHALL be refused or never returned. `Read` SHALL return a note the note enumeration admits, a capture (marked as one), or the entry document, numbered from 1 with an optional offset and limit and at most 2,000 lines per call; when the calling member's open draft has committed a change to or addition of the file, it SHALL return that committed version, marked as the draft. `Grep` SHALL match a regular expression with Claude Code's Grep parameters (path, glob, type, output mode, case, line numbers, context lines, multiline, head limit, offset), ordered by path, with no score, within a fixed time and output bound, and SHALL also list matching inbox files of session branches with an open pull request, marked as awaiting approval. `Glob` SHALL list matching files ordered by path.

#### Scenario: A note is read with line numbers and a range
- **WHEN** `Read` is called for `work/a.md` with offset 3 and limit 2
- **THEN** it returns lines 3 and 4 of that note, each with its line number

#### Scenario: A path outside what may be read is refused
- **WHEN** `Read` is called for `contexture.yaml`, for a derived file, or for `../outside.md`
- **THEN** the call is refused and no content is returned

#### Scenario: A member reads their own draft
- **WHEN** a member whose open draft committed a change to `work/a.md` calls `Read` for it
- **THEN** the draft's committed version is returned, marked as the draft, while another member reading it gets the version at the served commit

#### Scenario: A pattern is matched in path order, with pending captures listed
- **WHEN** `Grep` is called with `kest(rel)?` in content mode, two notes match, and an inbox file on a session branch with an open pull request matches
- **THEN** the notes' matching lines are returned ordered by path and line with no score, the inbox file is listed apart as awaiting approval, and no excluded file appears

#### Scenario: Files are listed by pattern in path order
- **WHEN** `Glob` is called with `work/**/*.md`
- **THEN** the matching notes are returned ordered by path, and no excluded file appears

### Requirement: `Edit` and `Write` collect in one draft pull request per member
A member holding `edit` SHALL be able to call `Edit` with a file path, an exact string to replace, its replacement and an optional replace-all flag, and `Write` with a file path and content. A path SHALL be editable only when the note enumeration would admit it, it is markdown, and it lies outside the capture tier. `Edit` SHALL apply to an editable path that exists at the served commit or in the member's draft, and SHALL be refused, changing nothing, when the string to replace does not occur, occurs more than once without replace-all, or equals its replacement. `Write` SHALL create an editable path that exists in neither and SHALL never overwrite. Either SHALL be refused, changing nothing, when its result does not parse as a note or the store's hooks refuse its commit, in which case the draft SHALL be left at its previous tip. Every accepted call SHALL be one commit, authored by the member's verified email, on the member's draft: a session worktree started as `ctxr session start` does on the first call and reused while its pull request is open, whose commit includes the store's catalog rebuilt for the change. The draft branch SHALL be pushed with the server's forge credential after each commit, and a pull request opened for it when none is open. Before applying a call, anything the draft left unpublished SHALL be published; a retried call whose effect is already in the draft SHALL be answered without a second commit. A draft whose pull request was closed without merging SHALL be removed before the next call. Neither SHALL write to, commit on or push the default branch, and draft calls and captures SHALL be serialised.

#### Scenario: The first edit opens a draft pull request
- **WHEN** a member on `editors` with no draft calls `Edit` on `work/a.md` replacing a string that occurs once
- **THEN** a session worktree exists whose single commit changes `work/a.md` and is authored by the member, an open pull request exists for it, the approval index lists it as awaiting a decision, and the remote default branch is unchanged

#### Scenario: Write, then edit, then read the new note
- **WHEN** the same member calls `Write` for `work/new.md`, then `Edit` on `work/new.md`, then `Read` for it
- **THEN** the draft holds two more commits on the same pull request, no second pull request is opened, and `Read` returns the edited text marked as the draft

#### Scenario: An ambiguous replacement changes nothing
- **WHEN** `Edit` is called with a string that occurs twice and no replace-all flag
- **THEN** the call is refused naming the count, and no commit is made

#### Scenario: A retry after a failed push publishes once
- **WHEN** an `Edit` was committed but its push failed, and the same call is retried
- **THEN** the existing commit is pushed and its pull request returned, and no second commit is made

#### Scenario: A refused commit leaves the draft as it was
- **WHEN** the store's hooks refuse an `Edit`'s commit
- **THEN** the call returns the hook's output, the draft's tip and working tree are unchanged, and `Read` still returns the previous version

#### Scenario: Configuration cannot be edited
- **WHEN** `Edit` or `Write` names `contexture.yaml`, a path under the capture root, or a path under the derived cache
- **THEN** the call is refused and no commit is made

#### Scenario: A reader cannot edit
- **WHEN** a member on `readers` only calls `Edit`
- **THEN** the call is refused as insufficient scope and nothing is written
