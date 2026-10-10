## 1. On-demand guidance documents

- [ ] 1.1 `src/core/conventions.ts`: add `readWhen: string | null` to `ScannedDoc`, read from a non-empty string `read_when` frontmatter value (trimmed). Collapse any newline to a space so an index row stays one line.
- [ ] 1.2 `src/core/agents-doc.ts`: render only `readWhen === null` docs in the conventions section. Add `AGENTS_MD_GUIDANCE_INDEX_FENCE`, `renderGuidanceIndexSection`, and `buildAgentsGuidanceIndexSection`, which removes the fence when no doc is on demand (the mission section's pattern). Append the fence to `AGENTS_MD_SECTION_ORDER`.
- [ ] 1.3 Add a `templates/agents/guidance-index.md` template whose row list is the one substitution point. Document `read_when` in `templates/conventions/house-conventions-seed.md`'s guidance comment, giving the "Before <task>…" form.
- [ ] 1.4 `src/core/reconcile.ts`: call the new build function alongside the others.
- [ ] 1.5 Extend `checkAgentsMdDrift` and the staged check in `src/core/checks/integrity-checks.ts` to compare the guidance index too. Attribute a mismatch to the on-demand doc whose row changed, or to every on-demand doc when the change cannot be pinned to one.
- [ ] 1.6 Tests in `test/unit/agents-doc.test.ts` and `test/unit/conventions.test.ts`, one per scenario of "A guidance document may load on demand", plus a drift test and a staged-drift test for an on-demand doc.
- [ ] 1.7 Run `npx vitest run test/unit/agents-doc.test.ts test/unit/conventions.test.ts test/unit/integrity-checks.test.ts` and confirm it exits 0.

## 2. Size checks

- [ ] 2.1 `src/config/schema.ts` and `defaults.ts`: add `harness.entry_document_target_bytes` (positive integer, shipped default 20,480). It is a convention key, so the renderer omits it when it equals the default.
- [ ] 2.2 `src/core/checks/harness-portability-checks.ts`: add `entryDocumentReadLimitCheck` (invariant, store scope). It compares `AGENTS.md`'s byte length against each declared adapter's effective limit and names the harness, size, limit, and the `contexture:<region>` fence containing the byte at the limit, or the nearest preceding one. Add `entryDocumentTargetSizeCheck` (observation). Register both.
- [ ] 2.3 Tests in `test/unit/harness-portability-checks.test.ts`, one per scenario of "The entry document fits the harnesses that read it". Assert that `doctor --staged` does not run the read-limit check.
- [ ] 2.4 Run `npx vitest run test/unit/harness-portability-checks.test.ts test/unit/config-schema.test.ts test/unit/lint-command.test.ts` and confirm it exits 0.

## 3. Leaner generated prose

- [ ] 3.1 Rewrite `templates/agents/canonical.md`, `retrieval-leg-routing.md`, `capture-and-ingest.md`, and `conventions.md`, and `templates/conventions/baseline-conventions.md`, to the kernels in design.md D5. Keep every phrase an existing requirement mandates: the root-resolution order, the source-identity fields, the templates path with the kind-field guidance, the write path, the identity boundary, the narrowing command, the graph document path, the vocabulary with definitions and directedness, and the default branch and worktrees path in the baseline.
- [ ] 3.2 Update the existing assertions in `test/unit/agents-doc.test.ts`, `test/unit/conventions.test.ts`, `test/unit/harness-portability-checks.test.ts`, and any snapshot that pins removed prose. Every assertion that encodes a spec scenario must still pass on the new text.
- [ ] 3.3 Add a ceiling test that initializes a store on the default configuration, sums the contexture-owned fenced sections of `AGENTS.md` (excluding mission and operator conventions), and fails above the ceiling. Set the ceiling to the measured total rounded up to the next 500 bytes.
- [ ] 3.4 Run `npx vitest run test/unit/agents-doc.test.ts test/unit/entry-document-ceiling.test.ts` and confirm it exits 0.

## 4. End to end

- [ ] 4.1 Run `npm run typecheck && npm test` and confirm both exit 0.
- [ ] 4.2 Run `npm run build`, then initialize a scratch store with `node dist/bin.js init --harness codex,antigravity --profile para` and `CONTEXTURE_BIN` set to the worktree build. Add one inlined and one `read_when` convention file, then run `node dist/bin.js update`. Confirm three things: `AGENTS.md` shows the inlined file in "Store conventions" and the other in the guidance index; `node dist/bin.js doctor` exits 0; and padding the inlined file past 24,000 bytes makes `doctor` exit non-zero naming `antigravity`.
- [ ] 4.3 Run `openspec validate lean-composed-entry-document --strict` and confirm it exits 0.
