## Context

See proposal.md, Why. The constraints that shape the approach:

- **The retrieval pass leaves two acts to the agent.** Content matching is the agent's own grep (`context-retrieval`,
  *Content matching is a direct agent leg*), and reading bodies is the agent's own Read (*Results carry identities
  and evidence, never bodies*). A remote chat client can do neither.
- **contexture is offline by construction.** `src/core/registry.ts` is the one outbound HTTP call. Every git
  operation goes through the `GitRunner` port. `ctxr` has never pushed.
- **The write-path guarantee contexture may assert is "nothing reaches the default branch ungated."** The CLI
  writes onto a branch, and the forge decides what merges. The forge adapter kind was retired, so no forge API
  lives in core.
- **The capture tier is provenance, not notes.** `raw/` is seeded into `retrieval.exclude_paths`, and `listCaptures`
  exists beside `listNotes` precisely so retrieval never sees a capture. The `ctxr-capture` skill nonetheless tells
  a local agent to search the capture root by content before writing, so it does not capture the same source twice.
- **The store is owned by one operator** and has no access axis. retire-the-access-axes removed the visibility and
  disclosure labels on notes, and the project context expects any future access model to be roles held by people
  (owner, editor, viewer), not labels on notes.
- **The dependency footprint is five packages.** `ctxr serve` is built on `node:http` alone.

## Goals / Non-Goals

**Goals:**
- A member using a native Claude or ChatGPT app can find, read and capture with no shell, no clone and no
  GitHub account.
- The server computes only deterministic things. Every judgement call happens in the client's model.
- Merging a capture is gated by a check that runs in the store's CI, independent of the server.
- No new dependency, and no new outbound HTTP call.

**Non-Goals:** see proposal.md, Non-goals. One design-level boundary is added here. The server serves one store
from one checkout. Serving several stores means running several processes.

## Decisions

### D1. Three LLM-free tools, not a remote workbench and not a wrapped harness

Three surfaces were considered:

1. **Mirrored file and shell tools in a sandbox** (`bash`, the text-editor schema, `apply_patch`). Models are trained
   on these shapes, and every shipped skill would run unchanged.
2. **High-level verbs computed deterministically.**
3. **Wrapping Claude Code**, so the client model converses with an agent on the server.

**The case for (1)** is the strongest of the alternatives: no tool has to be designed, skill fidelity is complete,
and the most capable model does all the work. It loses on its audience and on operations. People who are not
engineers do not edit by string replacement. Short tool loops are what chat clients handle reliably. And containers
per session on a publicly reachable host are the heaviest thing a team could be asked to run. All three
second-opinion critics independently cut it from v1.

**The case for (3)** is total capability from a phone. It loses on the conversation itself. Two agents relaying to
each other lose information, the inner agent cannot be steered, every action pays for two models, calls run for
minutes and hit client timeouts, and the server must hold model keys.

**Chose (2):**
- `find`, `gather` and `capture` reduce to commands contexture already computes: content matching, the retrieval
  pass, and an inbox write.
- Synthesis, deciding what is worth capturing and placement remain judgements made by the client model, or later
  by ingest.

**What would flip it:** evidence from the prototype that engineers want the store from chat apps, or that client
models cannot drive selectors well enough. Either reopens (1) as a separate image that can be deployed on its own.

### D2. A hand-rolled MCP subset on `node:http`, not the SDK

The server implements:
- JSON-RPC 2.0 over the Streamable HTTP transport, at `POST /mcp`, with an `application/json` response and no SSE
  stream;
- the methods `initialize`, `ping`, `tools/list` and `tools/call`;
- an answer of 202 to any notification;
- `-32601` for any other method;
- `GET` and `DELETE` on `/mcp` answering 405, which the transport permits for a server that offers no stream.

It is stateless and issues no `Mcp-Session-Id`. `initialize` echoes the client's `protocolVersion` when it is one of
`2025-11-25`, `2025-06-18` or `2025-03-26`, and otherwise answers with the newest of those.

