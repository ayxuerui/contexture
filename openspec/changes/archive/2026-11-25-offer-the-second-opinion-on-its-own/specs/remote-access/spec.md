# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Every tool is a file tool, a `ctxr` command, or a named exception
Every tool the surface offers SHALL be one of Claude Code's file tools (`Read`, `Grep`, `Glob`, `Edit`, `Write`), `Move` or `Delete`; a tool for a `ctxr` command, named for its command path with `_` between words and taking that command's options as fields; the command runners `ctxr` and `ctxr_write`; or one of the named exceptions `find`, `gather` and `capture`. A command-named tool MAY add a `session` field to its command's options. It MAY take a field named for an option of its command without that option's `_file` ending, which carries as text what the option reads from a file. It SHALL add no other field. One mapping from command paths to tools SHALL be the only source the tool registry, the rendered skills' preamble and the checks read. A test over the tool registry and the CLI's command registry SHALL fail, naming the tool, when a tool is none of these or a command-named tool has a field that is none of `session`, an option its command registers, or the text of a file option its command registers.

#### Scenario: A tool with no command fails the check
- **WHEN** a tool `session_publish` is registered and no `ctxr session publish` command exists
- **THEN** the check exits non-zero naming `session_publish`

#### Scenario: A text field needs a file option
- **WHEN** `second_opinion_critique` is registered with a `plan` field and a `notes` field, and `ctxr second-opinion critique` registers `--plan-file` and no `--notes-file`
- **THEN** the check exits non-zero naming `second_opinion_critique` and `notes`

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

## REMOVED Requirements

### Requirement: A second opinion runs through the `ctxr` tool as it runs in a shell
**Reason**: The second opinion has a scope of its own, and a scope is declared per tool. The runner `ctxr` is a `read` tool, so the commands move to four tools that declare `second-opinion`.
**Migration**: Call `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll` or `second_opinion_result`. See *A second opinion runs through four tools of its own*. A `ctxr` call that names one of the commands is refused with the tool's name.

### Requirement: The `ctxr` tool takes `input` for a second opinion only
**Reason**: The runner no longer runs a second opinion, and no other read command takes text.
**Migration**: Pass the plan as `plan` to `second_opinion_critique` and the question as `prompt` to `second_opinion_poll`.
