## Context

The proposal's Why explains the motivation. This section covers the current state.

The MCP surface (archived change `2026-10-23-serve-the-store-over-mcp`) serves eight tools from `ctxr serve`, reading from a view worktree of its own. Its writes are ordinary session worktrees, started through `startSession` in `src/core/mcp/sessions.ts`, which means the approval page and `ctxr land` handle them with no MCP-specific path:
- `capture` opens one session and one pull request per call.
- `Edit` and `Write` commit and publish into a single draft per member.

The parity inventory, from this change's exploration, maps every owned skill's steps onto the surface. Three findings shape this design:
- **The lifecycle skills are git mechanics.** `ctxr-session-lifecycle`, `ctxr-submit` and `ctxr-land` are mostly git and gh steps, and none of those can run on the client.
- **The other skills mostly need CLI commands.** Most remaining skills are judgment plus `ctxr` commands: `lint`, `doctor`, `catalog show`, `graph query`, `graph diff`, `source check`, `rollup stale|gather|write`, `ingest`, `archive`, `entry append`, `session capture` and `publish urls`. The surface offers none of these today.
- **Some paths the skills need are hidden.** The file tools hide templates, house conventions and the log, which `ctxr-ingest-orchestration`, `ctxr-placement` and `ctxr-session-capture` all read or write.

**The vendor plugin formats**, as researched on 2026-10-23:
- Both formats are a directory with `skills/<name>/SKILL.md` (the Agent Skills format) plus a remote MCP server entry.
- **Claude:** `.claude-plugin/plugin.json` plus `.mcp.json` with `{"type":"http","url":…}`. It loads in the claude.ai chat apps, desktop, mobile, Cowork and Claude Code.
- **ChatGPT:** a root `plugin.json` (Agent Plugins schema) plus `mcp.json` with `{"type":"streamable-http","url":…}` and OAuth declared under `extensions.com.openai.auth`.
- **Shared constraints:**
  - Neither may carry a secret.
  - Neither may put a variable in the URL.
  - A Claude plugin with a top-level `bin/` is refused.
  - Both discover OAuth from the server's metadata, which `serve` already publishes, with dynamic client registration.
- **Tool annotations:** both read them. `readOnlyHint` tools may run without a prompt; `destructiveHint` tools always prompt.

**A constraint found during design:** `ctxr init` sets `core.hooksPath` to the relative `.githooks`. That resolves inside each worktree, so a commit in a session worktree runs that worktree's own hook scripts. Today this is safe only because `Edit` and `Write` accept nothing but markdown notes.

## Goals / Non-Goals

**Goals:**
- An agent in a chat app that has the plugin can follow the same lifecycle as a local one, with the same skill text wherever the step is not git mechanics.
- The server cannot be made to run code a member wrote.

**Non-Goals (design level):**
- No change to how the approval page decides or lands. MCP sessions are ordinary sessions.
- No server-side model. The server stays LLM-free, as the code/judgment seam requires.

## Decisions

### D1. A session is addressed by its worktree path inside `file_path`

`session_start` returns the new worktree's store-relative root, for example `.contexture/worktrees/fix-intro/`. From then on, `Read`, `Edit`, `Write`, `Move`, `Delete`, `Grep` and `Glob` take paths under that root, exactly as a local agent's tools take paths inside its worktree.
- **Reads:** a path outside any session root reads the served commit, as it does today.
- **Writes:** a write outside any session root is refused with `mcp.no_session`. The refusal names `session_start` and lists the member's open sessions with their roots.

**Alternatives considered:**
- **An optional `session` parameter on each file tool.** Rejected: it breaks the user's decision to keep Claude Code's parameters exactly, and the skills would then describe a different call than the one a local agent makes.
- **An implicit "current session" per member** (the opposing case, steelmanned). It is the simplest thing for a non-engineer's agent: no path prefix to carry, and nothing to forget. It is also what works today. It loses for three reasons:
  1. The server is stateless and cannot tell two conversations apart. Two chats from one member would write into one session, which is exactly the drafts' failure.
  2. Multi-PR sequencing (one session per file-disjoint unit) cannot be expressed.
  3. A refusal that names the root is cheap, while a silent cross-conversation write is not.

The cost is a long path prefix that the agent carries. The rendered skills state it once and every refusal repeats it.

**Why not a short virtual root like `sessions/<label>/`?** A store may have its own `sessions/` folder, and the real worktree path can never collide with a note path, because the worktrees path is excluded from enumeration.

### D2. Edits rest in the working tree; `session_submit` commits

