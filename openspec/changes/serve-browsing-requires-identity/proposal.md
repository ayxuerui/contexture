## Why

A store that declares `change_approval.identity` tells `ctxr serve` how to verify the signed assertion its access
proxy forwards. `serve` uses that on three surfaces only: the approval page, MCP sign-in at `/authorize`, and the
connect page at `/plugin/`. Every browsing route (`/`, `/graph`, `/notes/…`, `/catalog/…`, `/publish/…`,
`/preview/…`, the review view) answers without reading the header (issue #268).

So the access proxy is the only control on the whole content of the store, and a request that reaches the port
around the proxy reads every note: the public address of the origin behind a DNS-proxied access proxy, or another
workload on the same network. The approval page already treats that request as a threat and answers `401`.
Reading the notes is less protected than approving a change to them, and the server already holds the verifier
that would close the gap.

## What Changes

- **Browsing requires the verified assertion.** When the loaded configuration declares `change_approval.identity`
  and `serve` is bound to an address other than loopback, every route requires a verified assertion and answers
  `401` without one, before it reads anything from the store.
- **Routes with a control of their own are unchanged.** `/mcp`, `/token`, `/register`, `/authorize` and the
  `/.well-known/` OAuth documents (bearer token, OAuth protocol, and `/authorize`'s own assertion check),
  `/hooks/github` (signature), `/approve/` and `/plugin/` (assertion plus their own lists).
- **A loopback bind is unchanged.** `ctxr serve` with no `--host` in a store that declares change approval still
  answers a local browser with no assertion.
- **A verified assertion is enough.** No list of readers is added: the access proxy's policy decides who may
  read, and the server proves the request came through it.
- **No new configuration key.** A store without `change_approval` behaves exactly as today.

## Non-goals

- **Per-requester filtering.** Every admitted requester still reads the same whole store.
- **A reader list, or an identity block outside `change_approval`.** See design.md D2 and D5.
- **Authentication for a store with no access proxy.** `serve` still verifies someone else's assertion and issues
  none of its own for browsing.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `context-browsing`: the bind-address requirement stops saying no route authenticates, and a new requirement
  states when browsing requires the verified assertion.

## Impact

- `src/commands/serve.ts`, new `src/core/browse/identity-gate.ts`.
- README: the browsing, approval and access-proxy passages.
- Deployments: a store that declares `change_approval` and runs `serve --host 0.0.0.0` behind an access proxy
  starts refusing any path the proxy lets through without an assertion. The MCP and webhook bypasses the README
  describes are unaffected. An operator who bypassed the proxy for another path (public `/publish/` pages, say)
  loses that path. The audience must be the one of the proxy application that covers the hostname.
- The harness image's health probe requests `/` over loopback against a `0.0.0.0` bind and will get `401`; it
  counts any HTTP answer as serving, so it stays healthy.
