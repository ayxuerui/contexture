## Why

`local-browsing-surface` gave `ctxr serve` a hard, unconditional loopback-only bind on the theory that a
personal reading tool never needs to be reached from anywhere but the operator's own machine. A real
deployment surfaced a case that theory didn't cover: an operator who has *already* arranged something
else in front of the server — here, a Cloudflare Tunnel daemon sharing the server's own network
namespace — and needs the server itself to bind somewhere that trusted front end can actually reach.
Docker's own networking rules make this concrete: a process bound to `127.0.0.1` inside one container is
unreachable from a sibling container even on the same bridge network, by design — the only way to reach
it without changing the bind address is to share that container's network namespace entirely, which
trades away the ability to run the tunnel and the server as independent, separately-restartable
services. A configurable bind address removes that trade-off without removing the default that makes an
un-configured `ctxr serve` invocation exactly as safe as it always was.

This does not change the capability's central honesty: `ctxr serve` still applies no per-territory
filtering, no rate limiting, and no authentication, regardless of what it's bound to. Widening the bind
address was already available in effect to anyone willing to arrange network-namespace sharing, as the
motivating case shows — this makes it an explicit, visible choice instead of an implicit one reachable
only by infrastructure trickery, without adding any protection the capability never claimed to have.

## What Changes

- Add `ctxr serve --host <address>`, defaulting to `127.0.0.1` (today's only behavior) so every existing
  invocation is unaffected. Naming any other address binds there instead.
- Restate the loopback requirement as a default rather than an absolute: the server binds to loopback
  unless the operator explicitly names a different address, and every other guarantee in this capability
  (no filtering, no rate limiting, no auth) is stated to apply identically regardless of bind address —
  closing the gap where "the entire security boundary is the bind address" could be misread as "and
  therefore this capability is safe to widen casually."

## Non-goals

- **Any actual access control, rate limiting, or authentication.** Still entirely out of scope for this
  capability; a `--host` flag makes the existing no-filtering posture reachable at a different address,
  it doesn't add a new one. An operator widening the bind address is choosing to rely entirely on
  whatever sits in front of it (a firewall, a tunnel, a reverse proxy) for that.
- **A companion `--port` change.** `--port` is already fully configurable; this is `--host` only.
- **Validating or restricting which addresses `--host` accepts.** The flag passes its value straight to
  Node's `server.listen()`; an operator who names an unreachable or malformed address gets whatever
  Node's own error reports, the same fail-loud behavior every other command's underlying I/O errors get.

## Capabilities

### Modified Capabilities

- `context-browsing`: the loopback-only bind requirement becomes a loopback-by-default requirement, with
  an explicit `--host` override; every other requirement in the capability is restated to apply
  regardless of bind address.

## Impact

Affected code: `src/commands/serve.ts` (`DEFAULT_HOST` exported, `ServeFlags`/`ServeData` gain `host`,
the hardcoded bind/URL-construction sites now use `flags.host`), `src/run.ts` (`--host` option reusing
the exported default). No config key, no schema version change, no change to any other command.

Affected stores: additive. A `ctxr serve` invocation with no `--host` behaves exactly as before.
