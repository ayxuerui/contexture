## 1. Migration recipe

- [x] 1.1 Rewrite "Moves at scale" in `templates/skills/ctxr-organize-audit.md` as the five-step recipe.
- [x] 1.2 Add a test in `test/unit/skills.test.ts` asserting the five steps appear in order.
- [x] 1.3 Run `npm run typecheck && npm test` and `openspec validate organize-audit-carries-the-migration-recipe --strict`, and confirm both exit 0.
