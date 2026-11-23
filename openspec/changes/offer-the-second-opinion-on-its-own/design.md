# Design

## Context

See proposal.md, Why. Current state:

- **One path over MCP.** The four `second-opinion` commands are on the `ctxr` runner's read allowlist (`CTXR_READ_COMMANDS` in `src/core/mcp/tool-map.ts`). `ctxrTool` in `tools/cli.ts` hands them to `secondOpinionTool`, which writes the runner's `input` to a file, adds `--require-confinement`, starts the run detached, waits once within 45 s, and sets the run's owner to the member's email.
- **Scopes are per tool.** Each tool declares one scope. `scopesFor` in `members.ts` maps an email to `read`, `capture` and `edit` from `mcp.readers`, `mcp.capturers` and `mcp.editors`. The runner `ctxr` is a `read` tool, so a per-command scope cannot be expressed on it.
- **Tools mirror commands.** `tool-map.ts` already has a `command` kind: a tool named for its command path, whose fields are that command's options plus `session`. A test (`alignmentProblems`) fails on any other field. The six session tools are of this kind.
- **The command needs no store.** `ctxr second-opinion` declares `store: 'optional'` and outside a store runs on the schema's own lineup defaults. A detached run records its lineup in its run record, and the child never re-reads a store.
- **The server needs a store for everything.** `ctxr serve` requires a store. The MCP surface answers only when `change_approval` built an approval server: it takes the identity verifier, the origin of `serve.base_url`, and the token-signing key from it. The signing key is derived from the GitHub App's private key, or is random per process when there is no App.
- **One plugin.** `ctxr plugin build` writes the `contexture` Claude plugin from the shared skills and a command map, and a test compares the committed `plugins/contexture/` with the render. The connect page at `/plugin/` names that plugin and the store's connector address.
- **Unsynced changes.** `serve-the-second-opinion-to-chat-apps`, `second-opinion-lineup-in-store-config`, `second-opinion-start-and-fetch` and `second-opinion-through-openrouter` are implemented and not yet synced into the main specs. This change modifies requirements those four added, so it syncs after them (tasks, Workflow follow-up).

## Goals / Non-Goals

**Goals:**
- **Grant the review apart from reading.** A member list of its own, enforced by the same per-tool scope check as every other tool.
- **One implementation, two servers.** The four tools, sign-in, the run folders and the bounded fetch are the same code in `ctxr serve` and in the server with no store.
- **The new scope opens no store file.** Nothing a `second-opinion` member can call reads the store, a session or the forge.

**Non-Goals:**
- **A general way to run `ctxr serve` with parts turned off.** One second surface, named for what it is.
- **A general permission model per command.** One new scope, because one command spends money and needs no store.

## Decisions

### D1. A scope of its own, held by readers when the store names no list

`MCP_SCOPES` gains `second-opinion`. `mcp.second_opinion` is an optional list of the same person entries as the other three (an exact email or an `@domain` suffix), with no shipped default. `scopesFor` gives the scope to an email the list admits. When the key is absent, it gives the scope to every email that holds `read`.

The `mcp` block's "at least one entry" rule counts the new list, so a store may declare `mcp` with only `second_opinion`.

**Why the fallback.** Every reader can run a second opinion today. A store that updates `ctxr` and changes nothing must keep that. Once the store writes the list, the list alone decides, and an empty list (`second_opinion: []`) withholds it from everyone.

**Alternative: no fallback, the list is required.** It is the simpler rule and matches the other three lists. Rejected because every existing store's members would lose the tool on the day the server updates, with nothing in their store's history to explain it.

**Alternative: enforce the list inside the `ctxr` runner.** No new tools and no change to four unsynced requirements. Rejected because the runner is a `read` tool: a member with only the new scope would have to be shown a tool whose description is about `lint` and `doctor` and which refuses everything but one command, and a server with no store would list a runner for a CLI it does not otherwise serve.

The name `second_opinion` under `mcp` breaks the pattern of role nouns (`readers`, `capturers`, `editors`). It is kept because no role noun reads correctly where the key is written: "reviewers" already means the people who decide a change.

### D2. Four tools, one per command, taking text for the two file options

| Tool | Command | Fields |
| --- | --- | --- |
| `second_opinion_preflight` | `second-opinion preflight` | `tier`, `only`, `timeout` |
| `second_opinion_critique` | `second-opinion critique` | `plan` (required), `tier`, `only`, `timeout`, `seed` |
| `second_opinion_poll` | `second-opinion poll` | `prompt` (required), `lens`, `wrap`, `tier`, `only`, `timeout` |
| `second_opinion_result` | `second-opinion result` | `run` (required), `wait` |

All four declare the `second-opinion` scope. They are `command` tools in the registry, so the alignment test covers them.

