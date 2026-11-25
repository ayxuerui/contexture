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
Every request to `/mcp` SHALL carry a bearer token the server itself issued, or be answered `401` with a `WWW-Authenticate` header naming the server's protected-resource metadata. The server SHALL act as an OAuth 2.1 authorisation server for its own `/mcp`: it SHALL publish protected-resource and authorisation-server metadata, accept dynamic registration of public clients, require PKCE with the S256 method, refuse a redirect URI that is not exactly one the client registered, and refuse a `resource` parameter naming any resource but its own `/mcp`. Every `/authorize` request SHALL verify the identity assertion `change_approval.identity` configures, exactly as the approval routes verify it, answering `401` when it does not verify and `403` when the verified email holds no scope: it is on none of `readers`, `capturers`, `editors` or `second_opinion`. A verified member SHALL be shown a consent page naming the client, its redirect host, the store, their email and the scopes to be granted, and a code SHALL be issued only on a `POST` from that page carrying an `Origin` equal to the origin of `serve.base_url`. An authorisation code SHALL be honoured at most once.

#### Scenario: A request without a token is challenged
- **WHEN** a client calls `/mcp` without a bearer token
- **THEN** the server answers `401` with a challenge naming its protected-resource metadata, and runs no tool

#### Scenario: Authorisation without a verified assertion grants nothing
- **WHEN** `/authorize` is requested with no identity assertion, as from a client that reached the server without passing through the access proxy
- **THEN** the response is `401` and no code is issued

#### Scenario: A verified non-member is refused
- **WHEN** the assertion verifies with an email on none of `readers`, `capturers`, `editors` or `second_opinion`
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

#### Scenario: A person listed for the second opinion alone signs in
- **WHEN** the assertion verifies with an email that only `mcp.second_opinion` admits
- **THEN** the consent page names the `second-opinion` scope alone, and the token issued on confirmation carries it alone

### Requirement: Scopes follow the configuration on every call
A member on `readers` SHALL hold the `read` scope, which reaches `find`, `gather`, `Read`, `Grep` and `Glob`; a member on `capturers` SHALL hold the `capture` scope, which reaches `capture`; a member on `editors` SHALL hold the `edit` scope, which reaches `Edit` and `Write`; and a member the store admits to a second opinion SHALL hold the `second-opinion` scope, which reaches the four second-opinion tools and no other. A token SHALL carry at most the scopes its member held when it was issued, and a client SHALL be able to request fewer but never more. On every request to `/mcp`, the token's scopes SHALL be narrowed to those its email holds in the configuration the server last loaded. `tools/list` SHALL list only the tools those scopes reach, and a `tools/call` naming a tool they do not reach SHALL be refused as insufficient scope. The server SHALL store no client registration, authorisation code or token, and SHALL read no secret from `contexture.yaml`.

#### Scenario: A reader cannot capture
- **WHEN** a member on `readers` only calls `capture`
- **THEN** the call is refused as insufficient scope and nothing is written

#### Scenario: Removal from the configuration takes effect on the next call
- **WHEN** a member's email is removed from `readers`, `capturers`, `editors` and `second_opinion`, and their client then calls any tool with an unexpired token
- **THEN** the request is refused and no tool runs

#### Scenario: A client cannot widen its grant
- **WHEN** a client requests `capture` for a member who is on `readers` only
- **THEN** the token issued carries `read` alone

#### Scenario: Naming a list takes the review from a reader on the next call
- **WHEN** a store adds `mcp.second_opinion` naming one email, and a different reader's client, holding a token issued before, calls `second_opinion_preflight`
- **THEN** the call is refused as insufficient scope

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

