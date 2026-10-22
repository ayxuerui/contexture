## Context

See proposal.md, Why. The constraints that shape the approach, as of 0.27.0:

- **The retrieval pass leaves two acts to the agent.** Content matching is the agent's own grep (`context-retrieval`,
  *Content matching is a direct agent leg*), and reading bodies is the agent's own Read (*Results carry identities
  and evidence, never bodies*). A remote chat client can do neither.
- **`ctxr serve` is no longer read-only.** When a store declares `change_approval`:
  - It verifies the access proxy's signed assertion on every `/approve/` request
    (`core/approval/identity.ts`), and admits configured deciders only.
  - It records decisions as the store's recording identity, usually a GitHub App whose key only `serve` holds,
    through `core/forge/`.
  - It runs `ctxr land --pending` after an Approve and on a five-minute sweep.
  - It follows changes to `contexture.yaml` without a restart (`browse/serving-state.ts`).
- **In the shared deployment (contexture-images' hermes compose), `serve` and `agents` mount one store volume.**
  The agents work in session worktrees of it, and `land` fast-forwards its canonical checkout. The App key reaches
  `serve` and never `agents`, so that an agent cannot approve its own change.
- **The approval index lists every session worktree whose branch has an open pull request.** Anything that becomes
  a session worktree with a pull request is reviewable there without further work.
- **The capture tier is provenance, not notes.** `raw/` is excluded from retrieval, and the capture skill already
  tells a local agent to search it by content before writing, so the same source is not captured twice.
- **A store has a single owner and no access axis on notes** (retire-the-access-axes). Any future access model is
  expected to be roles people hold.

## Goals / Non-Goals

**Goals:**
- A member using a native Claude or ChatGPT app can find, read and capture with no shell, no clone, no GitHub
  account and no code to type. Their existing access-proxy login is the whole sign-in.
- Every computation on the server is deterministic, and every judgement happens in the client's model.
- A capture reaches the default branch only by the reviewed path the store already uses: a session pull request a
  decider approves, landed by `serve`.
- No new dependency, no new kind of outbound call, and no MCP state outside `contexture.yaml` and the derived cache.

**Non-Goals:** see proposal.md, Non-goals. One design-level boundary is added here: one `serve` serves one store, so
one MCP surface serves one store.

## Decisions

### D1. Three LLM-free tools, not a remote workbench and not a wrapped harness

Three surfaces were considered:

1. **Mirrored file and shell tools in a sandbox.** Models are trained on these shapes, and every skill would run
   unchanged.
2. **High-level verbs computed deterministically.**
3. **Wrapping a full harness**, so the client model talks to an agent on the server.

**The case for (1):** no tool to design, and skill fidelity is complete. It loses on its audience and on
operations. People who are not engineers do not edit by string replacement, chat clients run short tool loops
reliably and long ones poorly, and a sandbox per session is heavy to run.

**The case for (3):** total capability from a phone. It loses on the conversation itself. Two agents relaying to
each other lose information, the inner agent cannot be steered, every action pays for two models, calls run for
minutes and hit client timeouts, and the server must hold model keys.

**Chose (2).** `find`, `gather` and `capture` reduce to things contexture already computes: content matching, the
retrieval pass, and an inbox write onto a session branch.

**What would flip it:** evidence from the checkpoint that engineers want the store from chat apps, or that client
models cannot drive selectors well. Either reopens (1) as a separate change.

### D2. A hand-rolled MCP subset on `node:http`, not the SDK

The server implements:
- JSON-RPC 2.0 over Streamable HTTP, at `POST /mcp`, answering with plain JSON and no SSE;
- the methods `initialize`, `ping`, `tools/list` and `tools/call`;
- `202` for any notification, and `-32601` for any other method;
- `405` for `GET` and `DELETE` on `/mcp`.

It is stateless: no `Mcp-Session-Id`. `initialize` echoes the client's version when it is one of `2025-11-25`,
`2025-06-18` or `2025-03-26`, and otherwise answers with the newest.

**The case for the SDK:** it is what the vendors' clients are tested against, and protocol drift becomes someone
else's problem. It loses on footprint. The subset is about 150 lines, while the SDK brings a web framework into a
package that keeps its dependencies few.

**What would flip it:** the server needing streaming, resumability, sampling or elicitation, or the checkpoint
(tasks group 5) failing against a real client for a reason in the transport.

### D3. The MCP surface is part of `ctxr serve`, not a separate process or container

**The case for a separate `mcp` service** from the same image, with its own clone and a narrower forge credential:
- A smaller blast radius. The MCP routes are the only routes the access proxy does not front (D10), so a bug in
  them would sit in the one process that holds the App key.
- MCP could run while approval is off.

**It loses because everything it needs, `serve` already has:**
- the verifier for the access proxy's identity assertion;
- the forge credential that opens and lands pull requests;
- the approval page every capture must pass through;
- the configuration-following state;
- the hostname, with `serve.base_url` already pointing note links at it.

A separate service would duplicate the clone, the credential, the identity verification and a sync loop, and its
captures would still have to reach `serve`'s approval index.

**The blast-radius concern is answered by confining where the credential is used, not by pretending it is
absent.** MCP code does use the App's credential, in exactly three places:
- the OAuth module derives its signing key from the App key (D5);
- the view's sync fetches the default branch with the installation git token (D6);
- `capture` pushes its own session branch with that token and opens its pull request through `ForgeClient` (D9).

Nothing else in the MCP surface touches the credential. No tool returns or logs a token, and no route accepts one
from a client. The read checkout is separate from the one `land` writes (D6). This boundary, rather than "MCP never
sees the key", is what a reviewer should hold the code to. It is the same boundary the approval routes already
have.

**The agents container is excluded outright.** It holds model keys and a shell, and the App key must never reach it.

**What would flip it:** members outside the access proxy's organisation, or a need for MCP while
`change_approval` is off. Either brings back a separate service with its own sign-in.

### D4. Sign-in through the access proxy's identity, and members listed in `contexture.yaml`

`serve` is the OAuth 2.1 authorisation server for its own `/mcp`. It publishes the protected-resource metadata
(RFC 9728) and the authorisation-server metadata (RFC 8414), and accepts dynamic client registration (RFC 7591)
for public clients. `/authorize` requires PKCE S256, a `redirect_uri` exactly as the client registered it, and a
`resource` equal to its own `/mcp`.

`/authorize` is the one OAuth path left behind the access proxy. On every `GET` and `POST` it verifies
`change_approval.identity` exactly as the approval routes do, then resolves the verified email against the `mcp`
block:

```yaml
mcp:
  readers: ["@ctx-a.example"]      # find, gather
  capturers: ["a@ctx-a.example"]   # capture
```

Entries take the same form as `change_approval.deciders`: an exact email, or `@domain`. A person on neither list
gets `403`. A person on either list sees a consent page naming:
- the client, as it registered itself;
- the redirect host;
- the store;
- their email;
- the scopes they will grant.

A `POST` from that page carries an `Origin` equal to the origin of `serve.base_url`, and only then is a code
issued. The consent step is required, not decoration. Without it, anyone could register a client whose redirect
they control and send a member a link, and the member's existing proxy session would silently authorise that
client.

**The case for the access codes of the earlier design:**
- They need no access proxy and no identity provider.
- They work for people outside the proxy's organisation.
- Revoking one person is a single command.

They lose here because the store already depends on the proxy for the approval page. Codes would give each member
a second credential to keep and the operator a second member list to maintain, apart from `deciders`, with a
throttle to defend it.

**The case for validating the identity provider's own tokens at `/mcp`:** no authorisation server at all. It fails
on the clients. Claude's and ChatGPT's servers call `/mcp` directly and cannot present a proxy assertion, and most
identity providers do not offer the dynamic registration these clients expect.

**What would flip it:** members outside the proxy's organisation (see D3), which reopens access codes for a
separate service.

`mcp` requires `change_approval`, because it reuses its identity settings and forge credential. Configuration
validation rejects an `mcp` block without one, naming both, just as `change_approval` requires `serve.base_url`.
The block carries no shipped default, and adding it needs no `context-store` delta: its absence is itself
meaningful.

### D5. Nothing issued is stored, and membership is re-read on every call

Client IDs, authorisation codes and access tokens are HMAC-signed payloads (`kind.payload.mac`, with the kind
inside the MAC), so no store of them exists:

| Issued item | What it encodes | Lifetime |
|---|---|---|
| Client ID | the registered redirect URIs | indefinite |
| Authorisation code | client, redirect, PKCE challenge, email, scopes, nonce | ten minutes, single use |
| Access token | email, scopes, resource | 30 days |

There is no refresh grant.

**Single use without durable state.** A code's nonce is recorded in memory when it is redeemed, before any await.
Codes are also signed under a key that mixes in a per-process nonce, so a restart invalidates outstanding codes
rather than forgetting which were spent.

**The signing key** is derived with HKDF-SHA256 from the App's private key when the forge credential is an App, so
it is stable across restarts, needs no new secret, and rotates with the App key. With `gh`'s own credential there
is no key to derive from, so a per-process random key is used, and `serve` says once on stderr that members will
sign in again after each restart.

**Revocation is a configuration edit.** Every `/mcp` request resolves the token's email against the `mcp` block
`serve` last loaded, and narrows the token's scopes to what that email holds now. Removing someone from `readers`
and `capturers` refuses their next call, even while their token is unexpired.

### D6. Reads come from a detached worktree the MCP surface owns

The canonical checkout is shared:
- The agents work beside it.
- `land` rebases inside it and fast-forwards it.
- Its working tree may legitimately be mid-change.

Fast-forwarding it, or resetting it after a failure, from a request handler would race all of that. So the MCP
surface keeps its own view: a detached worktree of the same repository, at `<derived cache path>/mcp/view`. That
location is gitignored, excluded from notes, and on the volume `serve` can already write. Being detached, it is
never mistaken for a session worktree.

Before a tool call, and at most once per interval (60 seconds), a sync does three things:
1. Fetches the default branch from `origin`, through the forge credential's git token as `land` does.
2. Moves the view with `git checkout --detach --force <origin/default>`.
3. Rebuilds the view's own graph under the view's derived path, when `HEAD` moved or the graph is missing.
4. Reads the forge's open pull requests once, so that "pending" below means exactly what the approval index means
   by it: a session branch with an open pull request.

A linked worktree shares refs with the repository, so step 1 updates `refs/remotes/origin/<default>`, the same
ref `land` reads. Updating it is harmless, because a fetch only ever moves it to the remote's truth. It can
transiently contend with a concurrent `land` fetch for the ref lock; the sync reports that as `sync_error` and
retries at the next interval. What the view never changes is the started checkout's `HEAD`, index or working tree.

If the rebuild fails, the view is checked out back to the commit it served and that commit's graph is rebuilt. If
even that fails, tools refuse with `mcp.store_unavailable` until a sync succeeds.

**Every tool call reads one commit.** A reader-writer lock guards the view. Each tool call holds a shared lock for
all of its reads, and a sync holds the exclusive lock, so a sync waits for calls in flight and a call waits for a
sync. Each result carries `store: {head, sync_error}`, with no wall-clock value.

The store configuration a tool reads with is the view's own `contexture.yaml` at that commit, so the files and the
rules that admit them are always from the same commit. The `mcp` block that decides who may call is the one
`serve` loaded, because admission is the server's concern and not the commit's.

### D7. `find` stands in for grep, literal and path-ordered, and lists unfiled captures separately

**Matching:**
- `find(text)` matches lower-cased substrings, line by line, over the raw files of the notes the view's note
  enumeration admits.
- There is no stemming, no fuzziness and no score.
- Hits come in path order, capped at `max` (default 25), with the omitted count reported.

Each hit carries:
- its path;
- its catalog gloss;
- up to three matching lines, each clipped to 240 characters;
- a link, built from `serve.base_url` and the note route.

**Unfiled captures come back in `unfiled`, never in `notes`, each without a link.** That covers inbox files on the
view's commit, and inbox files added by the branch of any session worktree with an open pull request,
marked `pending_merge` with their branch. Captures made through this surface, and captures an agent made in its
own session, are both session worktrees of the shared repository, so no extra fetch is needed to see them. A pending capture waiting for approval is exactly the duplicate this
field exists to reveal. Without text, `find` returns the catalog's sections with each note's path and gloss.

**The case for keeping captures out entirely:** unfiled text could be quoted as the store's position, and captures
are where untrusted outside material first lands. It loses to two problems that otherwise stay unsolved for this
audience. Two members capturing the same meeting is the commonest failure in a group. And "nothing found" for
something captured yesterday reads as a broken tool. The defences that matter remain: captures stay out of
`notes`, out of `gather`, the catalog and the graph. The separate field and its label are what the client model is
told to respect.

### D8. `gather` is the pass, plus the bodies a client would otherwise read

`gather` takes the pass's own selectors and options, runs it against the view's notes and the view's graph, and
attaches `body` to a prefix of the pass's order until the next body would exceed the byte budget (60,000). When the
first note alone exceeds the budget, it is clipped and marked. A seed under the capture root is refused with
`mcp.capture_not_filed`. The pass itself is untouched, and still never returns bodies.

### D9. A capture is a session pull request a decider approves

`capture` takes these steps, all under one mutex:
1. Refreshes the view (a sync, forced).
2. Runs the source check against the identity records at the view's commit, plus the inbox files of pending
   session branches, and refuses any verdict but `new`, naming the matches.
3. Refuses a body that fails the store's required-section rule for its source type.
4. Starts a session worktree in the canonical repository, exactly as `ctxr session start` does, with label
   `capture-<slug>`.
5. Writes `<inbox_path><YYYY-MM-DD>-<slug>-<6 hex>.md`, with frontmatter carrying the title, `source_type` and
   `source_id`.
6. Commits it with the member's verified email as author and the server's identity as committer, plus a
   `Captured-by: <email>` trailer.
7. Pushes the branch through the forge credential's git token.
8. Opens a pull request titled `Capture: <title>` whose body names the member, the source and the file.

It returns the pull request's number and URL, and the approval page address for the worktree.

**A capture is idempotent by source identity, so a failure partway through resumes rather than strands.** With no
`source_id` given, the identity is derived from the content (`<source_type>/<first 16 hex of the body's
canonical hash>`), so a client retrying the same material reaches the same identity. Before step 4, `capture`
looks for a capture worktree already carrying that identity:
- **Its branch has an open pull request:** the call is refused as a duplicate, naming that pull request.
- **It has no pull request:** a push or the pull-request call failed last time, or its response was lost. The call
  resumes: it pushes the branch if the remote lacks it, then looks for an open pull request with that head before
  opening one, and returns it.

**Capture worktrees are reclaimed.** `land` already removes a worktree when its pull request merges. Under the
mutex, `capture` also removes the worktree and local branch of any `capture-` session whose pull request was
closed without merging. A rejected capture therefore stops counting as pending, and the same material can be
captured again. The change then
appears on the approval index like any session, and lands through `ctxr land` when a decider approves it. The
member, if they are a decider, can approve it themselves from their phone.

**The case for the earlier design**, where `serve` pushed a bare branch and the store's CI auto-merged anything
matching a mechanical inbox-only rule: captures arrive without anyone acting, which suits a group that captures
far more than it reviews. It loses for now:
- It needed a forge-specific workflow, a credential that cannot change workflows, and a check command. All of that
  duplicates the reviewed path `serve` now runs itself.
- Its premise, that core has no forge client, no longer holds.

**What would flip it:** a group whose approval queue fills with captures. That case is better served by an
inbox-only auto-landing rule inside `land`, where the mechanical check runs on the trusted side. It is a separate
change, recorded here so it is not rebuilt as CI.

### D10. Routes, methods and the access-proxy boundary

When the loaded configuration declares `mcp`:

| Paths | Methods admitted | In front of them |
|---|---|---|
| `/mcp` | `POST` | not the proxy: the server's own bearer check |
| `/token`, `/register` | `POST`, plus `OPTIONS` for CORS | not the proxy |
| `/.well-known/oauth-protected-resource[/mcp]`, `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration` | `GET` | not the proxy |
| `/authorize` | `GET`, `POST` | the proxy, plus the server's own check of its assertion |

This extends `context-browsing`'s method gate. Without the block, all of these answer `404`, and anything but
`GET` or `HEAD` still answers `405`.

The README names the exact paths to exempt from the proxy. The server cannot tell whether the operator did so. It
fails safe either way: an un-exempted `/mcp` is just unreachable to clients, and an exempted `/authorize` still
demands a verified assertion.

A request to `/mcp` with an `Origin` that is present and not the origin of `serve.base_url` gets `403`.

MCP's state follows configuration reloads exactly as the approval surface does. A loaded change that adds, alters
or removes `mcp` rebuilds or removes the surface with no restart. A surface that cannot be built, for example
because `change_approval` was removed, makes every MCP path answer `503` while every other route keeps answering.

### D11. Prose and logging

These live in `templates/mcp/`, with `__UPPER_SNAKE__` placeholders:
- the server's instructions to the client;
- the three tool descriptions;
- the consent page.

The tool descriptions carry the capture skill's rules in short form:
- keep the source's own words;
- one item per capture;
- `source_type` spelled as the store already spells it;
- describe unfiled material as unfiled.

Each MCP request writes one line to `serve`'s stderr: the member's email, the method, and for a tool call, the tool
name. Arguments and results are never logged, since they are store content.

## Risks / Trade-offs

- **[The access proxy is misconfigured]** → If `/mcp` is still behind the proxy, clients cannot connect, which is
  loud and fails safe. If `/authorize` is exempted, the server's own assertion check refuses every request: also
  safe and loud. The README gives the exact path list.
- **[A stolen access token works until it expires or the member is removed]** → It lasts 30 days, it never widens
  past the member's current scopes, and removing the member is a configuration edit that takes effect on the next
  call. There is no per-device revocation. Rotating the App key, or restarting a `serve` without an App, signs
  everyone out.
- **[MCP routes in the process that holds the App key]** → No MCP route touches the key or a token directly. All
  forge use goes through `ForgeClient`, and `capture` only pushes its own branch and opens its pull request (D3).
- **[The approval queue fills with captures]** → Captures are labelled so they are easy to tell apart from session
  changes on the index. An inbox-only auto-landing rule is the recorded follow-up (D9).
- **[Prompt injection carried in by captured material]** → Captures never enter `gather` and are labelled unfiled
  in `find`. Every capture is read by a decider before it lands.
- **[Vendor client quirks]** (protocol version, OAuth details, write actions still in beta on ChatGPT) → Tasks
  group 5 is a checkpoint with `find` and a stub `capture`, before `gather` and the write path are built.
- **[`find` scans the whole view on every call]** → Notes are listed once per view commit. A linear scan is fine
  into the tens of thousands of notes.
- **[The view worktree is deleted]** (someone clears the derived cache) → The next sync recreates it.

## Migration Plan

The change is additive and opt-in. Nothing changes for a store without an `mcp` block. To turn it on:
1. Declare `mcp`, with `change_approval` already in place.
2. Exempt the listed paths from the access proxy.
3. Add the connector in each app.

To roll back, remove the block. The view is derived and can be deleted. Open capture pull requests remain ordinary
session pull requests.

## Revisions after critique

This change was first written on 0.21.0 as a standalone `ctxr mcp serve`, with its own access codes and a branch
gated by store CI. Four three-model critique rounds shaped that version, and their findings carry into this one:

1. **The gate must hold even if the server is wrong** (round 3's veto). Here, a decider's approval and `land` are
   the gate. The server only opens a pull request.
2. **Pending captures must be visible to the duplicate check and to `find`** (round 3). See D7 and D9.
3. **Every tool call reads one commit, and a failed sync restores the view and its graph together** (rounds 3 and
   4). See D6.
4. **Nothing issued is stored, and codes are single use** (rounds 3 and 4). See D5.
5. **A real-client checkpoint comes before the write path, and it exercises a write tool** (rounds 3 and 4). See
   tasks group 5.
6. **Captures are serialised from the duplicate check to the push** (round 4). See D9.

A fifth round critiqued this revision. The pragmatist approved, and there was no veto. Folded in:

7. **"Pending" means an open pull request everywhere,** matching the approval index, and capture worktrees of
   closed pull requests are reclaimed (architect). See D6, D7 and D9.
8. **D3 states where the App credential is actually used** instead of claiming MCP never sees it (architect).
9. **The read-checkout requirement promises what a linked worktree can keep:** the started checkout's `HEAD`,
   index and working tree, not its shared remote-tracking refs (architect). See D6.
10. **A capture that fails partway resumes,** keyed by its source identity, which is derived from the content when
    none is given (skeptic). See D9.

Rebasing onto 0.27.0 removed that version's premises: core now has a forge client, `serve` verifies the access
proxy's identity, and `serve` lands what is approved. So the surface moved into `serve` (D3), sign-in moved to the
proxy's identity (D4), and captures moved to the approval page (D9). The access codes, the member CLI, the throttle
and `check-branch` are gone.

## Checkpoint results (tasks group 5)

Run on 2026-10-22 against pkm, with a test `serve` (`pkm-mcp-test`, `land: manual`) on its own clone behind
`brain-mcp.ruixue.ai`. The access proxy covered only `/authorize`.

- **claude.ai: passed.** Registration, the access-proxy login, the consent page and the token exchange all
  succeeded. Then `initialize`, `tools/list`, two `find` calls that returned real notes, and a `capture` call to the
  stub, which Claude reported truthfully as not saved. Claude also calls `server/discover` first, which is answered
  method-not-found, and asks to register for `refresh_token`, which is granted `authorization_code` only. Neither
  blocked anything. D2 and D4 stand.
- **Gemini: sign-in passed, tools never called.** Gemini registered (`auth=none`), consented and obtained a token,
  then listed the tools on every message but called none. After its tool schemas were reduced to `type`,
  `description` and `required`, it stopped contacting the server at all. This is recorded as an open question about
  Gemini's handling of custom MCP apps, not a defect in the surface. Claude, against the same server, calls both
  tools.
- **ChatGPT developer mode:** not yet run.

Three defects the unit tests could not see were found and fixed at the checkpoint:
1. Under `Referrer-Policy: no-referrer`, a browser submits the consent form with `Origin: null`, which the
   confirmation refused. The page now uses `same-origin`.
2. Tool input schemas are now plain, with every limit enforced in code.
3. Each OAuth request is now logged with its outcome and what the client registered for.