**The case for the official SDK:** protocol drift becomes someone else's job, and its auth router covers the OAuth
endpoints. It loses on footprint. It brings an HTTP framework and a schema stack for a surface of four methods. Both
the repository's own ethos and `ctxr serve` choose `node:http`. And the auth router's provider interface would
still need every decision in D3 to be written by hand.

**What would flip it:** the server needing streaming, resumability, sampling or elicitation. A protocol revision
that breaks the hand-rolled subset would flip it too. So would **the prototype checkpoint (tasks group 4)
failing against a real claude.ai or ChatGPT connector for a reason in the transport**. The SDK is what those clients
are tested against, which is the strongest argument for it, so the checkpoint is where that argument gets tested
rather than assumed. The second-opinion pragmatist argued for the SDK outright. It was overruled on footprint (the
subset is about 150 lines; the SDK brings a web framework), with this flip condition recorded in its place.

### D3. The server is its own OAuth 2.1 authorisation server, with operator-issued access codes

The Claude and ChatGPT connector UIs speak OAuth. Neither lets a member paste a bearer token. So the server serves:
- the protected-resource metadata (RFC 9728);
- the authorisation-server metadata (RFC 8414);
- open dynamic client registration (RFC 7591), for public clients only;
- `/authorize` with PKCE S256 required, the `resource` parameter checked against the server's own resource URL, and
  a `redirect_uri` that must exactly match one the client registered;
- `/token`, granting `authorization_code` only.

The authorisation page asks for one thing: the member's access code.

Alternatives, each argued at its strongest:

- **External IdP, validating its JWTs** (Okta, Entra, Auth0, Google through a broker). This gives real SSO, MFA, and
  offboarding that happens in one place. For a large organisation it is the better system. It loses here for three
  reasons. Fetching the IdP's JWKS is a new outbound call. Most IdPs do not support the dynamic registration MCP
  clients expect, so a broker is needed anyway. And it makes every adopter run an IdP before reading one note.
  **Flips when** an adopter brings an IdP and a member count past what anyone wants to manage as codes. It would
  arrive as an alternative `--auth` mode, not a replacement.
- **GitHub OAuth, committing as the user.** The audit trail is free, and access is whatever the repository already
  grants. It loses on the audience. The members this change exists for mostly have no GitHub account, and those who
  do should not need write access to the repository just to capture.
- **A static bearer token.** Simplest of all, and unusable from the native apps.

Codes look like `XXXX-XXXX-XXXX-XXXX-XXXX` in Crockford base32, which is 100 bits. Only their SHA-256 is stored.
Five failed codes from one address in fifteen minutes block that address for the rest of the window.

**What "address" means is defined, not assumed.** It is the socket's peer address, unless `--trust-proxy` is given.
In that case, and only when the peer is loopback, it is the rightmost entry of `X-Forwarded-For`. Behind the recommended
Funnel or reverse proxy every peer is the proxy, so without the flag the throttle covers the whole server. Five wrong
codes from anyone would then pause sign-in for everyone for the rest of the window. That fails closed and is
recoverable, and the README tells operators behind a proxy to set the flag. Trusting the header without the flag would
let any caller pick their own address. The architect critic of round four raised this.

**Nothing the server issues is stored.** Client IDs, authorisation codes and access tokens are all signed by the
server (HMAC-SHA256 under a key kept in the state directory), so they need no store:

| Issued item | What it encodes | Lifetime | Extra checks |
|---|---|---|---|
| Client ID | the registered redirect URIs | survives restarts with no registry | none |
| Authorisation code | client, redirect URI, PKCE challenge, resource, member, scopes, a nonce | ten minutes | single use (below) |
| Access token | member ID, scopes, resource | 30 days | member and scopes re-checked against `members.json` on every call |

There is no refresh grant. When a token expires, the member enters their code again.

