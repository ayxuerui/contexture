## 1. The check

- [x] 1.1 Rewrite `checkNoExternalReferences` in `src/commands/publish-check.ts` per D1–D3: walk start tags and their attributes; fail an external `src`, `srcset` candidate, `poster` or `data`, and an external `href` / `*:href` on any element but `<a>` and `<area>`; fail an external CSS `url()` or `@import` anywhere in the file
- [x] 1.2 Add tests to `test/unit/publish-check-command.test.ts`: an `<a href="https://…">` page passes; `<link rel="stylesheet" href="https://…">`, `<img src="https://…">`, an `srcset` candidate, an unquoted `src`, SVG `<use xlink:href>`, an `@import` and a `url()` each fail; the existing `<script src>` test is unchanged
- [x] 1.3 `npx vitest run test/unit/publish-check-command.test.ts` passes

## 2. Skill text

- [x] 2.1 In `templates/skills/ctxr-publish.md` step 6, say the check fails on anything loaded from an external address, and that outbound links are allowed
- [x] 2.2 Check the edit against the shipped-skill word bans

## 3. Whole suite

- [x] 3.1 `npm run build && npm test && npm run typecheck` exit 0
- [x] 3.2 `openspec validate allow-outbound-links-in-published-pages --strict` passes