`Edit`, `Write`, `Move` and `Delete` change files in the session worktree and commit nothing. `session_submit` does steps 3 to 8 of `ctxr-submit` on the server:
1. It stages every change in the worktree except derived paths.
2. It runs `ctxr doctor` in the worktree and refuses on failure, returning the report.
3. It commits with the agent's message, authored by the member, with an `Edited-by:` trailer.
4. It renames the branch to the given name.
5. It pushes, and opens the pull request with the agent's title and body, or updates an open one.

Re-submitting after requested changes adds a commit and pushes again. Pushes after a rebase use force-with-lease.

**The opposing case (keep committing and publishing on every call):**
- Nothing can be lost.
- The approver sees work as it happens.
- A member who never says "submit" still produces a reviewable change.

It loses because of what the lifecycle requires:
- **The request to submit is the consent to publish** (`ctxr-submit`'s When section). Continuous publishing puts half-finished work on the approval page, where a decider can approve half a change.
- **The pull request's description cannot be written** until the unit is whole.
- **Unsubmitted work is not lost.** It stays in the worktree, which sits in the store's volume, and `session_list` reports it, as `ctxr session list` does.
- **Uncommitted rest is normal.** The lifecycle skill already says the worktree's uncommitted state between turns is its normal resting state.

**Alternative: an explicit `commit` tool apart from `session_submit`.** Rejected because local sessions commit in submit too. A second tool would add a step with no review value.

### D3. Typed session tools for every server-side git step, shared with `ctxr session`

Each session tool calls `src/core/session/`, the core that `ctxr session status|submit|rebase|discard|list` call (change `bring-the-session-lifecycle-into-the-cli`). Its parameters are the command's options, spelled as JSON fields. The MCP layer adds only three things:
- the ownership check;
- the member as commit author;
- the confinement to MCP-started sessions.

The session tools are:
- **`session_start(label?)`** = `ctxr session start [label]`, with the same refusal for a taken label.
- **`session_list()`** = `ctxr session list`, filtered to the member's own sessions. Each row gives:
  - the root, branch and label;
  - whether there is uncommitted work;
  - commits ahead;
  - the pull request number and state;
  - the approval decision with the decider's comment, as `ctxr review list` reports it.
- **`session_status(session, diff?)`** = `ctxr session status [--diff]`, with the diff bounded to 100 KB.
- **`submit(session, branch, commit_message, title, body)`**, as described in D2.
- **`session_rebase(session, action?)`** = `ctxr session rebase [--continue|--abort]`:
  - With no action, it starts a rebase onto the fetched default branch. On a conflict it returns each conflicting path with both sides and leaves the rebase in progress, so that `Read` and `Edit` can resolve it.
  - `action: "continue"` stages and continues.
  - `action: "abort"` aborts.
- **`session_discard(session, force?, close_pull_request?)`** = `ctxr session discard`, with the same refusal of unpublished work unless `force`. It is destructive.

A session argument is the session's directory name, as `session_list` returns it.

**Ownership:** sessions started over MCP are recorded as owned by the starting member in `.contexture/cache/mcp/sessions.json`, written atomically under the write mutex. Every session-addressed call checks ownership and answers `mcp.no_session` for anyone else's session, so their existence is not revealed. An `mcp-draft-<local>-<sha8>` worktree is adopted for the member whose email hashes to its label. A member may hold at most 20 open sessions. Sessions started locally are never visible over MCP.

**Opposing case (one generic `git` tool with an argv allowlist):**
- It is fewer tools, and the skills' git commands would carry over verbatim.

Rejected for three reasons:
- **Arbitrary refs.** Git's argv surface reaches arbitrary refs: `push origin HEAD:main` is one argv away from a write to the default branch.
- **No honest annotation.** One tool cannot carry an honest annotation, and Claude's directory review rejects tools that mix reads and writes.
- **Ownership needs typed arguments.** Ownership checks need the session as a typed argument, not something parsed out of argv.

### D4. `ctxr` and `ctxr_write` run allowlisted CLI commands as argv

`ctxr(args, session?)` and `ctxr_write(args, session, input?)` spawn the server's own `ctxr` binary (`process.execPath` plus the package's `bin.js`) with the given argv, no shell, and cwd set to the session worktree or to the view.

**Environment:** the child runs with the forge credential variables removed and `CONTEXTURE_STORE_ROOT` set to that cwd.

**Allowlists** (a subcommand path, matched before any option):
- **`ctxr`:** `lint`, `doctor`, `catalog show|check`, `graph query|diff`, `context gather`, `source check|hash`, `rollup stale|gather`, `publish check|urls|gather`.
- **`ctxr_write`:** `ingest`, `archive`, `entry append`, `rollup write`, `source stamp|add-alt`, `session capture`, `catalog build`, `graph build`.