- **`plan` and `prompt` are text.** The command's options are `--plan-file` and `--prompt-file`. The alignment rule gains one case: a field named `<x>` is allowed when the command registers the option `<x>_file`, and it carries that file's text. The server writes the text to a file in the call's temporary folder, as `input` is written today. This replaces the runner's `input` field and the `@input` argument for a second opinion.
- **No `session` field.** A second opinion does not read a session. Leaving the field out is what keeps the new scope away from sessions, which need `edit`.
- **Options the server decides are not fields.** `--out`, `--print`, `--detach`, `--json`, `--require-confinement` and `--run-folder` are set by the server, as now. With no argument vector from the member there is nothing to refuse for them any more. `timeout` above the server's limit is still refused before anything runs.
- **One behaviour for critique and poll.** The call starts a detached run and waits once within the bound: a short run answers in the call, a long one returns its run id. This is today's blocking form. The explicit `--detach` form is gone from the surface, since `result` covers it.
- **The result carries the command's output and exit code**, and no `ran_against` commit: a member without `read` is told nothing about the store's state.

This is the case the earlier decision to keep two runner tools left open: per-command control by the operator. The rule that each MCP tool mirrors one `ctxr` command through one core still holds.

### D3. The runner refuses a second opinion by naming its tool

The four commands leave `CTXR_READ_COMMANDS`, and `input` leaves the `ctxr` tool's schema. A `ctxr` call whose arguments begin with `second-opinion` is refused before anything runs, with a message that names the tool for that command (`routeForCommand` already maps a command path to its tool).

**Why not keep both paths for a release.** While the runner still ran the command, `read` would reach what `mcp.second_opinion` withholds. A client following the previous skill text gets one refusal that tells its model which tool to call, and the plugin's next update carries the new text.

### D4. Server instructions and the connect page follow the member's scopes

- **`initialize`.** The store section of the instructions (paths, layers, relation vocabulary) is returned only to a principal that holds `read`. Any other principal gets the store's name, the server's `ctxr` version and one paragraph on the second-opinion tools. Enforced where the surface builds the per-principal context.
- **`tools/list`** already filters by scope, so a member with only the new scope is listed the four tools.
- **`/plugin/`.** A member whose only scope is `second-opinion` is shown the `second-opinion` plugin and the connector address. Any other member is shown the `contexture` plugin, as now. The store's ChatGPT plugin carries every shared skill and is linked only for a member who holds `read`; other members are linked a ChatGPT plugin carrying the second-opinion skill alone (D6).

### D5. The lineup is the server's, never the caller's

Unchanged in substance. In `ctxr serve` the tools resolve the lineup from the served commit's configuration, and the server's environment still wins. The tools have no field that names a model, a route or an address. The two existing requirements that say so are reworded for the new tools and keep their scenarios: a member's session that edits the lineup still changes nothing, now because no second-opinion tool reads a session at all.

### D6. A second plugin, `second-opinion`, from the same builder

- **What it carries.** The `ctxr-second-opinion` skill, the same text the `contexture` plugin carries, and one command, `ask`, so `/second-opinion:ask` opens the skill. No vendored craft skills, no connector, no credential.
- **Where it lives.** `plugins/second-opinion/`, listed as a second entry in `.claude-plugin/marketplace.json`. `ctxr plugin build` writes both Claude plugins, and the committed-plugin test compares both.
- **How it is built.** `buildClaudePlugin` takes a plugin definition: name, display name, the skills it includes and its command map. The `contexture` definition is today's constants. No second build path.
- **ChatGPT.** `buildChatgptPlugin` takes the same definition, so a server can build an archive that carries only this skill with its connector address.

**One or the other.** Both plugins carry the same skill under their own namespace. The plugin's README and the connect page say to install `second-opinion` only without `contexture`.

**Alternative: no second plugin; a second-opinion member installs `contexture`.** Rejected because that plugin's skills and commands are about a store, and a model given them and four review tools will try the others.

The command name `ask` is the open naming choice in this change. `/second-opinion:second-opinion` repeats itself, and `critique` would misname a poll.

### D7. A server with no store: `ctxr second-opinion serve`

```sh
ctxr second-opinion serve --config /etc/ctxr/second-opinion.yaml --port 18081
```

- **It is a subcommand of the group it serves.** `requires: { store: 'none' }`. It takes `--config` (required), `--port` and `--host` (loopback by default, as `ctxr serve`).
- **Routes.** The OAuth paths, `/mcp`, `/plugin/` and its archive. Every other path is `404`, and every method these routes do not take is `405`. There is no webhook, approval, review, preview or note route, because the handler has none to reach.
- **What it never reads.** `credentialsFor`, the App key variables, the webhook secret and git are not called on this path. A test starts the server with those variables set to unreadable paths and with no `git` and no `gh` on `PATH`.
- **Shared code.** `McpSurface` is split into the part every surface needs (sign-in, the per-request tool context, scope filtering) and the part a store adds (the read view, the write side, the forge). The second-opinion tools take only what they use: the CLI entry, the environment, the lineup source and the bounds.
- **Lineup.** The file's `second_opinion` block, in the store's own schema. The server hands the resolved lineup to the detached start the way a run record already carries it, so the child never looks for a store. The environment overrides still win.
- **Confinement.** `--require-confinement` is added to every run, as in `ctxr serve`. A lineup answered wholly through OpenRouter starts no CLI and needs none.

