## 1. Config and helper

- [x] 1.1 Add `visibility.contexts` (record of context → visible-values list, default `{}`) to the config schema; add `ask` to the hard-wall verdict enum, plus wildcard-audience (`"*"`) semantics and an optional `except` list
- [x] 1.2 Implement `visibleValuesFor(config, context)` beside `resolveVisibility` — the single shared primitive every consumer calls (identity default, fail-closed)
- [x] 1.3 Update `init`'s config construction and every test fixture for the new field; existing 427 tests stay green (identity default preserves all current behavior)

## 2. Consumers

- [x] 2.1 `filterGraphByAudience` treats a node visible when its resolved visibility ∈ `visibleValuesFor(audience)`
- [x] 2.2 `evaluateDisclosure` rung 3 uses the same membership test; wall matching honors wildcard, `except`, and the `ask` verdict (mapped to the existing DisclosureAsk exit code)

## 3. Verify

- [x] 3.1 Unit: mapping membership (shared value visible to two contexts; identity default; unknown context fails closed); wall wildcard/except/ask (ask short-circuits an explicit tag; exempt audience passes the wall)
- [x] 3.2 Integration (real CLI): a store configured with a shared value shows it under `graph query neighbors --as` for both mapped contexts and hides an unmapped value; `check` returns exit 5 at a wildcard ASK wall and proceeds past it for the exempted audience
- [x] 3.3 `npm run build && npm run typecheck && npx vitest run` all green
