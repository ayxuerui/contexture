## 1. The shipped skills stop naming a flag the CLI refuses

- [x] 1.1 Drop the `--as <context>` clause from the `graph query neighbors` step in `templates/skills/ctxr-connection-finding.md`, leaving `--depth`, `--direction`, and `--type` — the three options `src/run.ts` registers
- [x] 1.2 Drop "everything a named context admits" from the subject sentence in `templates/skills/ctxr-publish.md`, leaving the three selectors `publish gather` accepts, and stop describing step 3 as a gate the store enforces
- [x] 1.3 Rewrite that skill's closing paragraph so the reader's comprehension level is stated as a question about register that never widens what the page may contain, naming no `--audience` flag and no disclosure verdict
- [x] 1.4 Update the assertions in `test/unit/skills.test.ts` that pin the removed prose, then run `npx vitest run test/unit/skills.test.ts` — green

## 2. The error message stops offering a removed flag

- [x] 2.1 Remove `--as` from `PublishSelectorRequiredError`'s message in `src/core/errors.ts`, leaving `--under`, `--note`, and `--entity`
- [x] 2.2 Assert the message in `test/unit/publish-gather-command.test.ts` (the selector test there pins only the error type), then run `npx vitest run test/unit/publish-gather-command.test.ts` — the selector-required path carries the usage exit code and names exactly the three accepted selectors

## 3. The recurrence guard

- [x] 3.1 Add a check to `test/unit/skills.test.ts` that attributes every long flag in the rendered owned skills to its nearest preceding executable and resolves each `ctxr`-attributed one against the options `src/run.ts` registers — `run()` builds its program inline and exports no builder, so the registration is read from that one file, in the style of `test/unit/single-source-literals.test.ts`
- [x] 3.2 Run `npx vitest run test/unit/skills.test.ts` — green as written; then reinstate `--as` in one template and confirm the run fails naming the skill and the flag, and restore

## 4. The specification and the project context

- [x] 4.1 Apply the `harness-portability` delta: the disclosure-audience scenario restated against the surviving invariant, and the flag-existence scenario added
- [x] 4.2 Correct `openspec/config.yaml`'s retrieval paragraph to name the stable per-note retrieval record rather than an adapter seam that was refused
- [x] 4.3 Run `openspec validate clear-access-axis-residue --strict` — exits 0

## 5. Verify

- [x] 5.1 Run `ctxr init` in an empty temporary directory, then confirm no rendered owned skill under the configured skills path names `--as` or `--audience`
- [x] 5.2 Run `npm run build && npm run typecheck && npx vitest run` — all green
