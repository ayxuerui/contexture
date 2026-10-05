## 1. The shipped wording

- [x] 1.1 `templates/agents/canonical.md`: replace the "Identity and memory" subsection (heading and its one paragraph) with the "Identity and recall" subsection exactly as recorded in design.md D2. Change nothing else in the file. In particular, leave the `__SKILLS_PATH__` placeholder and the `__MISSION_POINTER__` line that follows untouched.
- [x] 1.2 Confirm the new paragraph carries none of the seven banned visibility words (D2): `grep -n -i -w -E 'personal|private|public|shared|internal|team|confidential' templates/agents/canonical.md` prints nothing and exits 1.
- [x] 1.3 Confirm no other shipped or generated prose still uses the broad phrase: `grep -rn -i 'cross-session memory' templates/ src/` prints nothing and exits 1.

## 2. Tests

- [x] 2.1 `test/unit/agents-doc.test.ts`, the "states the harness/store identity boundary for every config fixture" test (~line 211): replace the `cross-session memory` regex with one matching identity, persona and conversational recall in order. Add an assertion that the section states the store's share (matches `/subject-matter knowledge belongs here/i`) and one that it no longer contains `cross-session memory`. Keep the `harness` and no-`identity/` assertions.
- [x] 2.2 Same file, the full canonical-section golden (~line 627): update the heading line to `### Identity and recall` and the paragraph to D2's wording rendered with `skills/`.
- [x] 2.3 `npx vitest run test/unit/agents-doc.test.ts` passes.

## 3. Verification

- [x] 3.1 `npm run typecheck` and `npm run build` exit 0.
- [x] 3.2 `npm test` is green, including `test/unit/skills.test.ts`. That file is unaffected, but it is the tier-word guard D2 refers to.
- [x] 3.3 Run end to end against a scratch store initialized with the pre-change wording. Copy a store whose `AGENTS.md` carries "durable cross-session memory", then run `node dist/bin.js update --root <scratch>`. Its report names `AGENTS.md` as changed, `grep -c 'Identity and recall' <scratch>/AGENTS.md` prints 1, and hand-written content outside the fences is byte-identical. A second `node dist/bin.js update --root <scratch>` reports nothing changed (D4: no migration needed).
- [x] 3.4 `openspec validate narrow-the-harness-memory-boundary --strict` exits 0.
