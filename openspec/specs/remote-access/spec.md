# remote-access Specification

## Purpose
Lets a member who has no shell and no clone, working in a native chat app, find, read and capture against a store through an MCP surface that `ctxr serve` adds. Every computation the surface makes is deterministic, members sign in with the same verified identity the approval page uses, and a capture reaches the default branch only as a session pull request a decider approves.

## Requirements

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

### Requirement: A member works in named sessions of their own
A member holding `edit` SHALL be able to call `session_start` with an optional label. It SHALL start a session worktree as `ctxr session start` does, refuse a label that a live session already carries in the same way, record the calling member's verified email as the session's owner in a record under the store's derived cache path, and return the session's directory name and its store-relative root. `session_list` SHALL return only the calling member's sessions. Each row SHALL give the directory name, root, branch, label, whether the working tree carries uncommitted changes, the count of commits ahead of the remote default branch, the open pull request's number and state when there is one, and, when the store declares `change_approval`, the decision state and decider comment that `ctxr review list` reports for it. `session_status` SHALL return, for one owned session, the short status, the diff stat of committed and uncommitted work, the log of commits ahead of the remote default branch, and the unified diff of uncommitted work bounded to a declared size. A session addressed by anyone other than its owner, or one never started over MCP, SHALL be refused exactly as a session that does not exist. A member SHALL hold at most a declared number of open sessions, and `session_start` beyond it SHALL be refused naming them. A worktree left by the earlier per-member draft SHALL be treated as owned by the member whose email its label was derived from.

#### Scenario: Two sessions for one member stay apart
- **WHEN** a member on `editors` calls `session_start` with label `intro`, then again with label `roadmap`
- **THEN** two session worktrees exist on two branches, and `session_list` returns both with their roots and no pull request

#### Scenario: Another member's session does not exist for them
- **WHEN** member b@example.com calls `session_status` naming a session started by a@example.com
- **THEN** the call is refused as no such session, and nothing about that session is returned

#### Scenario: A decider's requested changes reach the member
- **WHEN** a member's submitted session was marked changes-requested on the approval page with a comment
- **THEN** that member's `session_list` row carries the changes-requested state and the comment

#### Scenario: A left-over draft is adopted
- **WHEN** a draft worktree from the per-member draft scheme with an open pull request exists for a@example.com
- **THEN** a@example.com's `session_list` lists it with its pull request, and no other member's does

### Requirement: `Edit`, `Write`, `Move` and `Delete` change a member's own session and commit nothing
`Edit` and `Write` SHALL keep Claude Code's parameters; `Move` SHALL take a source and a destination path and `Delete` a file path. Each SHALL accept only paths under the root of a session the calling member owns, and a path outside every such root SHALL be refused, naming `session_start` and listing the member's open sessions with their roots. Within a session root, each SHALL refuse the store's configuration file, the store's hooks directory, any path whose first segment begins with `.git`, derived and cache paths, the worktrees path and the managed skills path; the hooks directory is refused because a commit in the session worktree runs that worktree's hooks on the server. `Edit` SHALL be refused, changing nothing, when the string to replace does not occur, occurs more than once without replace-all, or equals its replacement; `Write` SHALL never overwrite; either SHALL be refused, changing nothing, for a path the note enumeration admits whose result does not parse as a note. Each SHALL change the session's working tree only, SHALL NOT commit, push or open a pull request, and SHALL be refused while a rebase is in progress in that session, except `Edit` and `Write` on a conflicting path.

#### Scenario: An edit rests uncommitted in its session
- **WHEN** a member calls `Edit` on `<root>/work/a.md` in their session
- **THEN** the session's working tree carries the change, its branch has no new commit, no pull request is opened, and the approval index does not list it

#### Scenario: A write outside every session is refused with the way in
- **WHEN** a member calls `Write` for `work/new.md` with no session root
- **THEN** the call is refused naming `session_start` and the member's open session roots, and nothing is written

#### Scenario: A hook cannot be written
- **WHEN** a member calls `Write` for `<root>/.githooks/pre-commit`
- **THEN** the call is refused and no file is written

#### Scenario: A template and the log are editable in a session
- **WHEN** a member calls `Edit` on the store's template path or log path under their session root
- **THEN** the change is applied to the session's working tree

#### Scenario: A note is moved and another deleted
- **WHEN** a member calls `Move` from `<root>/work/a.md` to `<root>/archive/a.md` and `Delete` on `<root>/work/b.md`
- **THEN** the session's working tree shows the rename and the deletion, and nothing is committed