**Refused:**
- The root flag and `--` followed by a path outside the cwd.
- Any argument naming a path outside the cwd once resolved.
- `ctxr_write` without a session the member owns.

**`input`:** a command that reads a content file (`rollup write --content-file`, `session capture --proposal`) gets the `input` string written to a file under the session's cache path. The literal argument `@input` is replaced with that file's path.

**Limits:** output is bounded to 256 KB per stream, and the run is killed after 30 seconds. The tool returns the exit code, stdout and stderr, and the commit or session it ran against.

Running commands against the view means a read sees the served commit. `graph diff --since origin/<default>` therefore only makes sense inside a session, and the skill text runs it there.

**Opposing case (one typed tool per command):**
- Each tool would get a precise schema and its own annotation.
- The model would not need to know CLI syntax.

It loses on cost and drift:
- **Too many tools.** That is about 25 tools, which every client loads into context on every turn.
- **Drift.** Every new CLI option would need MCP work, and the two would drift. That drift is exactly what the affordance check in harness-portability exists to prevent.
- **Discoverability.** The models already read CLI syntax out of the skills, which spell it out.

The read/write split keeps the annotations honest.

### D5. Inside a session, a member may change what a local session may change, except executable configuration

**Writes inside a session root** (`Edit`, `Write`, `Move`, `Delete`) accept any path except:
- `contexture.yaml`;
- the hooks directory (`.githooks/`);
- any path whose first segment starts with `.git` (`.gitattributes`, `.gitmodules`);
- derived and cache paths;
- the worktrees path;
- the managed skills path, which `ctxr update` owns.

**Why the hooks directory:** `session_submit`'s commit runs the worktree's own hooks on the server (see Context). A hook a member wrote would be code they run on the server. Reviewing it later does not undo that.

**`contexture.yaml`** is refused for a reason of its own: it grants MCP scopes, and a change to it should come from a local session that the operator controls.

**Reads** widen to match. Templates, house conventions, the log and the skills become readable on the served commit and in sessions. `retrieval.exclude_paths` stays hidden, because it is the operator's declared intent and narrowing is positional. `contexture.yaml`, `.git` and derived paths also stay hidden.

**`Edit` and `Write` stay text only**, with a 256 KB cap. A note that fails to parse is still refused, but only for paths the note enumeration admits. Templates and the log are not notes.

### D6. One skill source, a second render target

`renderSkills(config, target)` gains `target: 'cli' | 'mcp'`. The CLI render is byte-identical to today's.

**The MCP render:**
- **Includes:**
  - `ctxr-capture`
  - `ctxr-ingest-orchestration`
  - `ctxr-placement`
  - `ctxr-connection-finding`
  - `ctxr-connection-proposal`
  - `ctxr-rollup`
  - `ctxr-mission`
  - `ctxr-session-capture`
  - `ctxr-research`
  - `ctxr-second-opinion`, whose every `ctxr second-opinion` step maps to `second_opinion_critique` or `second_opinion_poll`, then `second_opinion_result`
  - `ctxr-session-lifecycle`
  - `ctxr-submit`
- **Every included skill** is the CLI template, unchanged, with one partial prepended from `templates/skills/mcp/_preamble.md`. This covers the lifecycle skills too, because `bring-the-session-lifecycle-into-the-cli` rewords them around `ctxr session` commands. The preamble says:
  - in this environment a `ctxr session <verb>` step is the tool `session_<verb>` and a `ctxr second-opinion <mode>` step is `second_opinion_<mode>` (then `second_opinion_result`); every other `ctxr <command>` step runs through `ctxr`, or through `ctxr_write` when it writes;
  - paths are under the session root `session_start` returned;
  - `git mv` is `Move`, `git rm` is `Delete`, and `git status` or `git diff` is `session_status`;
  - commits and pushes happen only in `session_submit`.

An earlier draft of this decision gave the two lifecycle skills MCP-specific templates. It was dropped once the CLI gained the same commands, because one text with a tool mapping cannot drift and two texts can.

**The drift guard** is a test over the MCP render that fails when an included skill:
- names a `git` or `gh` command the preamble's mapping table does not list;
- names a tool the surface does not register;
- names a `ctxr` subcommand outside the two allowlists.

This is the counterpart of the existing affordance check, and the allowlists and the tool names are read from the same modules the server uses.

**Opposing case (conditional blocks inside each template, `<!-- target: mcp -->`):**
- A reader would see each surface's exact wording.

It loses because no included skill needs different wording once every step is a command, a file tool or a mapped git verb. Conditional blocks would be used only for spelling, which the preamble already covers.

