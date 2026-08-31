## Why

First contact with a real store (an in-place migration of a mature, production PKM vault) exposed two modeling gaps that make the shipped visibility/disclosure mechanisms materially weaker than the store conventions they were generalized from:

1. **Visibility matching is equality-only.** `--as <context>` filtering and disclosure's internal-audience rung both test `resolved visibility === requesting context`. Real stores have lattice-shaped visibility: a value like `ctx-shared` that several contexts may all see. Under equality matching, every note carrying such a value is invisible to *every* context — the third-most-common visibility value in the migration target simply vanishes from filtered retrieval.

2. **Hard walls are under-expressive.** A wall matches exactly one named audience and can verdict only `allow` or `deny`. The proven policy shape is "walled path → ASK for every audience except one" — inexpressible today, forcing a real store to either drop its walls or hack around them.

Both fixes are mechanisms, not names: no persona value, no field key, and no one deployment's taxonomy enters any requirement (per the spec-authoring rules).

## What Changes

- Add a configurable context→visible-values mapping to `contexture.yaml` (`visibility.contexts`), defaulting to identity (a context sees exactly its own value) and failing closed for unknown contexts. Every visibility pre-filter and disclosure's internal-audience rung consult this mapping instead of raw equality.
- Extend hard-wall rules: a wall's verdict may be `ask` (reusing the existing distinct ASK exit code), a wall may match every audience via a wildcard, and a wall may exempt named audiences via an `except` list.
- **BREAKING**: N/A — additive config with identity/empty defaults; existing stores behave exactly as before.

## Capabilities

### Modified Capabilities

- `context-visibility`: visibility enforcement consults the configured context→visible-values mapping (identity by default) rather than raw value equality.
- `disclosure-policy`: rung 3 consults the same mapping; hard walls gain the `ask` verdict, a wildcard audience, and an exemption list.

## Impact

Affected code: `src/config/schema.ts` (VisibilitySchema, HardWallSchema), `src/core/notes/visibility.ts` (new visible-values helper), `src/core/graph/visibility-filter.ts`, `src/core/disclosure/model.ts`, `src/commands/check.ts` (no change expected — ASK already maps to exit 5), plus config-construction in `src/commands/init.ts` and the test fixtures. No schema_version bump (additive, defaulted).

## Non-goals

- Venture-namespaced audience registries and cross-namespace DENY rules (still the v1 cut from `bootstrap-contexture-core` — one deployment's org chart, not a primitive).
- Any change to the visibility field's key name or to shipped default values (naming stays postponed; the mapping is keyed by operator-defined strings).
- Transitive/hierarchical context inheritance (a mapping entry lists its visible values explicitly; no graph of contexts).
