## Context

See proposal.md for why. What the approach builds on:

- `createIdentityVerifier` (`src/core/approval/identity.ts`) verifies the assertion: signature against the
  configured key set, issuer, audience, expiry, an email claim. It fails closed.
- `handleRequest` in `src/commands/serve.ts` routes in this order: MCP paths, the method check, the webhook, the
  plugin downloads, three static assets, pull request previews, the approval routes, then the route table and
  every browsing route.
- The verifier lives on the approval surface (`ApprovalServer`), which is `null` with `approvalError` set when the
  block is declared but the surface could not be rebuilt after a configuration change (a forge outage, say).
- The deployed shape (contexture-images): `serve --host 0.0.0.0` in its own container, a tunnel in another, the
  access proxy covering the hostname with a bypass for the MCP paths and `/hooks/github`.

## Goals / Non-Goals

**Goals:**
- A request that reaches a widened port without passing the access proxy reads nothing from the store.
- A store with no `change_approval`, and any `serve` on loopback, behave exactly as today.
- No new key for the operator to discover.

**Non-Goals:** see the proposal.

## Decisions

### D1. On by default when the identity is declared; no opt-in key

**Case for an opt-in key** (`serve.require_identity: true`): it cannot surprise a running deployment. An operator
whose proxy lets some path through without an assertion (a bypass for public `/publish/` pages, a second proxy
application with another audience, an internal caller on the container network) keeps working until they choose
otherwise. It also follows the house rule that an opt-in key carries no default.

**Why not:** the gap is a safe-default problem. A store that needs the key is one whose operator has not read
about it, which is the store the issue describes. Declaring `change_approval.identity` already says "an access
proxy sits in front of this server and signs who is asking"; the README has always told the operator to keep the
whole hostname behind it apart from the named bypasses. The breakage is loud (a `401` naming the assertion), and
it is undone by installing the previous release. A key would outlive the transition.

**What would flip it:** a real deployment that serves part of the browsing surface publicly on purpose. Then the
answer is a key naming the public prefixes, not a switch for the whole check.

### D2. A verified assertion is enough; no list

**Case for a list** (`mcp.readers`, `change_approval.deciders`, or a new `serve.readers`): defence in depth. An
access policy widened by mistake would not widen who reads the store, and the server would agree with the MCP
surface, where a reader must be listed.

**Why not:** today the access policy is the list of who may browse, and every deployment relies on it. A
server-side list would lock out everyone the proxy admits and the list omits on the day of the upgrade.
`deciders` means "may approve" and `mcp.readers` means "may connect an app"; neither means "may open a note in a
browser", and a store with no `mcp` block has no reader list at all. The threat in the issue is a request that
went around the proxy, and the assertion alone answers it. A list can be added later without changing this
check.

### D3. A loopback bind is exempt, decided by the address the server bound

`ctxr serve` with no `--host` is how a person reads their own store, including a store that declares change
approval. That request carries no assertion and never will.

**Case for no exemption:** one rule, no bind-dependent behaviour, and a tunnel that shares the server's network
namespace (a sidecar) reaches a loopback bind, so that deployment stays unprotected against whatever else runs in
the namespace.
**Why not:** it would break local browsing of every approval store. Anything inside the namespace of a loopback
server is already on the machine with the store's files.

**Case for exempting by peer address instead** (a request arriving from `127.0.0.1` passes, whatever the bind): it
would also let the image's health probe read `/`.
**Why not:** a reverse proxy or tunnel on the same host forwards every outside request from loopback, so the
exemption would cover exactly the traffic the check is for. The bind address is the operator's own statement; the
peer address is not. The probe counts a `401` as serving.

The address is read from the listener after it binds (`127.0.0.0/8`, `::1`, or an IPv4-mapped form of the first),
so `--host localhost` is exempt when it resolves to loopback and not otherwise.

### D4. One gate, placed after the routes that have their own control

The gate runs after the MCP paths, the method check and the webhook, and before everything else. `/approve/` and
`/plugin/` are passed through to their handlers, which verify the same assertion and then apply their lists, so
their `403`, `404` and `503` answers stay as specified. The stylesheet and the two diagram scripts are gated
too: they carry no store content, but "every route" is easier to state, test and trust than a list of harmless
ones, and the `401` is plain text that needs none of them.

**Case for leaving the assets open:** a cached asset never fails, and they are public files of the package.
**Why not:** nothing reaches them except a page that was itself admitted.

A refusal is `401`, plain text, `Cache-Control: no-store`, the same sentence the approval page uses. It is
written before the route table is built, so nothing of the store is read. The reason goes to stderr, not to the
response.

### D5. The gate verifies with its own verifier, built from the loaded configuration

The gate keeps one verifier per distinct `identity` block, rebuilt when the loaded configuration's block changes.
It does not borrow the approval surface's verifier.

**Case for borrowing it:** one key-set cache, one fetch.
**Why not:** the approval surface is absent while its forge is unreachable after a configuration change. Browsing
would then have to either open (the hole again) or answer `503` for a forge outage that has nothing to do with
reading notes. With its own verifier the gate depends only on the configuration and the key set.

### D6. Where the requirement lives

In `context-browsing`: these are that capability's routes. The `change-approval` requirement for `/approve/` is
unchanged. `context-browsing`'s purpose paragraph still holds as written: the gate admits or refuses a request
and filters nothing by requester.

## Risks / Trade-offs

- **A deployment with a proxy bypass beyond the documented ones breaks on upgrade.** Mitigation: the README names
  the change and the check to run from outside; rollback is the previous release.
- **A key set that cannot be fetched refuses all browsing**, as it already refuses the approval page. That is the
  fail-closed behaviour the verifier was built for.
- **One more signature check per request.** An RS256 verify is tens of microseconds; the key set is cached.