### Requirement: `session_submit` validates, commits as the member and opens the pull request
`session_submit` SHALL run what `ctxr session submit` runs, with the member as the commit's author. It SHALL take an owned session, a branch name, a commit message, a pull-request title and a body. It SHALL stage every change in the session worktree outside derived paths, run the store-scope check pass `ctxr doctor` runs in that worktree and refuse, committing nothing, when it fails, returning its report. It SHALL then commit with the message, authored by the member's verified email with a trailer naming them, rename the session's branch to the given name when it differs, refusing a name the default branch or another live branch carries, push the branch with the server's forge credential (with lease when its history was rewritten), and open a pull request against the default branch with the given title and a body formed from the given body followed by the generated sections `ctxr session submit` appends, or update the open one's title and body. It SHALL return the pull request's number and address and, when the store declares `change_approval`, the approval page's address for the worktree. A call with nothing staged and nothing unpublished SHALL be refused. A retried call whose commit already exists SHALL publish that commit without a second one. It SHALL NOT write to, commit on or push the default branch, and SHALL NOT record a decision.

#### Scenario: A session is submitted with the agent's description
- **WHEN** a member calls `session_submit` on a session with two uncommitted edits, branch `notes/intro`, and a title and body
- **THEN** one commit authored by the member holds both edits, the branch is `notes/intro` on the remote, an open pull request carries that title and body, and the result gives its address and the approval page's address

#### Scenario: A failing store is not submitted
- **WHEN** `ctxr doctor` fails in the session's worktree
- **THEN** `session_submit` returns its report, and no commit, push or pull request is made

#### Scenario: Requested changes are answered on the same pull request
- **WHEN** a member edits a session whose pull request is open and calls `session_submit` again
- **THEN** a second commit is pushed to the same branch and no second pull request is opened

### Requirement: A member's session can be rebased or discarded
`session_rebase` and `session_discard` SHALL run what `ctxr session rebase` and `ctxr session discard` run, confined to owned sessions. `session_rebase` SHALL, for an owned session, fetch the default branch and rebase the session onto it; on conflict it SHALL return each conflicting path with both sides' content and leave the rebase in progress. With `continue` it SHALL stage the resolved paths and continue, and with `abort` restore the session as it was before the rebase. `session_discard` SHALL remove an owned session's worktree, local branch and ownership record, SHALL refuse a session carrying uncommitted changes or unpushed commits unless forced, and SHALL close its open pull request only when explicitly asked to.

#### Scenario: A conflict is returned for resolution
- **WHEN** the default branch changed a line the session also changed, and the member calls `session_rebase`
- **THEN** the conflicting path is returned with both sides, `session_submit` is refused naming `session_rebase`, and after an `Edit` resolving it and `session_rebase` with `continue` the session sits on the new default branch

#### Scenario: A discarded session is gone
- **WHEN** a member calls `session_discard` on a clean session with no pull request
- **THEN** its worktree and branch no longer exist and `session_list` no longer lists it

### Requirement: `ctxr` and `ctxr_write` run allowlisted CLI commands confined to one checkout
`ctxr` SHALL run a read-only `ctxr` subcommand from a declared allowlist, and `ctxr_write` a writing one from a second declared allowlist, each given as an argument vector with no shell, using the server's own CLI. `ctxr` SHALL run against the commit being served, or an owned session when one is named; `ctxr_write` SHALL require an owned session, and holding `edit`. A subcommand outside the tool's allowlist, the root option, or a path argument that resolves outside the checkout or onto a path the file tools refuse SHALL be refused before anything runs. After a `ctxr_write` command runs, any change it made to a path the file tools refuse, other than derived paths, SHALL be restored and the call refused. The command SHALL run with the checkout as its working directory and store root and without the server's forge credentials in its environment, within a declared time bound, its output bounded to a declared size. A literal `@input` argument SHALL be replaced by the path of a file holding the call's `input` text, written under the session's cache path. The result SHALL give the exit code, the output streams and the commit or session it ran against.

#### Scenario: A skill's lint step runs unchanged
- **WHEN** a member calls `ctxr` with `["lint"]` naming their session
- **THEN** the command runs in that session's worktree and its exit code and output are returned

#### Scenario: A write command needs a session
- **WHEN** a member calls `ctxr_write` with `["ingest", ...]` and no session
- **THEN** the call is refused and nothing runs

#### Scenario: A command cannot write a hook
- **WHEN** `ctxr_write` is called with a path argument `<root>/.githooks/pre-commit`, or runs a command whose output lands under the hooks directory
- **THEN** the call is refused, and no file under the hooks directory differs from before the call

#### Scenario: Escaping the checkout is refused
- **WHEN** `ctxr` is called with the root option, with `["update"]`, or with a path argument `../ctx-b/work/a.md`
- **THEN** the call is refused and nothing runs

