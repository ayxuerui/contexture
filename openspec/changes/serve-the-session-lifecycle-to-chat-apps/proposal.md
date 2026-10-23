## Why

A member working in the Claude or ChatGPT app gets a different write model from an agent working locally:
- **Locally**, an agent follows the session lifecycle that the shipped skills teach. It starts a named session, works in it across turns, runs the store's checks, writes the commit and the pull request's description, and submits only when the operator asks. It also answers a decider's requested changes.
- **Over MCP** today, every `Edit` or `Write` commits and publishes at once into a single draft per member, which gets a fixed title and body. The skills are not there at all. A chat app gets the tools without the practice. One member cannot keep two pieces of work apart, half-finished work shows up on the approval page, and a decider's comment never reaches the member.

Both vendors now ship plugins that bundle skills with a remote MCP server, and these work in the chat apps as well as in Claude Code. That makes it possible to give a chat app the same skills and the same lifecycle.

## What Changes

- **Sessions over MCP:**
  - New tools: `session_start`, `session_list`, `session_status`, `session_submit`, `session_rebase` and `session_discard`. Each one calls the same core as `ctxr session <verb>`, which change `bring-the-session-lifecycle-into-the-cli` adds and which must land first.
  - A member can hold several named sessions at once. Each one is a real session worktree, owned by the member who started it.
  - `session_submit` takes a branch name, a commit message, and a title and body written by the agent. It runs `ctxr doctor` as the gate, commits as the member, pushes, and opens or updates the pull request, appending the generated sections as the command does.
  - `session_list` reports each pull request's approval decision, including the decider's comment. This is what `ctxr review list` gives a local agent.
