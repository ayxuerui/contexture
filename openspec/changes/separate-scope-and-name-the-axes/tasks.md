## 1. Config schema and shipped defaults

- [ ] 1.1 Add `fields.scope` and `fields.disclosure` to the config schema with shipped defaults, and add the `scope` block (`default` list, `directory_defaults`, and `definitions` carrying `includes` and `isolating`), every field defaulted so a store omitting the block still loads
- [ ] 1.2 Add the new shipped default key constants beside the existing ones, and add the historical literals (`lens`, `audience`) that migration `0003` searches for, each commented with the schema version that retired it
- [ ] 1.3 Raise the supported schema version to 3 and update `init`'s config construction, `render`, and every config fixture
- [ ] 1.4 Run `npx vitest run` — existing suites pass except those asserting the old key names or schema version, which fail with a clear key/version mismatch rather than a crash

## 2. Scope resolution and the composed pre-filter

- [ ] 2.1 Implement scope resolution beside the visibility resolver: multi-valued, explicit → directory default (longest prefix wins) → configured default, returning the resolved list and which rung produced it, with the third rung's reason distinct from a fail-closed outcome
- [ ] 2.2 Implement the selectable-values helper mirroring the visibility one — a scope selects itself plus its configured `includes`, identity default when unconfigured
- [ ] 2.3 Wire both axes into note enumeration: the long-accepted requesting-context parameter finally filters, and a scope selector joins it; both default to no filtering so every existing caller is unaffected
- [ ] 2.4 Replace the graph's visibility-only audience filter with one combined pre-filter applying both axes, including the isolating-scope inversion, so no leg can apply one axis without the other
- [ ] 2.5 Run `npx vitest run` — new unit tests cover resolution rungs, includes membership, the isolating inversion, and that a note excluded on either axis contributes no graph edges

## 3. Checks

- [ ] 3.1 Add the isolating-mixed check (fails, naming the note and both scopes) and the scope-default-reliance finding (warns, never fails), registering both by appending one import and one array entry to the check manifest
- [ ] 3.2 Run `ctxr doctor --json` against a fixture store with a mixed note — exits non-zero naming the note; run `ctxr lint --json` against a store whose only finding is scope-default reliance — exits zero and lists it

## 4. Retrieval consumers

- [ ] 4.1 Accept a scope selector on every command that already accepts a requesting context (graph query group, catalog show), exiting non-zero naming an unknown scope rather than returning an empty result
- [ ] 4.2 Carry resolved scope on the per-note record and on catalog entries, so neither a consumer nor a catalog read re-resolves either axis
- [ ] 4.3 Run `ctxr graph query neighbors <node> --as ctx-a --scope scope-a --json` and `ctxr catalog show --as ctx-a --scope scope-a --json` against a fixture store — both return only notes admitted by both axes; an unknown scope exits non-zero

## 5. Disclosure field key

- [ ] 5.1 Read the explicit-tag rung's frontmatter key from configuration instead of the hardcoded literal, leaving every rung's ordering and verdict unchanged
- [ ] 5.2 Run `ctxr check <note> --audience ctx-a` against a fixture store configuring a non-default disclosure key — the tag under the configured key is honored and a tag under the shipped default key is not; verdict exit codes are unchanged

## 6. Migration

- [ ] 6.1 Implement `0003-rename-axis-fields`: rename both historical literals on every note and both config keys in one pass, advancing the schema version, with `plan()` and `apply()` both re-deriving pending work from on-disk state
- [ ] 6.2 Ensure pending migrations are applied and reported in ascending schema-version order, and that an interrupted run leaves the store at the last completed version
- [ ] 6.3 Run `ctxr migrate --dry-run --json` against a fixture store two versions behind — both migrations are enumerated in order and nothing is written; then `ctxr migrate` — the store reaches version 3 and a re-run reports nothing pending

## 7. Project documents

- [ ] 7.1 Update `openspec/config.yaml`: rewrite the context block's postponed-naming paragraph, extend the Tenancy paragraph to three axes, rewrite the "bind the provisional field name" rule for three settled keys, and extend both the one-place rule and the archive-guidance audit to all three keys
- [ ] 7.2 Narrow `openspec/specs/context-visibility/spec.md`'s Purpose to permission alone by editing the main spec directly, since a Purpose written in a delta is ignored for an existing capability
- [ ] 7.3 Regenerate the store's entry document and owned skills so their frontmatter examples and field references use the new keys
- [ ] 7.4 Run `ctxr verify --portable` and `openspec validate --all --strict` — both exit zero

## 8. Verify

- [ ] 8.1 Add an end-to-end test: a fixture store where a note is in one scope and broadly visible, asserting it is selected by its own scope, excluded by another, and visible to every context configured to see its value — the case that was inexpressible before this change
- [ ] 8.2 Add a regression test that a store with no scope block produces byte-identical `catalog build`, `graph build`, and `doctor` output to the pre-change baseline
- [ ] 8.3 Run `npm run build && npm run typecheck && npx vitest run` — all green
