## D1 — Mapping shape: flat list per context, identity default

`visibility.contexts` is `{<context>: [<visible visibility values>...]}`. Resolution of "can context C see value V" is `V ∈ (contexts[C] ?? [C])`. The `?? [C]` identity default means an unconfigured store — including every store created before this change — behaves byte-identically to the equality matching it replaces, so no migration is needed and no schema_version bump. Fail-closed property: an unknown context (no entry, and V ≠ C) sees nothing beyond its own literal value; there is no "default visible set" to leak through.

Alternative considered: a context-inheritance graph (contexts extending contexts). Rejected — the real store's need is one level of "several contexts also see this shared value"; a graph adds cycle handling and resolution-order questions for no demonstrated need.

## D2 — One helper, three consumers

A single `visibleValuesFor(config, context)` helper lives beside `resolveVisibility` (`src/core/notes/visibility.ts`) — the same "exactly one place" discipline as every other semantic primitive here. Consumers: the graph pre-filter, disclosure rung 3, and (trivially) anything later that needs the same question answered. No consumer re-implements the `?? [context]` default.

## D3 — Wall expressiveness: wildcard + except, not a rule language

`HardWallSchema` gains `verdict: 'ask'`, `audience: "*"` (matches every audience), and optional `except: [<audience>...]` (audiences the wall does not apply to). This is the minimal shape that expresses the proven ladder ("walled path → ASK all but one") without inventing a matcher DSL. Walls remain first-match-wins in declared order, evaluated before every other rung, exactly as before.

## Risks

- **[Risk] A store could configure a context to see everything**, defeating fail-closed defaults. → Accepted: the mapping is explicit operator configuration, same trust level as `directory_defaults`; nothing is implicit.
- **[Risk] `ask` walls make `check`'s exit code 5 reachable from a new rung.** → The exit-code taxonomy reserved 5 for ASK generally, not for rung 4 specifically; the envelope's `rung` field already reports which rung fired.