- **BREAKING: drafts are removed.** `Edit` and `Write` (with Claude Code's own parameters, unchanged), plus new `Move` and `Delete` tools, change files inside a session the member owns. They are addressed by the session worktree's path, just as a local agent addresses them. They write the working tree; nothing commits or publishes until `session_submit`. An open `mcp-draft-*` session is adopted as its member's session, and its pull request stays landable.
- **A wider editable set inside a session.** Inside a session, the editable set grows to what a local session may change: notes, captures, templates, house conventions and the log. Configuration, the hooks directory, `.git*` files, derived files and the managed skills stay refused. The hooks directory is refused because a commit in a session worktree runs that worktree's hooks on the server.
- **`ctxr` and `ctxr_write` tools.** `ctxr` runs read-only CLI commands such as `lint`, `doctor`, `catalog show`, `graph query`, `graph diff`, `source check`, `rollup stale` and `publish urls`, against the served commit or one of the member's sessions. `ctxr_write` runs write commands such as `ingest`, `archive`, `entry append`, `rollup write`, `source stamp` and `session capture`, inside a session. Both take an allowlist of subcommands, pass argv with no shell, and accept no option that changes the store root. With these, a skill's "run `ctxr lint`" works unchanged.
- **One name per operation across the surfaces.** Every MCP tool is either one of Claude Code's file tools or a `ctxr` command. A command's tool is named for its path: `ctxr session submit` is `session_submit`, and `ctxr second-opinion critique` is `second_opinion_critique`. The exceptions are named, and each has its reason. A test checks the tool registry against the CLI's command registry.
- **A second opinion over MCP.** `second_opinion_critique` and `second_opinion_poll` queue a critique or a poll through `ctxr second-opinion`, which comes from change `run-the-second-opinion-from-the-cli` and must land first, and returns a job id. `second_opinion_result`, the one tool that exists only because a chat app cannot hold a call open for minutes, returns the letters and the manifest once the job is done. The job runs in a worker that has the model CLIs signed in and no approval credential: a new `ctxr second-opinion work` loop, run as its own service in contexture-images. `serve` never runs a model CLI, because the App key is mounted in its container and codex's read-only sandbox can read files. The plugin then includes `ctxr-second-opinion`, rendered for the tool.
- **Tool annotations.** Every tool carries honest annotations (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), so each app's confirmation prompts match what a call does.
- **One skill source, a second rendering.**
  - Owned skills render for the MCP surface as well as for the CLI.
  - Every included skill is the same template as the CLI's, behind one shared preamble that maps each command to its tool. Once the CLI change rewords `ctxr-submit` and `ctxr-session-lifecycle` around the session commands, they need no MCP-specific text either.
  - A check over the rendering refuses any `git` or `gh` step the preamble does not map, and any tool the surface does not offer.
- **`ctxr plugin build`** writes a Claude plugin (`.claude-plugin/plugin.json`, `.mcp.json`, `skills/`) and a ChatGPT plugin (`plugin.json`, `mcp.json`, `skills/`) for the store, each also as a zip, pointing at the store's `serve.base_url` `/mcp`.
- **A `/plugin/` page in `ctxr serve`.** When the MCP surface is configured, members can download both zips from it, behind the same verified identity as the approval page.

## Non-goals

- **Landing from a chat app.** A decision has to be made by a verified person on the approval page, which records it against that person's identity. An agent calling a tool cannot carry that consent. `session_submit` hands off the approval page's address, as `ctxr-submit` does locally.
- **Shipping every owned skill in the plugin.**
  - `ctxr-upgrade` and `ctxr-circleback` run local programs: npm and the `cb` CLI.
  - `ctxr-derived-artifacts` is the server's own job.
  - `ctxr-land` is replaced by the approval page.
  - `ctxr-organize-audit` and `ctxr-publish` both depend on local checks that the server cannot stand in for: organize-audit moves notes at scale and then checks the move across scripts, and publish relies on a local browser preview. Both are left for a later change.
- **A committed marketplace in the store repository.** I could not verify that a personal account can add a private marketplace, while a zip upload works on every paid plan. The built directories are laid out so that a later change can commit them.
- **Skill text for clients without plugins.** Gemini and the free plans still get the server instructions only. Serving skill text over `Read` would need a reserved path, and the surface is kept small until there is a client that needs it.
- **A general shell or git tool.** Every server-side git step is a typed session tool, so that each one keeps its own scope, ownership check and annotation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `remote-access`:
  - Sessions and their tools.
  - `Edit`, `Write`, `Move` and `Delete` within a session, replacing the drafts.
  - `Read`, `Grep` and `Glob` over session roots and the wider readable set.
  - The `ctxr` and `ctxr_write` tools.
  - Tool annotations.
  - The second-opinion tools.
  - The plugin download page.
- `harness-portability`: owned skills render for the MCP surface, the check that the rendering names only what the surface offers, and `ctxr plugin build`.

## Impact

- **Code:**
  - `src/core/mcp/` gains `tools/sessions.ts`, `tools/cli.ts` and `tools/opinion.ts`.
  - A new `ctxr second-opinion work` subcommand.
  - `edit.ts` and `drafts.ts` are rewritten around session roots; `files.ts` resolves session roots.
  - `surface.ts` serves `/plugin/`.
  - `src/core/skills.ts` gains a render target.
  - A new `src/commands/plugin-build.ts`.
  - New templates: `templates/skills/mcp/_preamble.md` and `templates/plugin/`.
- **Behaviour:** existing MCP clients see new tools. `Edit` without a session root is now refused with an instruction to call `session_start`; until now it opened a draft.
- **contexture-images:** a new `opinions` service in the shared compose. It uses the same image and the agents' signed-in model homes, mounts the spool, and does not mount the App key.
- **Depends on:** `bring-the-session-lifecycle-into-the-cli` and `run-the-second-opinion-from-the-cli`.
- **Deployment:** pkm keeps its configuration. Members download the plugin from `brain.ruixue.ai/plugin/` and upload it once in each app. The Cloudflare Bypass app must not cover `/plugin/`; it does not today.
