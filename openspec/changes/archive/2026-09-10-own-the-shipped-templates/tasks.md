## 1. Ownership follows the name

- [x] 1.1 In `src/core/note-templates.ts`, rewrite every declared template whose name the packaged library uses, comparing the file to the rendered bytes and writing only on a difference — no hash, no modified/unmodified branch
- [x] 1.2 Reduce the record to the list of delivered names, and drop the `sha256` helper with its import
- [x] 1.3 Remove the `templates.locally_modified` finding and the now-empty findings path from the sync's return
- [x] 1.4 Remove a template the record names that the store no longer declares, or that the library no longer carries, unconditionally
- [x] 1.5 Leave untouched any file at the path whose name the packaged library does not use
- [x] 1.6 `npm run typecheck` exits 0

## 2. Tests state the new contract

- [x] 2.1 Replace the preserve-and-report unit tests: an edited shipped template is restored on sync and no finding is emitted
- [x] 2.2 Unit test: a second sync writes nothing; a store-authored file under an unreserved name is byte-identical and unreported
- [x] 2.3 Unit test: a template dropped from the declared list is removed even when edited
- [x] 2.4 Unit test: a store carrying the previous `{name: hash}` record converges to the new shape with no error
- [x] 2.5 Replace the integration test asserting an operator's edit survives `ctxr update`, with one asserting it does not
- [x] 2.6 `npx vitest run test/unit/note-templates.test.ts test/integration/note-templates.test.ts` exits 0

## 3. Documentation and full verification

- [x] 3.1 README: replace "Edit a shipped one and `ctxr update` reports it and leaves it alone" with the new rule and where a house variant belongs
- [x] 3.2 Confirm no reference to `templates.locally_modified` survives in source, tests, templates, or specs
- [x] 3.3 `npm run typecheck && npm run build && npm test` exits 0
- [x] 3.4 `openspec validate own-the-shipped-templates --strict` exits 0
- [x] 3.5 End to end in a scratch directory: `ctxr init`; edit a shipped template; `ctxr update` restores it and reports no finding; add a file under an unreserved name and confirm a second `ctxr update` leaves it alone and writes nothing