### Requirement: `Read`, `Grep` and `Glob` read the served commit or a member's own session
The surface SHALL offer `Read`, `Grep` and `Glob` with the names and parameters of Claude Code's own tools. Paths SHALL be store-relative, a leading `/` naming the store root. A path under the root of a session the calling member owns SHALL read that session's working tree; any other path SHALL read the commit being served. A path that leaves the store root, or lies under the store's retrieval exclusions, its configuration file, its derived paths or `.git`, SHALL be refused or never returned; the store's templates, catalog section files, house conventions, log and skills SHALL be readable. `Read` SHALL return file text numbered from 1 with an optional offset and limit and at most 2,000 lines per call, marking a capture as one. `Grep` SHALL match a regular expression with Claude Code's Grep parameters, ordered by path, with no score, within a fixed time and output bound, and when reading the served commit SHALL also list matching inbox files of session branches with an open pull request, marked as awaiting approval. `Glob` SHALL list matching files ordered by path.

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

#### Scenario: A catalog section file is readable in a session
- **WHEN** a member calls `Read` for a section file under the catalog path inside their session
- **THEN** its content is returned, so the gloss on a note's line can be edited there, while a derived file under the same tool-owned folder is still refused

### Requirement: Every tool is a file tool, a `ctxr` command, or a named exception
Every tool the surface offers SHALL be one of Claude Code's file tools (`Read`, `Grep`, `Glob`, `Edit`, `Write`), `Move` or `Delete`; a tool for a `ctxr` command, named for its command path with `_` between words and taking that command's options as fields; the command runners `ctxr` and `ctxr_write`; or one of the named exceptions `find`, `gather` and `capture`. A command-named tool MAY add a `session` field to its command's options. It MAY take a field named for an option of its command without that option's `_file` ending, which carries as text what the option reads from a file. It SHALL add no other field. One mapping from command paths to tools SHALL be the only source the tool registry, the rendered skills' preamble and the checks read. A test over the tool registry and the CLI's command registry SHALL fail, naming the tool, when a tool is none of these or a command-named tool has a field that is none of `session`, an option its command registers, or the text of a file option its command registers.

#### Scenario: A tool with no command fails the check
- **WHEN** a tool `session_publish` is registered and no `ctxr session publish` command exists
- **THEN** the check exits non-zero naming `session_publish`

#### Scenario: A text field needs a file option
- **WHEN** `second_opinion_critique` is registered with a `plan` field and a `notes` field, and `ctxr second-opinion critique` registers `--plan-file` and no `--notes-file`
- **THEN** the check exits non-zero naming `second_opinion_critique` and `notes`

### Requirement: The server instructions give this store's values
The instructions `serve` returns at `initialize` to a member who holds `read` SHALL include a section naming this store's value for every placeholder the MCP render of the owned skills uses — paths, default branch, cluster depth, mission size, the taxonomy's layers with their descriptions and the relation vocabulary — rendered from the configuration the server last loaded, and the server's CLI version. To a member who does not hold `read`, the instructions SHALL give the store's name, the server's CLI version and how the second-opinion tools are used, and SHALL give none of the store's paths, layers or other values. The surface builds the instructions per member from the scopes it has just narrowed.

#### Scenario: A skill's placeholder resolves
- **WHEN** a reader's client initializes against a store whose inbox path is `raw/inbox/`
- **THEN** the instructions' store section gives `raw/inbox/` for the inbox path placeholder, and the server's CLI version

#### Scenario: A configuration change shows on the next connection
- **WHEN** the store's configuration changes its log path and the server reloads it
- **THEN** the next `initialize` by a reader gives the new log path

#### Scenario: A member without read is told nothing of the store
- **WHEN** a member who holds only `second-opinion` initializes against a store whose taxonomy has a layer named `work`
- **THEN** the instructions name the four second-opinion tools and contain neither `work` nor any configured path

### Requirement: The server's connect page tells a member how to add the plugin and this store's connector
When the MCP surface is configured, `ctxr serve` SHALL answer `GET /plugin/` with a page that names contexture's plugin marketplace and the plugin the member's scopes call for, how to install it with automatic updates, this store's connector address (`serve.base_url` followed by `/mcp`) and how to add it in each app, and a download of a ChatGPT plugin. For a member who holds any scope but `second-opinion`, the plugin SHALL be `contexture` and the download SHALL be this store's ChatGPT plugin built as `ctxr plugin build` builds it in the store. For a member who holds `second-opinion` alone, the plugin SHALL be `second-opinion` and the download SHALL carry the second-opinion skill only.