### D7. `ctxr plugin build` and the `/plugin/` page

`ctxr plugin build [--out <dir>]` renders the MCP target and writes:

```
<out>/claude/.claude-plugin/plugin.json   name, displayName, version, description
<out>/claude/.mcp.json                    {"mcpServers":{"<name>":{"type":"http","url":"<base_url>/mcp"}}}
<out>/claude/skills/<skill>/SKILL.md
<out>/chatgpt/plugin.json                 Agent Plugins schema, extensions.com.openai.interface
<out>/chatgpt/mcp.json                    type streamable-http, auth oauth with client mode dcr
<out>/chatgpt/skills/<skill>/SKILL.md
<out>/<name>-claude.zip, <out>/<name>-chatgpt.zip
```

- **Defaults:** the default `--out` is `.contexture/cache/plugin/`.
- **Name and version:** the plugin's name is `contexture-<store name slug>`. Its version is the CLI version plus the short hash of the commit it rendered from.
- **When it refuses:** it exits with a configuration error when the store has no `mcp` block.
- **Manifests:** the manifest and README text live in `templates/plugin/`.
- **Supporting files:** only the skills' own supporting files are copied, and no included skill has any.

**The `/plugin/` page:** when the MCP surface is configured, `serve` answers `GET /plugin/` with a page that names the two downloads and the one-time install steps for each app. It answers `GET /plugin/<name>-claude.zip` and `GET /plugin/<name>-chatgpt.zip`, built in memory from the loaded configuration and cached per served commit and configuration. The routes need the same verified identity as the approval routes, through `change_approval.identity`, so they are not part of the Bypass set.

**Opposing case (only `ctxr plugin build`, with the operator distributing the zip):** it is one fewer route and less to secure. It loses because the members are mostly not engineers and have no checkout to run `ctxr` in. A download page behind the login they already have is the whole install path.

### D8. Annotations on every tool

Each tool declares `title`, `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`, which is `false` for every tool except the two second-opinion job tools:
- **Read-only:** `find`, `gather`, `Read`, `Grep`, `Glob`, `ctxr`, `session_list`, `session_status`, `second_opinion_result`.
- **Open-world:** `second_opinion_critique` and `second_opinion_poll` are marked `openWorldHint: true`. It is the one tool that sends store content to outside services (three model vendors), and it is not read-only, because it starts a job.
- **Writes that are not destructive:** `capture`, `session_start`, `Edit`, `Write`, `Move`, `ctxr_write`, `session_rebase`, `session_submit`. `session_submit` publishes, but its effect is a reviewable pull request.
- **Destructive:** `Delete` and `session_discard`.
- **Idempotent:** the read-only tools and `session_status`.

The annotation is a presentation hint only. Scope and ownership checks stay in the server.

### D9. One name per operation across the CLI and MCP

**The rule:** every MCP tool is exactly one of the following.
- **A Claude Code file tool:** `Read`, `Grep`, `Glob`, `Edit`, `Write`. Or one of `Move` and `Delete`, which stand in for the harness's own file operations that a local agent performs with `git mv` and `git rm`.
- **A `ctxr` command:** named for its command path with `_`, and taking that command's options as fields. Either it calls the command's core function, or it runs the command itself through `ctxr` or `ctxr_write`.
- **A named exception**, each with its reason:
  - `find`: it stands in for the content matching a local agent does with its own `Grep` together with `catalog show`. A client may lack both, and it gives a non-engineer one obvious entry.
  - `gather`: this is `ctxr context gather` with bodies attached, which a client cannot read in one call otherwise. Its name is kept for the clients already connected.
  - `capture`: a one-call capture for a phone, equal to `session_start`, `Write` into the inbox, `ctxr source check` and `session_submit` together.
  - `second_opinion_result`: the transport cannot hold a minutes-long call open.

**The enforcement:** a test reads the tool registry and the CLI's command registry, and fails when a tool is none of these, or when a command-named tool's fields are not that command's options.

**Opposing case:** let MCP tools be shaped for chat, with fewer and coarser tools that each do several steps. That is friendlier to a model that has no skills loaded. It loses on your rule that skills and tools align. A coarse MCP-only tool is a step the CLI's skill text cannot name, which is the drift this change removes. `capture` is the one coarse tool kept, and it is named as an exception.

### D10. A second opinion runs asynchronously, in a worker that holds no approval credential

`second_opinion_critique(plan, session?, tier?, only?)` and `second_opinion_poll(question, tier?, only?, lens?)`, the `ctxr second-opinion critique|poll` options as fields, each write a job to a spool directory, `.contexture/cache/mcp/opinions/<id>/`:
- the request, the member's email, and the plan or question as text;
- for a critique of a session, the session's diff appended when `session` is given.