**Codes are single use without being stored durably.** A signature alone would let one code be redeemed again and
again with the same PKCE verifier until it expired. OAuth 2.1 forbids that, as the skeptic critic of round four
pointed out. So each code also carries a random nonce, which the server records in memory, under the same lock as the
redemption, the moment the code is redeemed. Codes are also signed under a key derived from the signing key plus a
per-process nonce, so a restart invalidates every outstanding code instead of forgetting which were spent. The cost
is that a member caught by a restart in their ten-minute window simply signs in again.

Members carry a random ID, so removing and re-adding someone under the same name revokes everything issued before.

**The case for stored, rotating refresh tokens** (the first version of this design): short-lived access tokens, reuse
detection when a refresh token is stolen, and revoking one device without the others. It loses because the thing
actually revoked here is a member, not a device. Membership is already checked on every call, so the store of tokens
bought only per-device revocation, at the cost of a second state file and a rotation state machine. The
second-opinion pragmatist proposed dropping it. The case for keeping it would be stores whose members routinely
lose devices; for them, removing and re-adding the member is the remedy.

### D4. Scopes are admission to the server, not an access axis on the store

There are two scopes. `read` grants `find` and `gather`; `capture` grants `capture`. The operator assigns them per
member. A client can only narrow them through the `scope` parameter, never widen them. `tools/list` shows only the
tools a token's scopes reach, and `tools/call` re-checks scope and membership on every call. A removed member is
therefore refused on their very next call, even while holding a token that has not yet expired.

Every admitted member reads the whole store, so nothing about this reintroduces a classification on notes, and
retire-the-access-axes D1 stands. The project context's expected future model (owner, editor, viewer) is a set of
roles people hold. `read` and `capture` are named for what the tool does at the point of use, which is the stronger
argument for a token a member's client displays. If roles arrive later, they map onto these scopes.

### D5. The capture write path ends at a pushed branch, and the store's CI is the gate

`capture` takes these steps:
1. Fetches the default branch and every `capture/*` branch.
2. Runs the source check against the identity records on the default branch **and** against the captures waiting on
   other `capture/*` branches. A capture still waiting to merge is the likeliest duplicate of all, so the check has
   to see it.
3. Adds a worktree under the state directory, outside the store, on a new branch: `capture/<YYYY-MM-DD>-<slug>-<id>`,
   where `<id>` is six random hex characters.
4. Writes `<inbox_path><YYYY-MM-DD>-<slug>-<id>.md`. The file carries the branch's own ID, so two captures can never
   race for one name and no retry step exists. The first version picked a `-2` suffix on collision and claimed a
   retry nobody performed; the architect critic caught that.
5. Commits with the host's own git identity, the bot, and a `Captured-by:` trailer naming the member.
6. Pushes that branch and removes the worktree.

Steps 1 through 6 run under a **capture mutex**. Otherwise two simultaneous captures of one source could both fetch,
both pass the duplicate check and both push. The second capture fetches again after acquiring the mutex, so it sees
the first one's branch. The skeptic critic of round four raised this.

**"Pending" means a `capture/*` ref whose tip is not an ancestor of the default branch.** It does not mean "a path
absent from the default branch", which a deleted or rejected branch would satisfy forever. The sample workflow
deletes a `capture/` branch when its pull request closes, whether merged or rejected, and when the gate fails. A
rejected capture therefore stops blocking a later capture of the same source as soon as its branch is gone. The
architect critic of round four raised this.

The store's hooks run as they do for any commit. The member is recorded in git and not in frontmatter, so this
change adds no frontmatter key.

`ctxr mcp check-branch --base <ref>` is the gate. It passes only when every change in `<ref>...HEAD` adds a new
`.md` file directly under the inbox path, and each added file has frontmatter carrying `source_type` and
`source_id`, carries no `source_hash` or `ingested`, and meets the store's required-section rule for its source
type.

**It reads `contexture.yaml` from `<ref>`, never from the branch it judges.** Otherwise a branch could redefine the
inbox path, and so the meaning of "only adds inbox files", in the same commit it is being judged on. Any change
outside the inbox fails, and that includes CI configuration and `contexture.yaml` itself.