#### Scenario: A member reads how to connect
- **WHEN** a reader with a verified identity requests `/plugin/`
- **THEN** the page names the `contexture` marketplace and the `contexture` plugin, the store's `/mcp` address, and links the ChatGPT plugin's archive

#### Scenario: A second-opinion member is shown the small plugin
- **WHEN** a member who holds `second-opinion` alone requests `/plugin/` with a verified identity
- **THEN** the page names the `second-opinion` plugin and the store's `/mcp` address, and the archive it links carries no skill but `ctxr-second-opinion`

### Requirement: The connect page admits only the store's members
The `/plugin/` routes SHALL require the verified identity assertion the approval routes require, SHALL refuse a verified identity the `mcp` block admits to no scope, and SHALL be absent when the MCP surface is not configured.

#### Scenario: The page needs a verified identity
- **WHEN** `/plugin/` is requested without an identity assertion
- **THEN** it is refused as the approval routes refuse it

#### Scenario: A verified non-member gets no page
- **WHEN** `/plugin/` is requested with a verified identity that `mcp.readers`, `mcp.capturers`, `mcp.editors` and `mcp.second_opinion` all leave out
- **THEN** it is refused

### Requirement: A second opinion has its own time bound and runs one at a time
Every call to a second-opinion tool SHALL return within its own declared bound, which SHALL be shorter than the shortest tool limit measured on a supported client, whatever the run's length. The server SHALL cap the `wait` of `second_opinion_result` to fit that bound, SHALL pass a per-CLI `--timeout` within the CLI's own default when none is given, and SHALL refuse a larger `timeout` before anything runs. While a second opinion runs on a server, a call that would start another SHALL be refused before anything runs, naming the reason.

#### Scenario: A long run answers across calls
- **WHEN** a member starts a critique whose critics take three minutes, then calls `second_opinion_result` for it repeatedly
- **THEN** every call returns within the bound, the calls before the run finishes report it as running, and the first call after it finishes carries the critiques

#### Scenario: A longer wait is cut to the bound
- **WHEN** a member calls `second_opinion_result` with a `wait` of `600` for a run that is still running
- **THEN** the call returns within the bound, reporting the run as running

#### Scenario: A slow model is a partial result, not a lost one
- **WHEN** one critic does not answer within the per-critic timeout the server passes
- **THEN** the run still ends, and the call that carries its result returns within the bound with that critic named as failed and the critiques that did answer

#### Scenario: A larger timeout is refused
- **WHEN** a member calls `second_opinion_critique` with a `timeout` of `1200`
- **THEN** the call is refused naming the largest timeout the server allows, and nothing runs

#### Scenario: A second run waits its turn
- **WHEN** a member calls `second_opinion_critique` while another second opinion is running on the same server
- **THEN** the call is refused as busy and no critic is started for it

### Requirement: The server runs a second opinion only when it is confined
The server SHALL add `--require-confinement` to every `second-opinion` command it runs, in `ctxr serve` and in `ctxr second-opinion serve`, so where its runs cannot be confined the command ends, naming the reason, before any model CLI starts.

#### Scenario: An unconfined server does not run a second opinion
- **WHEN** a member calls `second_opinion_critique` on a server whose `setpriv` has no Landlock support and whose lineup starts a model CLI
- **THEN** the result carries the failed-check code and the reason, and no model CLI is started

### Requirement: A second opinion through the server uses the served store's lineup
When a second-opinion tool of `ctxr serve` runs, the command SHALL resolve its lineup from the configuration of the commit the server is serving: a session's working copy SHALL NOT choose the model. The server's own lineup environment variables SHALL still win. The tools enforce this by the store root they give the command and by taking no session, and a test covers it with stub CLIs.

