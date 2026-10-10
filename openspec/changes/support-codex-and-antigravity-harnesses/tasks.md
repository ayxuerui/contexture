## 1. Adapter interface and configuration

- [ ] 1.1 Add optional `entryDocumentMaxBytes?: number` to `HarnessGenerationAdapter` in `src/adapters/types.ts`. Its doc comment states that absent means the harness reads the whole entry document, and that adding it leaves `SUPPORTED_ADAPTER_INTERFACE_VERSION` at 2 (design.md D3).
- [ ] 1.2 Add optional `entry_document_max_bytes` (positive integer) to `AdapterDeclarationSchema` in `src/config/schema.ts`, with no `.default()` and no `SHIPPED_DEFAULTS` entry. Confirm that `src/config/render.ts` does not emit it for a store that never set it.
- [ ] 1.3 Add a helper that resolves a declared adapter's effective entry-document limit (store override first, then the adapter's value, otherwise none). It sits beside `effectiveSkillsDir` in `src/core/harness/bridge.ts`, or in a sibling module if that reads better at the point of use.
- [ ] 1.4 Extend `test/unit/config-schema.test.ts`: a positive override parses, zero and negative values are refused with the adapter named, and an absent key round-trips without being rendered.
- [ ] 1.5 Run `npx vitest run test/unit/config-schema.test.ts test/unit/adapters-registry.test.ts` and confirm it exits 0.

## 2. The two adapters

- [ ] 2.1 Create `src/adapters/harness/codex.ts` with `id: 'codex'`, `interfaceVersion: 2`, `skillsDir: '.agents/skills/'`, and `entryDocumentMaxBytes: 32768`. It has no `entryFileName`, `render`, or `permissionConfig`. The doc comment records the probe (codex-cli 0.154.0), says that a repo `.codex/config.toml` does not raise the limit, and points to design.md D4 for why there is no permission config.
- [ ] 2.2 Create `src/adapters/harness/antigravity.ts` the same way, with `id: 'antigravity'` and `entryDocumentMaxBytes: 24000` (agy 1.3.2). The doc comment says why there is no `GEMINI.md` wrapper: Antigravity loads both files, so a wrapper would load the fundamentals twice.
- [ ] 2.3 Register both adapters in `src/adapters/builtin/index.ts`, appended after the existing two.
- [ ] 2.4 Extend `test/unit/adapters-registry.test.ts` so both resolve by `(harness-generation, id)`. Extend `test/unit/harness-bridge.test.ts` so that a store with the default skills path that declares `codex` or `antigravity` has no bridge created and reports nothing. Also cover a store with a non-canonical skills path that declares `codex`: `.agents/skills/` is bridged to it.
- [ ] 2.5 Run `npx vitest run test/unit/adapters-registry.test.ts test/unit/harness-bridge.test.ts test/unit/adapters-generate-command.test.ts` and confirm it exits 0.

## 3. Init selection and help

- [ ] 3.1 Add `codex` and `antigravity` to `SELECTABLE_HARNESSES` in `src/commands/init.ts`. Each description says the harness reads `AGENTS.md` directly and states its read limit. `DEFAULT_HARNESS_IDS` stays `['claude-code']`.
- [ ] 3.2 Export the selectable ids, and derive the `--harness` description in `src/run.ts` from them so the hardcoded `(claude-code, hermes-agent)` list goes away.
- [ ] 3.3 Extend `test/unit/init-interactive.test.ts`, or the non-interactive init tests: `--harness codex,antigravity` records both declarations, writes no entry file, and creates no bridge. The prompt choices include both. `ctxr init --help` output names all four ids.
- [ ] 3.4 Run `npx vitest run test/unit/init-interactive.test.ts` and `npm run build && node dist/bin.js init --help | grep -E "codex.*antigravity|antigravity.*codex"`, and confirm both exit 0.

## 4. Checks

- [ ] 4.1 In `src/core/checks/harness-portability-checks.ts`, change `skillsPathIsHarnessBrandedCheck` to skip an adapter whose declared `skillsDir` equals `DEFAULT_SKILLS_PATH`, and update its doc comment to match the modified requirement.
- [ ] 4.2 Extend `test/unit/harness-portability-checks.test.ts` with the new branded-path scenario.
- [ ] 4.3 Run `npx vitest run test/unit/harness-portability-checks.test.ts test/unit/lint-command.test.ts` and confirm it exits 0.

## 5. Documentation and end-to-end

- [ ] 5.1 README: extend the "Which agent harnesses?" bullet and the layout notes. Add a short "Codex and Antigravity" section covering three things: both read `AGENTS.md` and `.agents/skills/` natively; their read limits, with the version each was measured on and the operator-level `project_doc_max_bytes` remedy for Codex (and the fact that a repo `.codex/config.toml` is not honored for it); and that interactive Codex asks for approval at each git step because its sandbox keeps `.git` read-only. Name the nested-`AGENTS.md` interaction from design.md Risks.
- [ ] 5.2 Run an end-to-end check: `npm run build && node dist/bin.js init --harness codex,antigravity --profile para` in a temp directory (with `CONTEXTURE_BIN` set to the worktree's `dist/bin.js`). Confirm there is no `CLAUDE.md` and no bridged skills directory, and that `node dist/bin.js doctor` exits 0.
- [ ] 5.3 Run `npm run typecheck && npm test` and confirm both exit 0.
- [ ] 5.4 Run `openspec validate support-codex-and-antigravity-harnesses --strict` and confirm it exits 0.