The README's sample workflow runs the check on pushes to `capture/**`, then opens a pull request and merges exactly
the commit it checked (`gh pr merge --match-head-commit`). Whether merging is automatic or waits for a human is the
store's own choice.

**The gate holds only if the branch cannot rewrite the workflow that runs it.** That was the veto of the third
critique round, which the architect reached independently. On GitHub, a workflow triggered by a push runs the
definition on the pushed branch, so a credential able to push `capture/**` could otherwise push a workflow that skips
the check. GitHub refuses any push that modifies `.github/workflows/` from a credential without the workflows
permission. **The bot's credential is issued without it**, so every workflow on a `capture/` branch is the default
branch's own.

This is a forge property, not something contexture can check from inside the server. The README states it as a
precondition of the sample, and `check-branch` failing on any path outside the inbox is the second wall. A forge
without an equivalent permission needs the gate triggered from a definition on its default branch instead; the README
says so too.

**The case for having the server open and merge the PR itself** through the forge API: one moving part fewer, and a
store with no CI still works. It loses because it puts a forge API and a forge credential in core, against the
retired forge adapter and the single outbound call. And the gate would then be the server checking itself, which the
second-opinion skeptic rejected by veto: a gate has to hold even if the server is wrong or compromised. With this
design the bot's credential needs only push rights on `capture/**`, and branch protection does the rest.

**Re-arguing "every write lands via a reviewed PR"** (project context). That guarantee was written for agents with
broad write access. The guarantee this change keeps is the one the context calls the only assertable one: nothing
reaches the default branch ungated. A store that wants human review of every capture leaves auto-merge off in its
workflow.

### D6. `find` stands in for grep: literal, path-ordered, and it reports unfiled captures separately

- **Matching:** `find(text)` lower-cases the text and each line, and matches on substrings, over the notes the
  store's enumeration admits (`listNotes`). There is no stemming, no fuzziness and no scoring.
- **Each hit carries** the path, the catalog gloss, up to three matching lines with line numbers (each clipped to
  240 characters), and a link. The link is `serve.base_url` joined to the note's route, or null when the store
  declares no base URL.
- **Order and budget:** results come in path order, capped at `max` (default 25, at most 100), with the omitted count
  reported.
- **Unfiled captures:** captures under the capture root are matched the same way and returned in `unfiled`, never in
  `notes`, each without a link. So are inbox files waiting on unmerged `capture/*` branches, read from the fetched
  refs and never checked out. Each unfiled entry says which: `filed: false` with `pending_merge: false` for a capture
  on the default branch, or `pending_merge: true` with its branch for one still waiting. Without the pending ones, the
  duplicate this field exists to prevent stays invisible exactly while it is most likely, and for longest in a store
  that reviews merges by hand.
- **With no text,** `find` returns the catalog's sections and the glosses for each section's notes, narrowed by an
  optional `under`, as the map the client picks selectors from.

**The case for keeping captures out entirely** (the capture-tier requirement as written): unfiled text quoted as if
it were the store's position, and captures being where untrusted outside material first lands. It loses to two
problems that otherwise go unsolved for this audience:
- The commonest failure in a group is two members capturing the same meeting.
- A member who captured something yesterday and is told today "nothing found" concludes the tool is broken.

The local capture skill already searches the capture root for exactly the first reason. The real defences remain:
captures stay out of `notes`, out of `gather`, out of the catalog and out of the graph. The separate field and its
label are what the client model is told to respect.

### D7. `gather` is the pass, plus the bodies a client would otherwise read

`gather` takes the pass's own selectors (`seeds`, `sections`, `under`, `entities`, `hops`, `direction`, `type`,
`max_notes`) and returns its result unchanged, plus a `body` on a prefix of that result. Bodies are attached in the
pass's order until the next one would exceed a byte budget (default 60,000, set by `--gather-max-bytes`). From that
point on, notes carry `body: null`.

When the first note alone exceeds the budget, it is returned clipped to the budget and marked `body_clipped`, so a
call never comes back with no text at all. Keeping bodies to a prefix preserves the pass's rule that the cap never
reorders anything.

