## 1. Templates

- [x] 1.1 `templates/notes/Concept.md`: replace `tags: []` with a block sequence naming `Concept`, spelled like the other kinds (`tags:` then `  - Concept`). Leave `templates/notes/Note.md` as `tags: []`.
- [x] 1.2 `test/unit/note-templates.test.ts`: add a test that the base's field is the empty list and every other packaged template's field is a block sequence naming exactly its own template name. Keep the existing spelling test.

## 2. Entry document

- [x] 2.1 `templates/agents/canonical.md`, "Note templates": add that each shipped template other than the base stamps the kind it is for into the note's `tags`, that the agent should keep it and use it to find notes of a kind with its own search because no `ctxr` command filters by it, that a kind cut from the base should stamp its own name the same way, and that further tags are the store's. No tier words; check with `grep -n -i -w -E 'personal|private|public|shared|internal|team|confidential' templates/agents/canonical.md`.
- [x] 2.2 `test/unit/agents-doc.test.ts`: update the canonical-section golden, and assert the section tells the agent to keep the field and search by it, and that no command filters by it.

## 3. Verification

- [x] 3.1 `npm run typecheck`, `npm run build`, and `npx vitest run` pass.
- [x] 3.2 On a scratch store initialized before the change: `ctxr update` reports `.contexture/templates/Concept.md` and `AGENTS.md` changed, the installed Concept template names its kind, and a second update reports nothing changed.
- [x] 3.3 `openspec validate every-template-stamps-its-kind --strict` passes.