#### Scenario: The served lineup reaches a chat member
- **WHEN** the store served at its current commit configures a model for one CLI, and a member runs a critique through `second_opinion_critique`
- **THEN** that CLI is asked for the configured model

#### Scenario: A session's unreviewed lineup is not used
- **WHEN** a member's session changes the lineup in its working copy and the member then runs a critique through `second_opinion_critique`
- **THEN** each CLI is asked for the model the served commit's configuration resolves to

#### Scenario: The operator's environment still wins on the server
- **WHEN** the server's environment names a model for a CLI and the served configuration names a different one
- **THEN** the CLI is asked for the environment's model

### Requirement: A detached second opinion on the server belongs to the member who started it
The server SHALL record the member who started each run, and `second_opinion_result` SHALL refuse a run started by another member as if it did not exist. A busy refusal SHALL name the running run's id only to the member who started it.

#### Scenario: Another member cannot read a run
- **WHEN** member A starts a critique that is still running, and member B calls `second_opinion_result` with A's run id
- **THEN** B's call is refused as naming no run, and none of A's plan or answers is returned

#### Scenario: The owner is told which run is busy
- **WHEN** member A calls `second_opinion_critique` while A's earlier critique is running
- **THEN** the refusal names A's earlier run id, so A can fetch it with `second_opinion_result`

### Requirement: A blocking second opinion through the server starts a run and waits a bounded time
A call to `second_opinion_critique` or `second_opinion_poll` SHALL start a detached run and wait for it within the tool's bound. A run that finishes in time SHALL return as `second_opinion_result` returns a finished run. A run that does not SHALL return its run id, stating that it is still running and that `second_opinion_result` fetches it.

#### Scenario: A short plan answers in one call
- **WHEN** a member calls `second_opinion_critique` with a plan and the run finishes in thirty seconds
- **THEN** the one call carries the critiques and exit code `0`

#### Scenario: A long plan hands back its run id
- **WHEN** a member calls `second_opinion_critique` with a plan and the run takes three minutes
- **THEN** the call returns within the bound with the run id and a statement that it is still running, and a later `second_opinion_result` call for that id carries the critiques

### Requirement: The server gives the OpenRouter key to a second opinion only
When a server runs a command for a tool, it SHALL pass `OPENROUTER_API_KEY` from its own environment to a `second-opinion` command and SHALL withhold it from every other command. The key SHALL NOT appear in any tool result. The environment the server builds for the command is the mechanism, and a test runs a stub command that records its environment.

#### Scenario: A second opinion on the server can reach OpenRouter
- **WHEN** the server's environment sets the key, the served store routes one lineup entry through OpenRouter, and a member runs a critique through `second_opinion_critique`
- **THEN** the stub endpoint receives that critic's request carrying the key, and the tool result does not contain the key

#### Scenario: Another command does not see the key
- **WHEN** the server's environment sets the key and a member calls `ctxr` with `["lint"]`, and `ctxr_write` with a writing command in their session
- **THEN** neither command's environment holds `OPENROUTER_API_KEY`

### Requirement: A member cannot choose a second opinion's route
Through a server, each lineup entry's route SHALL be resolved from the server's own configuration and environment, as its model is: the commit being served in `ctxr serve`, the file in `ctxr second-opinion serve`. A call's fields and a session's working copy SHALL NOT route an entry through OpenRouter, away from it, or to another address. The tools take no field that names a model, a route or an address, the store root and environment the server gives the command enforce the rest, and a test covers it with stub CLIs and a stub endpoint.

#### Scenario: A session's unreviewed route is not used
- **WHEN** a member's session adds an OpenRouter slug to the lineup in its working copy and the member then runs a critique through `second_opinion_critique`
- **THEN** every critic is its model CLI, as the served commit's configuration resolves, and the stub endpoint receives no request

### Requirement: A second opinion runs through four tools of its own
The surface SHALL offer `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll` and `second_opinion_result`. Each SHALL declare the `second-opinion` scope and run its `ctxr second-opinion` command with the server's own CLI, environment allowlist and exit codes. The answers SHALL come back in the result of the call that finds the run finished.