A seed under the capture root is refused with `mcp.capture_not_filed` before the pass runs. Any other unknown seed
fails as the pass already fails. The pass itself is untouched and still never returns bodies. The remote surface
attaches them afterwards.

### D8. Keeping the checkout current

The server requires a checkout of the default branch whose worktree is clean, ignoring derived paths. Before any
tool call it runs, at most once per `--pull-interval` seconds (default 60; 0 never pulls):
1. `git fetch --prune origin <default> 'refs/heads/capture/*:refs/remotes/origin/capture/*'`
2. `git merge --ff-only origin/<default>`

Whenever `HEAD` moves, or the graph has not been built, it rebuilds the derived graph.

**Every tool call reads one commit.** A reader-writer lock guards the checkout: each tool call holds a shared lock
for all of its reads, and a sync holds the exclusive lock across the merge and the graph rebuild. So a sync waits
for calls already in flight, and a call arriving during a sync waits for it to finish. Serialising syncs alone, as
the first version did, would have let a sync land midway through a call that was still reading, mixing files from
one commit with the graph of another under a single `head`. The skeptic critic caught that.

`capture` holds the shared lock too. It reads identity records from the checkout, and it writes only in its own
worktree.

A failed sync leaves the checkout at its last good commit, **with the graph that belongs to it**. If the
fast-forward succeeds but the graph rebuild fails, the sync resets the checkout to the commit it started from and
rebuilds that commit's graph. If even that fails, the server refuses tool calls with `mcp.store_unavailable` until a
later sync succeeds, rather than serving a checkout from one commit with a graph from another. The skeptic critic of
round four raised this. Each tool result carries `store: {head, sync_error}`,
where `head` is the commit served and `sync_error` is the last failure or null. Neither is a wall-clock value, so the
pass's no-wall-clock rule holds.

### D9. State lives outside the store, and only the member CLI writes it

The state directory defaults to `~/.contexture/mcp/<first 12 hex of sha256(store root)>/`, is overridable with
`--state-dir`, and is refused when it falls inside the store root. It holds:
- `members.json`: written only by `ctxr mcp member`. The server re-reads it whenever the file's mtime changes.
- `signing.key`: 32 random bytes. It is created by whichever of `ctxr mcp member` or `ctxr mcp serve` runs first,
  using an exclusive create, so the two can never both write it.
- `worktrees/`: capture worktrees, removed after each push.

Files are mode 0600. `members.json` is written atomically by a write and rename. The server persists nothing (D3), so
the member CLI is the only writer and nothing races.

Deleting `signing.key` invalidates every issued client ID and token at once. That is the "sign everyone out" switch.

### D10. Exposure is explicit

- `--host` defaults to loopback, as `ctxr serve` does.
- `--public-url` names the HTTPS address clients reach, for example a Tailscale Funnel or a reverse proxy. It is the
  issuer and the base of the resource URL, and it is required whenever the bind is not loopback.
- `--no-auth` exists for local development and the MCP inspector, is refused on any bind that is not loopback, and
  admits one operator holding every scope.
- An `Origin` header that is present and does not match the public URL's origin, or loopback on a loopback bind, is
  refused with 403, which is the transport's defence against DNS rebinding.

### D11. Prose and envelope

The server's instructions, the three tool descriptions and the authorisation page live in `templates/mcp/`, and are
read at render time with `__UPPER_SNAKE__` placeholders. The tool descriptions carry the capture skill's rules in
short form:
- keep the source's own words;
- one item per capture;
- `source_type` spelled as the store already spells it;
- unfiled material described as unfiled.

`ctxr mcp serve` emits one envelope once it is listening and then keeps serving, exactly as `ctxr serve` does.
`member add` returns the code in `data` and in its human summary, the only time the code is ever shown.
`check-branch` reports one finding for each violation.

## Risks / Trade-offs

