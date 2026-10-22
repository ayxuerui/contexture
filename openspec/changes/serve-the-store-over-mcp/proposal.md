## Why

A store is usable today only from a harness that has a shell and a local clone: Claude Code, Codex, Antigravity,
or the Hermes container. Most of the people a store is meant to serve never open one. They work in the Claude and
ChatGPT apps on the web, on desktop and on the phone, and those apps can reach a store only through a remote MCP
connector. contexture ships no such connector. So the people who know most about what should be captured cannot
capture anything, and they cannot ask the store a question either.

Two things now make the connector small. `ctxr serve` already holds the store's recording identity (a GitHub App),
already verifies who a person is from the access proxy's signed assertion, and already lands changes a decider
approves from its approval page. A remote connector needs exactly those three things: an identity to sign members in
with, a forge credential to open a pull request with, and a reviewed path onto the default branch.

These clients cannot run the agent's own retrieval legs. The pass deliberately leaves content matching to the
agent's grep, and leaves reading note bodies to the agent's Read. A chat client has neither, so the remote surface
has to do both on the client's behalf. It has to do that without becoming a ranker and without a model on the
server.

## What Changes

- **`ctxr serve` serves MCP when the store declares an `mcp` block.** It speaks the Streamable HTTP transport at
  `/mcp`, beside the browsing and approval routes, on the same port and hostname. The block names which verified
  people may read and which may capture. It requires `change_approval`, whose identity settings and forge
  credential it reuses. Without the block, every MCP path answers `404`.
- **Three tools, none of which call a model.** All judgement stays in the client's own model.
  - `find` does literal, case-insensitive content matching over notes, standing in for the agent's grep. Results
    come in path order, with no score. Captures, including those waiting for approval, come back in a separate
    `unfiled` field. Called with no text, `find` returns the catalog as a map of the store.
  - `gather` runs the existing retrieval pass from selectors and adds the note bodies, in the pass's order, up to a
    byte budget. It refuses a capture as a seed.
  - `capture` writes one new capture into the inbox in a session worktree, then commits it as the signed-in
    member, pushes the branch as the App and opens a pull request. The change then appears on the approval page
    like any other session, and lands when a decider approves it. Before writing, it runs the source check, which
    counts captures still waiting for approval, and the store's required-section rule.
- **Sign-in goes through the same identity as the approval page.** `serve` is an OAuth 2.1 authorisation server for
  its own `/mcp`:
  - Registration is dynamic and stores nothing.
  - PKCE S256 is required, and redirect URIs must match exactly.
  - Authorisation codes are single use.
  - Tokens are signed, bound to the resource, and never stored.

  The `/authorize` page stays behind the access proxy. It verifies the configured identity assertion exactly as
  the approval routes do, admits only configured members, and asks the person to confirm the client before
  issuing a code. There are no access codes and no member list outside `contexture.yaml`, so removing someone
  there refuses their next call.
- **Reads come from a checkout the MCP surface owns.** That checkout is a detached worktree under the derived cache
  path. It follows the remote default branch by forced checkout at most once per interval, carries its own graph,
  and serves every tool call from a single commit. It never touches the checkout that the agents and `land` share.
- **The forge client can open a pull request,** which is the one forge call `capture` adds.
- Tool descriptions, the server's instructions to the client and the consent page are shipped prose, kept in
  `templates/mcp/`.

## Non-goals

- **Remote file and shell tools** (`bash` and editor tools in a sandbox). Engineers have local clones. A sandbox
  per session would be the heaviest thing a store's operator could be asked to run.
- **`propose_edit`, or any edit to an existing note.** A whole-file edit needs a base revision and a review
  experience designed for authors who are not engineers. This change writes new captures only.
- **Captures that land without a decision.** Every capture goes through the approval page. An inbox-only
  auto-landing rule inside `land` is a separate change (design.md D9).
- **Curation over MCP** (jobs, polling). Curation stays with Hermes or an engineer working interactively.
- **Access codes, a member CLI, or any MCP state outside the store's own configuration and derived cache.**
  Superseded by sign-in through the access proxy (design.md D4).
- **A standalone `ctxr mcp serve` process or a separate container.** design.md D3 argues this both ways.
- **Server-side synthesis (a `think` tool) and a stdio transport.**

## Capabilities

### New Capabilities
- `remote-access`: the MCP surface `ctxr serve` adds. It covers its configuration, the three tools and what each
  returns, member sign-in through the access proxy, the capture path through the approval page, and the read
  checkout the surface keeps current.

### Modified Capabilities
- `context-browsing`: *Only read-only HTTP methods are served* gains the MCP routes as a second exception, when
  the store declares `mcp`.
- `context-retrieval`: *Content matching is a direct agent leg, not a CLI command* gains a bounded exception. The
  remote surface may do literal matching for a client with no file access, ranking nothing and honouring
  exclusions. No CLI command is added.
- `context-ingest`: *The capture tier is retained and excluded from retrieval* gains one exception: `find`'s
  separate list of unfiled captures, which is the search the capture skill already tells a local agent to run.
  Captures still take no catalog entry, no graph node and no place in the pass.

## Impact

- **New and changed code:**
  - a new `src/core/mcp/` module (transport, OAuth, tools, read checkout), wired into `src/commands/serve.ts`;
  - the method gate in `serve` and its configuration-following state;
  - the `mcp` block added to `src/config/schema.ts` as optional, with no shipped default;
  - `createPull` added to `src/core/forge/github.ts`.
- **Removed from the earlier checkpoint build on this branch:** `ctxr mcp serve`, `ctxr mcp member`, the MCP state
  directory and access codes. None of these was ever released.
- No new dependencies and no new outbound call kinds. The forge and the identity key set are reached as `serve`
  already reaches them.
- New `templates/mcp/` prose, and a README section covering the `mcp` block, the access-proxy paths to exempt, and
  adding the connector in Claude and ChatGPT.