#### Scenario: A critique written in chat is answered
- **WHEN** a member calls `second_opinion_critique` with a plan as `plan`, then calls `second_opinion_result` with the run id until the run has finished, on a server whose critics answer
- **THEN** the last result carries exit code `0` and each lettered critique's text, and neither the plan's file nor an output directory remains on the server

#### Scenario: A poll takes its question as text
- **WHEN** a member calls `second_opinion_poll` with a question as `prompt` and two lenses as `lens`
- **THEN** the command receives the question from a file the server wrote, and the result carries each answer

### Requirement: A second-opinion tool takes text and names no file
`second_opinion_critique` SHALL take the plan as the text field `plan`, and `second_opinion_poll` the question as `prompt`. The server SHALL write that text to a file outside any checkout and remove it when the call ends. No tool of the four SHALL take a path, a session, an output directory, a model, a route or an address. The input schemas are the mechanism, and the alignment test fails on any other field.

#### Scenario: A field that names a file is refused
- **WHEN** a member calls `second_opinion_critique` with a `plan_file` or an `out` field
- **THEN** the call is refused as an invalid argument and nothing runs

#### Scenario: Nothing is left behind
- **WHEN** a critique started through `second_opinion_critique` has finished and its run's lifetime has passed
- **THEN** neither the plan's file nor any file of the run remains on the server

### Requirement: The `ctxr` runner refuses a second opinion and names its tool
The `ctxr` tool's allowlist SHALL NOT include any `second-opinion` command, and the tool SHALL NOT take `input`. A `ctxr` call whose arguments begin with `second-opinion` SHALL be refused before anything runs, and the refusal SHALL name the tool that runs that command. The one mapping from command paths to tools is the source of the name.

#### Scenario: An older client is told which tool to call
- **WHEN** a member calls `ctxr` with `["second-opinion", "critique", "--plan-file", "@input"]`
- **THEN** the call is refused naming `second_opinion_critique`, and no model CLI and no request is started

#### Scenario: The runner takes no input
- **WHEN** a member calls `ctxr` with `["lint"]` and an `input`
- **THEN** the call is refused as an invalid argument and nothing runs

### Requirement: A store may list who runs a second opinion
`mcp.second_opinion` SHALL be an optional list of the entries `mcp.readers` takes, with no shipped default. When the key is present, exactly the members it admits SHALL hold the `second-opinion` scope. When it is absent, every member who holds `read` SHALL hold it. An `mcp` block SHALL be valid with this list alone. The one function that maps an email to its scopes is the mechanism.

#### Scenario: A store that names no list keeps today's access
- **WHEN** a store's `mcp` block has `readers` and no `second_opinion` key, and a reader calls `second_opinion_preflight`
- **THEN** the call runs

#### Scenario: A listed person who is not a reader gets the review only
- **WHEN** a store lists an email under `mcp.second_opinion` and under no other list, and that person signs in and requests `tools/list`
- **THEN** the list holds the four second-opinion tools and no other tool, and a call to `Read` is refused as insufficient scope

#### Scenario: A reader left off the list cannot run one
- **WHEN** a store's `mcp.second_opinion` names one email, and a different member on `readers` calls `second_opinion_critique`
- **THEN** the call is refused as insufficient scope and nothing runs

#### Scenario: An empty list withholds it from everyone
- **WHEN** a store writes `second_opinion: []` beside a non-empty `readers`, and a reader calls `second_opinion_preflight`
- **THEN** the call is refused as insufficient scope

#### Scenario: A written configuration gains no key
- **WHEN** `ctxr init` writes a configuration, or a store's configuration without the key is rewritten
- **THEN** it holds no `mcp.second_opinion` key

### Requirement: A server can offer a second opinion and nothing else
`ctxr second-opinion serve` SHALL answer the OAuth paths, `/mcp` and the connect page's paths, and every other path `404`. Its `/mcp` SHALL offer the four second-opinion tools and no other. It SHALL sign members in as `ctxr serve` does, with the identity settings of its own file, and SHALL give each member the file admits the `second-opinion` scope alone. A test requests each store route.