- **[A publicly reachable endpoint]** → Admission is deny by default, codes carry 100 bits, failed codes are
  rate-limited per address, and a member is removed in one command. `--no-auth` is refused off loopback.
- **[A stolen access token works until it expires or its member is removed]** → It lasts 30 days, it never widens
  past the member's scopes, and removing the member kills it on the next call. There is no per-device revocation (D3).
- **[A compromised server pushes a `capture/` branch built to pass or skip the gate]** → The bot credential has no
  workflows permission, `check-branch` reads its configuration from the base, any path outside the inbox fails, and
  the merge is pinned to the checked commit (D5).
- **[An access code phished through a fake authorisation page]** → The page is served only from the issuer, and the
  README tells members the one URL they will see. A code is revoked by removing and re-adding its member.
- **[Open dynamic registration]** → It stores nothing, because a client ID is a signed encoding of its redirect URIs,
  so registration spam cannot fill any file. A registered client still cannot obtain a code without a member's access
  code.
- **[Prompt injection carried in by captured material]** → Captures never enter `gather` and are labelled unfiled in
  `find`. The client model treats tool output as data. That is the client vendor's boundary, and this change does
  not claim it.
- **[Vendor client quirks]** (protocol version, OAuth details, write actions still in beta on ChatGPT) → Tasks
  group 4 is a checkpoint. Transport, authorisation and `find` are built first, and the operator connects real
  claude.ai and ChatGPT clients before `gather`, `capture` and the gate are built. A failure there reopens D2 or D3
  before anything depends on them.
- **[`find` scans the whole store on every call]** → The note list is cached per `HEAD`. A linear scan is acceptable
  into the tens of thousands of notes. Anything larger would need an index, which this change does not add.
- **[The host's git credential can push]** → The README tells operators to scope it to `capture/**` with branch
  protection on the default branch. contexture cannot enforce that from inside the server.

## Migration Plan

The change is additive. Nothing changes for a store that never runs `ctxr mcp serve`. To roll back, stop the process
and delete its state directory; pushed `capture/` branches remain ordinary branches.

## Revisions after critique

This section overrides anything inconsistent with it. It records the third second-opinion round, run on the full
change.

1. **The gate cannot be rewritten by the branch it judges** (the skeptic's veto, reached independently by the
   architect). The bot credential has no workflows permission, `check-branch` reads `contexture.yaml` from the base,
   and the merge is pinned to the checked commit. See D5.
2. **Pending `capture/*` branches are visible to the source check and to `find`'s `unfiled` field.** Filenames carry
   the branch ID, so there are no collisions and no retry (architect). See D5 and D6.
3. **A reader-writer lock keeps every tool call on one commit** (skeptic). See D8.
4. **Nothing the server issues is stored.** Signed client IDs and access tokens, no refresh grant, and no
   `sessions.json` (pragmatist). See D3 and D9.
5. **The real-client prototype is a checkpoint before `gather`, `capture` and the gate.** This restores the first
   round's ordering (architect). See tasks group 4.
6. **The pragmatist's proposal to use the MCP SDK was overruled,** and its condition for changing course is now
   recorded in D2.

A fourth round critiqued the revision. The pragmatist approved, and there was no veto. Its six findings are folded in:

7. **Single-use authorisation codes** without durable state: an in-memory spent set, plus a per-process signing nonce
   (skeptic). See D3.
8. **A capture mutex** covering fetch through push (skeptic). See D5.
9. **Checkout and graph recover together**, or the server refuses calls (skeptic). See D8.
10. **The throttle's address is defined behind a proxy** with `--trust-proxy` (architect). See D3.
11. **"Pending" is defined by ancestry**, and the sample workflow deletes closed or failed `capture/` branches
    (architect). See D5.
12. **The checkpoint exercises a write tool:** a stub `capture` that is not marked read-only and writes nothing
    (architect). See tasks group 4.

## Open Questions

- Whether ChatGPT's connector UI needs Client ID Metadata Documents rather than dynamic registration. Adding them
  later changes no spec here beyond one more accepted `client_id` form.