### Requirement: Every tool declares honest annotations
Every tool SHALL declare a title and the read-only, destructive, idempotent and open-world hints. A tool that changes no state SHALL be marked read-only; `Delete` and `session_discard` SHALL be marked destructive; no tool SHALL be marked open-world. The hints SHALL NOT replace the server's scope and ownership checks.

#### Scenario: The tool list carries the hints
- **WHEN** a client calls `tools/list`
- **THEN** `Read` is marked read-only, `Delete` destructive, and every tool carries all four hints and a title

### Requirement: Members download the store's plugins from the server
When the MCP surface is configured, `ctxr serve` SHALL answer `GET /plugin/` with a page naming the Claude and ChatGPT plugin downloads and how to install each, and SHALL serve each plugin's archive, built as `ctxr plugin build` builds it from the configuration the server last loaded. These routes SHALL require the verified identity assertion the approval routes require, SHALL refuse a verified identity the `mcp` block admits to no scope, as sign-in refuses it, and SHALL be absent when the MCP surface is not configured.

#### Scenario: A member downloads the Claude plugin
- **WHEN** a member with a verified identity requests the Claude archive from `/plugin/`
- **THEN** the archive's MCP entry names the server's `/mcp` address and it carries the rendered skills

#### Scenario: The download needs a verified identity
- **WHEN** `/plugin/` is requested without an identity assertion
- **THEN** it is refused as the approval routes refuse it

#### Scenario: A verified non-member gets no plugin
- **WHEN** `/plugin/` is requested with a verified identity that `mcp.readers`, `mcp.capturers` and `mcp.editors` all leave out
- **THEN** it is refused, and no archive is built for that request

### Requirement: `Read`, `Grep` and `Glob` read the served commit or a member's own session
The surface SHALL offer `Read`, `Grep` and `Glob` with the names and parameters of Claude Code's own tools. Paths SHALL be store-relative, a leading `/` naming the store root. A path under the root of a session the calling member owns SHALL read that session's working tree; any other path SHALL read the commit being served. A path that leaves the store root, or lies under the store's retrieval exclusions, its configuration file, its derived paths or `.git`, SHALL be refused or never returned; the store's templates, house conventions, log and skills SHALL be readable. `Read` SHALL return file text numbered from 1 with an optional offset and limit and at most 2,000 lines per call, marking a capture as one. `Grep` SHALL match a regular expression with Claude Code's Grep parameters, ordered by path, with no score, within a fixed time and output bound, and when reading the served commit SHALL also list matching inbox files of session branches with an open pull request, marked as awaiting approval. `Glob` SHALL list matching files ordered by path.

#### Scenario: A note is read with line numbers and a range
- **WHEN** `Read` is called for `work/a.md` with offset 3 and limit 2
- **THEN** it returns lines 3 and 4 of that note, each with its line number

#### Scenario: A path outside what may be read is refused
- **WHEN** `Read` is called for `contexture.yaml`, for a derived file, or for `../outside.md`
- **THEN** the call is refused and no content is returned

#### Scenario: A member reads their session's uncommitted version
- **WHEN** a member who edited `<root>/work/a.md` in their session calls `Read` for it
- **THEN** the session's working-tree version is returned, while `Read` of `work/a.md` returns the served commit's version

#### Scenario: A pattern is matched in path order, with pending captures listed
- **WHEN** `Grep` is called with `kest(rel)?` in content mode, two notes match, and an inbox file on a session branch with an open pull request matches
- **THEN** the notes' matching lines are returned ordered by path and line with no score, the inbox file is listed apart as awaiting approval, and no excluded file appears

#### Scenario: A template is readable
- **WHEN** `Read` is called for a file under the store's template path
- **THEN** its content is returned

### Requirement: Every tool is a file tool, a `ctxr` command, or a named exception
Every tool the surface offers SHALL be one of Claude Code's file tools (`Read`, `Grep`, `Glob`, `Edit`, `Write`), `Move` or `Delete`; a tool for a `ctxr` command, named for its command path with `_` between words and taking that command's options as fields; the command runners `ctxr` and `ctxr_write`; or one of the named exceptions `find`, `gather` and `capture`. A command-named tool MAY add a `session` field to its command's options and no other. One mapping from command paths to tools SHALL be the only source the tool registry, the rendered skills' preamble and the checks read. A test over the tool registry and the CLI's command registry SHALL fail, naming the tool, when a tool is none of these or a command-named tool's fields other than `session` are not options that command registers.

#### Scenario: A tool with no command fails the check
- **WHEN** a tool `session_publish` is registered and no `ctxr session publish` command exists
- **THEN** the check exits non-zero naming `session_publish`
