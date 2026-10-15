## Why

A store is usable today only from a harness that has a shell and a local clone: Claude Code, Codex, Antigravity,
or the Hermes container. Most of the people a store is meant to serve never open one. They work in the Claude and
ChatGPT apps on the web, on desktop and on the phone, and those apps can reach a store only through a remote MCP
connector, which an organisation owner adds once for everyone. contexture ships no such server. So the people
who know the most about what should be captured are the ones who cannot capture anything, and they cannot ask
the store a question either.

These clients cannot run the agent's own retrieval legs. The pass deliberately leaves content matching to the
agent's grep, and leaves reading note bodies to the agent's Read. A chat client has neither, so a remote surface
has to perform both on the client's behalf. It must do that without becoming a ranker, without a model on the
server, and without letting anything reach the default branch ungated.

## What Changes

- **New command `ctxr mcp serve`.** It runs an MCP server over the Streamable HTTP transport on a dedicated
  checkout of the store. It exposes three tools and holds no LLM keys. All of the judgement stays in the
  client's own model:
  - `find`: literal, case-insensitive content matching over notes, standing in for the agent's grep. It returns
    path, gloss, matching lines and a link. Results are in path order with no score. Captures, including those still
    waiting on unmerged `capture/` branches, come back in a separate `unfiled` field and are never mixed into the
    notes. Called without text, it returns the catalog as a
    map of the store.
  - `gather`: the existing retrieval pass, run from selectors, plus the bodies of the returned notes in the pass's
    order up to a byte budget. The rest are listed without bodies. It refuses a capture as a seed and says the
    capture is not filed yet.
  - `capture`: writes one new capture into the inbox under a name carrying its branch's ID, so names never collide.
    It runs the source check, counting captures still waiting on other `capture/` branches, and the store's
    required-section rule before writing. It commits on a fresh `capture/` branch with a
    trailer naming the signed-in member, and pushes that branch. It never touches the default branch.
- **Built-in authorisation for members.** The server is its own OAuth 2.1 authorisation server: dynamic client
  registration, PKCE S256 only, and signed, resource-bound tokens that the server never stores. A member signs in by entering a personal access code
  that the operator issued. It is deny by default, scopes (`read`, `capture`) are assigned by the server and never
  chosen by the client, and removing a member revokes their access on the next call. The only state is a member list
  and a signing key, kept in a directory outside the store and never in the repository.
- **New commands `ctxr mcp member add|remove|list`** manage that membership on the host. `add` prints the access
  code exactly once and stores only its hash.
- **New command `ctxr mcp check-branch --base <ref>`.** It exits non-zero unless a branch only adds well-formed,
  not-yet-ingested markdown captures under the inbox path, and it reads the store's configuration from the base,
  never from the branch it judges. A store's CI runs it to gate merging `capture/` branches, so that gate does not
  depend on trusting the server. The README carries a sample workflow; contexture installs none. The workflow's
  precondition is a bot credential that cannot modify workflows, so a branch can never rewrite its own gate.
- The server keeps its checkout current, and every tool call reads a single commit. Before serving a call it runs a fast-forward-only pull at most once per
  configurable interval, and rebuilds the derived graph whenever `HEAD` moves. When a pull fails it serves the last
  good state and says how stale that state is.
- Tool descriptions and the server's instructions to the client are shipped prose, so they live in `templates/mcp/`.

## Non-goals

- **Remote file and shell tools** (`bash`, an editor, `apply_patch` in a sandbox per session). Engineers already
  have local clones. Running containers from a host that is publicly reachable is the heaviest operational piece,
  and it would raise the bar for every adopter, including those who never use it. Deferred until the prototype
  shows engineers want the store from chat apps.
- **`propose_edit`, and any edit to an existing note.** A whole-file edit needs a base revision and a review path
  for authors who are not engineers. That needs its own design; this change writes new captures only.
- **Curation jobs over MCP** (`start_job` and `job_status`). Curation stays with Hermes or an engineer working
  interactively, as it is today. Clients poll badly, and a job queue would be new server state.
- **Opening or merging pull requests from contexture.** Doing so needs a forge API. contexture retired its forge
  adapter, and its only outbound call is the release check. contexture pushes a branch through git; the store's
  own CI decides what merges.
- **An external identity provider, Google sign-in, or Client ID Metadata Documents.** Each would add an outbound
  call or a dependency. Access codes cover a group the operator already knows by name. design.md D3 argues this
  both ways.
- **A stdio transport.** Writing an envelope on stdout cannot coexist with JSON-RPC on stdout. The local harnesses
  that would use stdio already have the files.
- **Server-side synthesis (a `think` tool).** The client's model synthesises from what `gather` returns, and the
  server stays deterministic.

## Capabilities

### New Capabilities
- `remote-access`: the MCP server, its three tools and what each returns, member authorisation, the capture write
  path, the merge gate a store's CI runs, and how the server keeps its checkout current.

### Modified Capabilities
- `context-retrieval`: *Content matching is a direct agent leg, not a CLI command* gains a bounded exception. The
  remote surface may perform literal matching for a client with no file access, ranking nothing and honouring
  exclusions. No CLI command is added.
- `context-ingest`: *The capture tier is retained and excluded from retrieval* gains one exception: the remote
  surface's lookup of unfiled captures. It lists captures apart from notes so a member can see whether material is
  already captured, which is the same search the capture skill already tells a local agent to run. Captures still
  take no catalog entry, no graph node and no place in the pass.

## Impact

- New `src/commands/mcp-serve.ts`, `mcp-member.ts` and `mcp-check-branch.ts`, and a new `src/core/mcp/` module
  (JSON-RPC and the Streamable HTTP transport, OAuth, tools, sync), all registered in `src/run.ts`.
- `ctxr` pushes over git for the first time, through the existing `GitRunner`. It makes no new `fetch` call, so the
  release check remains its only outbound HTTP.
- No new dependencies. The MCP protocol subset and OAuth are built on `node:http` and `node:crypto`.
- New `templates/mcp/` prose, and a README section covering host setup, connector setup for each vendor and the
  sample CI workflow.
- No `contexture.yaml` schema change. Server settings are flags, and state lives outside the store.