**Alternative: `ctxr serve --only second-opinion`.** One command name and one supervisor program. Rejected because the flag would change which file the command requires and how it finds its root, and `ctxr serve` documents itself as serving a store. A reader of a compose file or a process list should see which server is running from its name.

**Alternative: a store-shaped folder with a `contexture.yaml` that holds only these keys.** Rejected because every other command would then see a store there and fail on it in its own way, and `change_approval` would have to be half-declared to carry the identity settings.

### D8. The server's file

```yaml
base_url: https://opinion.example.com
identity:
  header: Cf-Access-Jwt-Assertion
  issuer: https://example.cloudflareaccess.com
  audience: <application audience>
  jwks_url: https://example.cloudflareaccess.com/cdn-cgi/access/certs
members:
  - "@example.com"
second_opinion:
  strong:
    agy:
      openrouter: <vendor>/<model>
```

- **A strict schema of its own**, built from the store schema's parts: `identity` is `change_approval.identity`'s object, `members` is a non-empty list of person entries, `second_opinion` is `SecondOpinionSchema` with its shipped defaults. An unknown key is refused by name.
- **Flat names, not the store's paths.** In a store these values live at `serve.base_url`, `change_approval.identity` and `mcp.second_opinion`. The file does not repeat `change_approval`, because it declares no change approval, and a reader of the file should not have to know why the key is called that.
- **No secret.** The OpenRouter key and every token stay in the environment, as in a store.
- **It follows the file.** The server re-reads the file when it changes, by the check `ctxr serve` uses for `contexture.yaml`. A member removed from `members` is refused on their next call. A file that does not load leaves the last good one in place and is reported once.
- **Every member holds `second-opinion`** and no other scope.

### D9. A signing key that survives a restart

`ctxr serve` signs tokens with a key derived from the App's private key, so members stay signed in across restarts. This server has no App. A random key per process would sign every member out at each restart, and the runtime image restarts its `ctxr` programs after the daily update.

The server keeps a 32-byte key in a file under its state folder: `--state-dir`, defaulting to `$XDG_STATE_HOME/ctxr/second-opinion-serve`, or `~/.local/state/ctxr/second-opinion-serve`. It creates the file with mode `0600` on first start and refuses to start when the file or its folder can be read by another user. Deleting the file signs everyone out.

A model CLI the server starts runs in a fresh home under Landlock rules that do not include the state folder, so it cannot read the key. The existing confinement test gains this folder.

**Alternative: a key file named by an environment variable.** Rejected as one more thing the operator must create before the first start, for no gain: nothing else needs to know the key.

### D10. The skill names the tools

`templates/skills/_surfaces.md` loses its `input` sentence. `templates/skills/ctxr-second-opinion.md` says, at each step that runs a command, which tool runs it through a server and that the plan or question goes in `plan` or `prompt`. The step that tells a shell to add `--detach` says that through a server the tool returns a run id when the run is still going. The drift check over the plugin render already fails on a `ctxr` command that no tool or runner routes, so it enforces the move.

## Risks / Trade-offs

- **A client on the previous skill text is refused once.** → The refusal names the tool to call (D3). The plugin updates from the marketplace, and the store's copy with the next `ctxr update`.
- **A store writes `mcp.second_opinion` before every host updates, and an older `ctxr` refuses the configuration.** → The release note says to update first, as for the `openrouter` key. `ctxr doctor` already reports a configuration the running version cannot load.
- **An operator expects `second_opinion: []` to mean "readers, as before".** → The skill's lineup section and the README state the rule: absent means readers, present means exactly the list.
- **The server with no store sits on the open internet behind an access proxy the operator configured wrongly.** → The same exposure as `ctxr serve`, with the same check: `/authorize` issues nothing without a verified assertion. The README repeats that every path but `/mcp` and the OAuth metadata needs the proxy's login.
- **Nine requirements from four unsynced changes are modified here.** → Tasks sync those four first. Until then this change's deltas are checked against the text in those changes, not the main spec.
- **Two plugins that carry one skill get installed together and the skill is offered twice.** → The README and the connect page say which one to install. The connect page shows a member only the one their scopes call for.

## Migration Plan

1. Release `ctxr` with the tools, the scope, the plugin and the command. Stores change nothing: readers keep the second opinion, now through the four tools.
2. Members' plugins update from the marketplace. A client still on the old text is redirected by the runner's refusal.
3. A store that wants a separate list adds `mcp.second_opinion` after every host runs the new version.
4. contexture-images adds the program and service for `ctxr second-opinion serve`.

Rollback is the previous release. A store that wrote `mcp.second_opinion` removes the key first, since the previous version refuses it.

## Open Questions

- **The plugin command's name** (`ask`, D6).
- **Whether the standalone connect page should exist before contexture-images ships the service**, or whether the README is enough for the first operator. The design includes it because the ChatGPT archive has no other home.