#### Scenario: Only the review is offered
- **WHEN** a member the file admits signs in and requests `tools/list`
- **THEN** the list is the four second-opinion tools

#### Scenario: A store route does not exist
- **WHEN** `/approve/`, `/notes/`, `/hooks/github` and `/` are requested
- **THEN** each is answered `404`, or `405` for a method other than `GET` and `HEAD`

#### Scenario: A verified person the file leaves out is refused
- **WHEN** `/authorize` is requested with a verified assertion whose email the file's `members` does not admit
- **THEN** the response is `403` and no code is issued

### Requirement: The second-opinion server reads no store, forge credential or approval key
`ctxr second-opinion serve` SHALL start and answer without a store, without `git` or `gh`, and without reading the GitHub App's key, any forge token or the webhook secret, whether or not its environment names them. The code path that forms a forge credential is not called by this command, and a test starts the server with those variables naming unreadable files and with neither program on `PATH`.

#### Scenario: It starts where `ctxr serve` could not
- **WHEN** the server is started in an empty directory, with the App key variable naming a file that does not exist and no `git` on `PATH`
- **THEN** it reports its address and a member can run `second_opinion_preflight`

### Requirement: The second-opinion server follows its file and uses its lineup
The server SHALL read the members and the lineup from the file `--config` names, and SHALL re-read the file when it changes, so a member removed from it is refused on their next call. A file that no longer loads SHALL leave the last good one in force and SHALL be reported once. Each run SHALL resolve its lineup from the file's `second_opinion` block, with the server's own lineup environment variables still winning. The check `ctxr serve` uses for `contexture.yaml` is the mechanism.

#### Scenario: A removed member is refused on the next call
- **WHEN** an email is removed from the file's `members` and that member's client calls a tool with an unexpired token
- **THEN** the request is refused and nothing runs

#### Scenario: The file's lineup is used
- **WHEN** the file routes one lineup entry through OpenRouter and a member runs a critique
- **THEN** the stub endpoint receives that critic's request with the file's slug, and that entry's CLI is not started

#### Scenario: A broken file changes nothing
- **WHEN** the file is replaced by one with an unknown key
- **THEN** the server logs the reason once and keeps answering with the members and lineup it loaded before

### Requirement: The second-opinion server's sign-in survives a restart
The server SHALL sign its tokens with a key it keeps in a file under its state directory, created on first start with access for its own user only. It SHALL refuse to start when that file or its directory can be read by another user. A token issued before a restart SHALL be accepted after it. No model CLI the server starts SHALL be able to read the key: the confinement rules do not include the state directory, and the confinement test covers it.

#### Scenario: A member stays signed in across a restart
- **WHEN** a member signs in, the server is stopped and started with the same state directory, and the member's client calls a tool with the token it holds
- **THEN** the call runs

#### Scenario: A readable key stops the start
- **WHEN** the key file's mode lets another user read it
- **THEN** the server exits with the usage code naming the file, and does not listen

### Requirement: The second-opinion server's connect page names its plugin and connector
`ctxr second-opinion serve` SHALL answer `GET /plugin/`, for a verified identity its file admits, with a page that names contexture's marketplace and its `second-opinion` plugin for Claude, the server's connector address (`base_url` followed by `/mcp`) and how to add it in each app, and a download of a ChatGPT plugin that carries the second-opinion skill and that connector.

#### Scenario: A member reads how to connect
- **WHEN** a member the file admits requests `/plugin/` with a verified identity
- **THEN** the page names the `second-opinion` plugin and the server's `/mcp` address, and links a ChatGPT archive whose only skill is `ctxr-second-opinion`

#### Scenario: The page needs a verified member
- **WHEN** `/plugin/` is requested without an identity assertion, or with a verified email the file does not admit
- **THEN** it is refused
