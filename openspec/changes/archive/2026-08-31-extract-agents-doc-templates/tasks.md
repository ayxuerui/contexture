## 1. Capture the pre-change baseline

- [x] 1.1 Write a throwaway script `scratch/dump-agents-sections.mjs` that imports the five `render*Section` functions from the built `dist/` and prints their `join('\n')` output for the full branch matrix in design.md's Migration Plan step 4, each case preceded by a `### <case-name>` line: default config; a ≥2-layer taxonomy where one layer has a `directory_defaults` entry and one does not; a zero-layer taxonomy; procedure index `[]` and populated (with and without `description`); convention index `[]` and populated; non-default `fields.visibility`, `ingest.inbox_path`, `harness.procedures_path`, `harness.conventions_path`, `visibility.default_context`.
- [x] 1.2 `npm run build && node scratch/dump-agents-sections.mjs > scratch/baseline.txt && wc -l scratch/baseline.txt` — non-empty output, exit 0. This file is the byte-identical oracle for phase 6; do not regenerate it after phase 4 begins.

## 2. Shared template loader

- [x] 2.1 Create `src/core/templates.ts` exporting `packagedTemplate(dir: string, name: string): string` — lift `procedures.ts:21-33` verbatim with the directory as a parameter (`fileURLToPath(new URL('../../templates/' + dir, import.meta.url))`, `readFileSync`, strip exactly one trailing `\n`, cache keyed by `dir/name`).
- [x] 2.2 In the same module, export `substituteBlock(text: string, token: string, lines: readonly string[]): string` — when `lines` is empty, remove the token's entire line (including its newline); otherwise replace the token in place with `lines.join('\n')`. Carry design.md's rationale in a comment: `.replace(token, '')` leaves a stray blank line and breaks byte-identity for an empty index.
- [x] 2.3 Reduce `procedures.ts`'s `skillTemplatesDir`/`skillTemplate` to a one-line wrapper over `packagedTemplate('skills', slug)`; leave `hooks.ts` untouched (async, and must keep the shell scripts' trailing newline).
- [x] 2.4 Add `test/unit/templates.test.ts` covering `substituteBlock` directly: empty list removes the line, single-entry list substitutes in place, multi-entry list joins with `\n`, and a token that appears twice.
- [x] 2.5 `npx tsc --noEmit -p . && npx vitest run test/unit/templates.test.ts test/unit/procedures.test.ts` — all pass.

## 3. Template files

- [x] 3.1 Create `templates/agents/retrieval-leg-routing.md` from `renderLegRoutingSection`'s current output, with `__GRAPH_DOCUMENT_PATH__` for the interpolated constant and `__EXCLUSION_PATHS__` alone on the bullet-list line.
- [x] 3.2 Create `templates/agents/capture-and-ingest.md` from `renderCaptureSection` — pure prose plus `__INBOX_PATH__`, no block token.
- [x] 3.3 Create `templates/agents/placement.md` (non-empty branch) with `__LAYER_LIST__` alone on the list line, and `templates/agents/placement-no-layers.md` (zero-layer branch) with no tokens at all.
- [x] 3.4 Create `templates/agents/canonical.md` with `__CONFIG_FILE_NAME__`, `__VISIBILITY_FIELD__`, `__DEFAULT_CONTEXT__`, `__PROCEDURES_PATH__`, and `__PROCEDURE_INDEX__` as the final line. Collapse the four concatenated source-line fragments (`agents-doc.ts:148-150`, `154-155`, `161-163`, `167-168`) into one long line each — same bytes, readable source.
- [x] 3.5 Create `templates/agents/store-conventions.md` (populated branch, `__CONVENTION_INDEX__`) and `templates/agents/store-conventions-empty.md` (empty branch, `__CONVENTIONS_PATH__`), each ending with the same harness-specific-note paragraph currently held in `HARNESS_SPECIFIC_NOTE_GUIDANCE`.
- [x] 3.6 `ls templates/agents/*.md | wc -l` prints `7`, and `grep -c '' templates/agents/*.md` shows every file non-empty and newline-terminated.

