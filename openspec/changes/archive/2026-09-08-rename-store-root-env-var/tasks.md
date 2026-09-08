## 1. Prerequisite sequencing

- [x] 1.1 Confirm `isolate-the-portability-test` has landed on the base branch (design.md — Migration Plan step 1); if it has, the scrubbed child environment names `CONTEXTURE_ROOT` and is renamed as part of task 2.3 rather than conflicting with it
- [x] 1.2 Run `git log --oneline -1 -- src/core/` and `npm run test` on the base branch to confirm a green starting point before any rename

## 2. Root resolution and errors

- [x] 2.1 `src/core/root.ts`: read `env.env.CONTEXTURE_STORE_ROOT` in both `resolveExistingRoot` and `resolveRootForInit`, and update the doc comments that name the variable and the resolution order
- [x] 2.2 `src/core/root.ts`: add the superseded-name check to both entry points — when `CONTEXTURE_ROOT` is set and `CONTEXTURE_STORE_ROOT` is not, throw rather than fall through; it must not fire when `--root` was given (design D3) or when `CONTEXTURE_STORE_ROOT` is also set (design D2)
- [x] 2.3 If `isolate-the-portability-test` landed, rename the `CONTEXTURE_ROOT` key in the scrubbed child environment it added, scrub the new name alongside it, and fix the stray store noun in its `design.md` ("tested the WRONG vault" -> store) — deferred to here rather than edited in that change, to keep the two diffs from colliding
- [x] 2.4 `src/core/errors.ts`: update the `NoStoreRootError` message to name `CONTEXTURE_STORE_ROOT`, and add an error for the superseded name whose message names both spellings and exits with the usage code
- [x] 2.5 `src/run.ts`: update the `--root` option description to say it overrides `CONTEXTURE_STORE_ROOT`
- [x] 2.6 Run `npm run typecheck` — exits 0

## 3. Tests

- [x] 3.1 `test/unit/root.test.ts`: rename the variable in the precedence and fallback cases for both `resolveExistingRoot` and `resolveRootForInit`
- [x] 3.2 `test/unit/root.test.ts`: add cases for the four delta scenarios — superseded name alone refuses; current name wins when both are set; `--root` beats a set superseded name without refusing; an unrelated variable still falls through
- [x] 3.3 `test/helpers/git-env.ts` and `test/integration/no-root.test.ts`: scrub and assert on the new name, keeping the old name scrubbed too so a developer's exported variable cannot leak into a test run
- [x] 3.4 Run `npx vitest run test/unit/root.test.ts test/integration/no-root.test.ts` — exits 0

## 4. Shipped prose and generated documents

- [x] 4.1 `templates/agents/canonical.md`: update the root-resolution sentence to name `CONTEXTURE_STORE_ROOT`
- [x] 4.2 `test/unit/agents-doc.test.ts`: update the two assertions that name the variable and the byte-exact canonical paragraph
- [x] 4.3 Run `npx vitest run test/unit/agents-doc.test.ts` — exits 0

## 5. Documentation and scripts

- [x] 5.1 `README.md`: update the root-resolution order sentence
- [x] 5.2 `scripts/verify-phase0.sh`: update both invocations to export the new name
- [x] 5.3 `test/unit/conventions.test.ts`: replace the `'# Vault conventions'` / `'conventions/vault.md'` fixture strings with the settled noun (`'# Store conventions'` / `'conventions/store.md'`) — arbitrary fixture text, but it is the last place in the repo that uses "vault" as the store noun
- [x] 5.4 Leave `package.json`'s `"pkm"` keyword, `src/core/graph/model.ts`'s references to pkm's stem-based graph, and `path-gate.ts`'s "sanctioned workspace" unchanged — the first is an npm discovery keyword, the second names a real repository as precedent, the third means the working area rather than the store
- [x] 5.5 Run `npm run build && npm run verify:phase0` — exits 0

## 6. Specs and project context

- [x] 6.1 `openspec/specs/harness-portability/spec.md` is left untouched — the delta under this change carries the requirement text, and syncing is the archive step's job, not implementation's
- [x] 6.2 `openspec/config.yaml`: replace the line "Naming is deliberately postponed: the store's root noun is not yet chosen" with the recorded split (design D6) — the noun is `store`; identifiers are `CONTEXTURE_STORE_ROOT` in the environment and bare `store_root` / `storeRoot` in config, code, and any future flag or key; "knowledge store" is available as the product noun in prose. Leave the naming paragraph's `CONTEXTURE_*` sentence in place, since the prefix rule is unchanged
- [x] 6.3 Run `openspec validate rename-store-root-env-var --strict` — exits 0

## 7. Full verification

- [x] 7.1 Run `grep -rn "CONTEXTURE_ROOT" src templates scripts README.md test openspec/specs` and confirm the only hits are the deliberate superseded-name references in `src/core/root.ts`, `src/core/errors.ts`, and the tests from 3.2/3.3
- [x] 7.2 Run `grep -rin "\bvault\b" src templates scripts README.md test` and confirm it returns nothing — the store noun is settled and no synonym remains
- [x] 7.3 Run `npm run typecheck && npm run test && npm run build && npm run verify:phase0` — all exit 0
