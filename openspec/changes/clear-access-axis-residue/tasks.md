## 1. The shipped skills stop naming a flag the CLI refuses

- [ ] 1.1 Drop the `--as <context>` clause from the `graph query neighbors` step in `templates/skills/ctxr-connection-finding.md`, leaving `--depth`, `--direction`, and `--type` — the three options `src/run.ts` registers
- [ ] 1.2 Drop "everything a named context admits" from the subject sentence in `templates/skills/ctxr-publish.md`, leaving the three selectors `publish gather` accepts, and stop describing step 3 as a gate the store enforces
- [ ] 1.3 Rewrite that skill's closing paragraph so the reader's comprehension level is stated as a question about register that never widens what the page may contain, naming no `--audience` flag and no disclosure verdict
- [ ] 1.4 Update the assertions in `test/unit/skills.test.ts` that pin the removed prose, then run `npx vitest run test/unit/skills.test.ts` — green

## 2. The error message stops offering a removed flag

- [ ] 2.1 Remove `--as` from `PublishSelectorRequiredError`'s message in `src/core/errors.ts`, leaving `--under`, `--note`, and `--entity`
- [ ] 2.2 Run `npx vitest run test/integration/publish.test.ts` — the selector-required path exits with the usage code and its message names exactly the three accepted selectors

## 3. The recurrence guard

- [ ] 3.1 Add an assertion to `test/unit/skills.test.ts` that extracts every long flag named on a line that also names a `ctxr` command, across every rendered owned skill, and resolves it against the option table `buildProgram` registers for that command
- [ ] 3.2 Run `npx vitest run test/unit/skills.test.ts` — green as written; then reinstate `--as` in one template and confirm the run exits non-zero naming the skill and the flag, and restore

## 4. The specification and the project context

- [ ] 4.1 Apply the `harness-portability` delta: the disclosure-audience scenario restated against the surviving invariant, and the flag-existence scenario added
- [ ] 4.2 Correct `openspec/config.yaml`'s retrieval paragraph to name the stable per-note retrieval record rather than an adapter seam that was refused
- [ ] 4.3 Run `openspec validate clear-access-axis-residue --strict` — exits 0

## 5. Verify

- [ ] 5.1 Run `ctxr init` in an empty temporary directory, then confirm no rendered owned skill under the configured skills path names `--as` or `--audience`
- [ ] 5.2 Run `npm run build && npm run typecheck && npx vitest run` — all green
