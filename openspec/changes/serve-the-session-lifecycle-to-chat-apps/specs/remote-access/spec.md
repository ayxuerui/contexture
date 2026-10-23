## ADDED Requirements

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
When the MCP surface is configured, `ctxr serve` SHALL answer `GET /plugin/` with a page naming the Claude and ChatGPT plugin downloads and how to install each, and SHALL serve each plugin's archive, built as `ctxr plugin build` builds it from the configuration the server last loaded. These routes SHALL require the verified identity assertion the approval routes require, and SHALL be absent when the MCP surface is not configured.

#### Scenario: A member downloads the Claude plugin
- **WHEN** a member with a verified identity requests the Claude archive from `/plugin/`
- **THEN** the archive's MCP entry names the server's `/mcp` address and it carries the rendered skills

#### Scenario: The download needs a verified identity
- **WHEN** `/plugin/` is requested without an identity assertion
- **THEN** it is refused as the approval routes refuse it

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

## REMOVED Requirements

### Requirement: `Edit` and `Write` collect in one draft pull request per member
**Reason**: A single always-published draft per member cannot keep two units apart, publishes half-finished work for approval, and carries a fixed description; the session lifecycle the owned skills teach replaces it.
**Migration**: An existing draft worktree is adopted as its member's session; its pull request stays open and landable, and further edits rest uncommitted until `session_submit`.

### Requirement: `Read`, `Grep` and `Glob` give file-shaped access with Claude Code's parameters
**Reason**: Replaced by a requirement that reads a member's own sessions by their roots and widens the readable set to what the owned skills read.
**Migration**: Paths outside any session root keep reading the served commit; the draft marking is replaced by reading the session root.