It returns the job id at once. `second_opinion_result(id)` returns `pending`, or, once the job is done, the letters, the manifest and the exit status, exactly as the command writes them. Only the member who started a job sees it. Jobs and their results are deleted after 7 days.

**The worker:** `ctxr second-opinion work --spool <dir>` takes one job at a time from the spool, runs `ctxr second-opinion critique|poll` on it, and writes the result beside the request. contexture-images runs it as an `opinions` service:
- same image;
- the agents container's model-CLI home mounted, so the CLIs are already signed in;
- the store's cache spool mounted;
- **no** App key and no forge token.

**Why not run it inside `serve`** (the opposing case, steelmanned): it is one process fewer, there is no spool, and the result could be synchronous. The CLIs' containment looks sufficient on paper, since Claude runs with no tools and codex in a read-only sandbox. It loses on what "read-only" means:
- **The key is readable.** `serve` mounts the App private key as a file (`/run/secrets/github-app-key`), and codex's read-only sandbox can read files.
- **The plan is member text.** A prompt injection in it could make a critic quote the key back into the letters, and those letters go to the member.
- **agy has no mode that removes its ability to act**, as the skill already says.

The App key is what makes an approval trustworthy, and memory D5 of 2026-10-21 already keeps it out of every container that runs agents. A model CLI is such a process.

**Why asynchronous:** a strong-tier critique took one to two minutes on a short plan, and up to ten with a deeper Claude effort. That is longer than a chat app can be relied on to hold one tool call open. The result call is cheap and idempotent, and the rendered skill tells the agent to say the critique is under way, which is what the local skill already says for long runs.

**Why a spool rather than a queue service:** the store volume is already shared, and the spool is plain files with an atomic rename to claim a job. Nothing new needs to stay running in `serve`.

## Risks / Trade-offs

- **The agent forgets the session root and writes outside it.** → The write is refused, never redirected. The refusal lists the open sessions with their roots, and the preamble states the rule once.
- **Unsubmitted work piles up in the store's volume.** → `session_list` shows age and uncommitted state, the preamble tells the agent to mention open sessions at the start of a conversation, and the per-member cap of 20 bounds it. Removal stays an explicit `session_discard`. Nothing is reaped silently, because the lifecycle has no reaping.
- **A CLI command run by `ctxr_write` writes outside the session.** → The cwd and `CONTEXTURE_STORE_ROOT` are the session worktree, root-changing options are refused, and path arguments are resolved and confined. `session_submit` stages only inside the worktree. Anything else is a CLI bug, and the existing integration tests cover the CLI's root confinement.
- **A spawned `ctxr` is slow on a large store**, because each call builds its own state. → The 30-second limit is a hard bound, and `doctor` is the slowest command. The pkm timing is measured in task 9.1 before the limit is fixed.
- **A rebase left in progress blocks other calls on that session.** → `session_submit`, `Move` and `Delete` refuse during a rebase, naming `session_rebase` with `continue` or `abort`. `Read` and `Edit` work, so the conflict can be resolved.
- **The `opinions` service is down, or its CLIs are signed out.** → A job left unclaimed for 2 minutes makes `second_opinion_result` report `worker_unavailable`. The worker runs `preflight` at start and writes its status to the spool, and the job tools refuse at once when the last preflight failed, naming the CLIs that failed.
- **Store content goes to three vendors.** → `openWorldHint: true` makes both apps prompt for it. The member supplies the text, and the result names the families used.
- **The plugin formats are new and may change.** → The manifest text lives in templates, and `ctxr plugin build` has a test asserting each manifest's shape against the documented fields. Format drift is then a template change.
- **ChatGPT's plugin admission is partly unverified** (help-center pages were read through search snippets only). → Task 9.2 installs the built zip in ChatGPT before the change is archived. If it cannot be installed, developer mode plus the server instructions is the documented fallback.

## Migration Plan

1. **Ship.** `serve` adopts open `mcp-draft-*` worktrees as their members' sessions. A draft's pull request stays open and landable, and further edits to it now rest uncommitted until `session_submit`.
2. **Upload once.** Members download the plugin from `/plugin/` and upload it once per app. Without the plugin the surface still works, with the server instructions only.
3. **Rollback.** Pin the previous image. Sessions started over MCP stay ordinary sessions, which the approval page lists and `ctxr land` lands.

## Open Questions

- Whether a personal Claude account can add a private GitHub repository as a marketplace, which would let the plugin update itself. This does not change the build; a later change would commit `<out>/claude/` into the store.