## 4. Rewire the five render functions

- [x] 4.1 Rewrite `renderLegRoutingSection` and `renderCaptureSection` to load their template, apply the scalar/block substitutions, and `.split('\n')`.
- [x] 4.2 Rewrite `renderPlacementSection` and `renderConventionsSection` to keep only the branch predicate — pick the template file, substitute, split. The list-building loops (per-layer `directory_defaults` lookup; per-doc title/path/description line) stay in TypeScript as the block inputs.
- [x] 4.3 Rewrite `renderCanonicalSection` the same way, feeding the scanned procedure list through `substituteBlock`.
- [x] 4.4 Delete the now-unused inline string arrays and the `HARNESS_SPECIFIC_NOTE_GUIDANCE` constant. Confirm no exported signature changed: `git diff -U0 src/core/agents-doc.ts | grep '^[-+]export'` shows no removals or additions of exported names.
- [x] 4.5 `npx tsc --noEmit -p . && npm run build` — both clean.

## 5. Close the graph-document drift risk in the skill templates

- [x] 5.1 Replace the baked literal `.contexture/cache/graph.md` with `__GRAPH_DOCUMENT_PATH__` in `templates/skills/ctxr-connection-finding.md` and `templates/skills/ctxr-ingest-orchestration.md`, and add a `.replaceAll('__GRAPH_DOCUMENT_PATH__', GRAPH_DOCUMENT_RELATIVE_PATH)` to those two seeds' `body()` in `procedures.ts`.
- [x] 5.2 `grep -rn 'contexture/cache/graph.md' templates/ src/ | grep -v 'graph/persist.ts'` returns nothing, and `npx vitest run test/unit/procedures.test.ts` passes unmodified.

## 6. Prove byte-identical output

- [x] 6.1 `npm run build && node scratch/dump-agents-sections.mjs > scratch/after.txt && diff scratch/baseline.txt scratch/after.txt` — must exit 0 with no output. If it does not, the change is not done.
- [x] 6.2 `grep -rn '__[A-Z_]*__' scratch/after.txt` returns nothing — no placeholder survived into rendered output.
- [x] 6.3 Add permanent exact-output assertions to `test/unit/agents-doc.test.ts`: one `expect(lines).toBe(...)` on the full joined string per section, replacing reliance on the existing loose `toContain`/`toMatch` checks (keep those; add alongside). Include the empty-procedure-index case explicitly.
- [x] 6.4 Add the drift test to `test/unit/conventions.test.ts`: extract the trailing harness-specific-note paragraph from both `renderConventionsSection(config, [])` and `renderConventionsSection(config, [oneDoc])` and assert they are byte-identical — this is what keeps the two duplicated templates from diverging.
- [x] 6.5 `npx vitest run test/unit/agents-doc.test.ts test/unit/conventions.test.ts test/unit/verify-command.test.ts` — all pass.
- [x] 6.6 `rm -rf scratch/` — the dump script and snapshots are throwaway, not shipped.

## 7. Full verification

- [x] 7.1 `npm run build && npx tsc --noEmit -p .` — both clean.
- [x] 7.2 `npm pack --dry-run 2>&1 | grep -c 'templates/agents/'` prints `7` — confirms the existing `package.json` `files` entry covers the new directory with no config change.
- [x] 7.3 `npx vitest run --exclude '**/.claude/worktrees/**' --exclude '**/node_modules/**'` — full suite green. The excludes are required: a bare `npx vitest run` picks up stray nested worktrees and reports unrelated failures (see `extract-skill-templates/tasks.md:36`).
- [x] 7.4 `openspec validate --change extract-agents-doc-templates` — exits 0.

## 8. Land it

- [x] 8.1 Commit on this branch. Do not push until told to.
