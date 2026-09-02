## Context

See `proposal.md` — Why. The motivating case is a real store (an operator's own PKM vault) migrating
from a static nginx sidecar to `ctxr serve` as the origin behind an existing Cloudflare Tunnel. Docker's
`network_mode: container:<name>` is the standard way to put two containers in one network namespace
across separate compose projects — the mechanism the deploying store actually uses — and it requires the
shared-namespace side to bind wherever the other side can reach it, which a hardcoded `127.0.0.1` inside
a container can still satisfy (the tunnel process ends up in the *same* loopback), but a design that
never anticipated any bind address but the default makes that coincidence rather than a supported case.

## Goals / Non-Goals

**Goals:**
- Let an operator who has arranged their own trusted front end reach `ctxr serve` without requiring
  network-namespace sharing as the only option.
- Keep every un-configured invocation byte-for-byte identical in behavior to before this change.
- State the "no filtering regardless of bind address" fact as a requirement, not just a design-doc aside,
  so a future reader of the spec alone (not this history) can't miss it.

**Non-Goals:** see `proposal.md` — Non-goals (no access control, no `--port` change, no address
validation).

## Decisions

**D1 — `--host`, not a config key.** Matches `--port`'s own precedent (`local-browsing-surface` D6): an
invocation-time choice, not something that belongs to the store. `contexture.yaml` still carries nothing
for `serve`.

**D2 — Default value exported from `serve.ts`, not duplicated in `run.ts`.** `DEFAULT_HOST` is now
`export const`, and `run.ts`'s `--host` option reuses it as the commander default rather than repeating
the literal `'127.0.0.1'` in a second place — the project's own single-source-literal discipline applied
to a two-line case, not just its named constants.

**D3 — The requirement is restated as a default, not deleted and replaced with silence.** The
alternative considered: simply add the flag and leave the old "binds only to loopback" requirement as
close-enough prose. Rejected — `openspec/config.yaml`'s spec-authoring rule requires an enforcement claim
to name its actual mechanism, and "SHALL bind ... only" is now false the moment `--host` exists; leaving
it unedited would make the spec describe a program that no longer exists. The replacement keeps the
default-safe behavior as a normative SHALL and turns the absolute prohibition into an explicit,
named exception.

## Risks / Trade-offs

- **A wider bind address is now one flag away instead of requiring real infrastructure effort.** →
  Accepted: the effort the old design relied on (network-namespace sharing) was never actually a
  meaningful barrier, as the motivating case shows — an operator who wants this can already get it, just
  more awkwardly. Making it a documented flag doesn't lower a real bar; it removes friction that wasn't
  protecting anything.
- **A misread of "loopback by default" as "safe by default, therefore fine to widen."** → Mitigated by
  restating, as a requirement (not just a proposal aside), that no per-territory filtering, rate
  limiting, or authentication exists at any bind address — the same fact this capability already stated
  about the loopback-only case, now stated so it survives the default changing.

## Migration Plan

Additive; no schema version, no config key, no existing invocation's behavior changes. A `ctxr serve`
call with no `--host` is unaffected.
