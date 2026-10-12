## 1. Mission core

- [x] 1.1 Schema and defaults: `organize.mission_max_bytes` (default 2,048). The renderer omits it at its default.
- [x] 1.2 `templates/agents/mission.md`: the confirmation line. `agents-doc.ts` renders it from `rolled_up` (date part), or "never confirmed". Remove the mission pointer from the canonical section and its template slot.
- [x] 1.3 A doctor check `harness_portability.mission_size` comparing the inlined body's bytes to the budget.
- [x] 1.4 Lint: pass the mission path into `organize.rollup_stale`. Add `organize.mission_past_due` for `due YYYY-MM-DD` dates before today.
- [x] 1.5 Rewrite `templates/skills/ctxr-mission.md` (core, register, log, propose-then-confirm) and its description in `src/core/skills.ts`.
- [x] 1.6 Tests: one per scenario. Update the canonical fixtures, the mission fixtures, and the existing mission-skill assertions.
- [x] 1.7 Run `npm run typecheck && npm test` and `openspec validate a-dated-mission-core --strict`, and confirm all exit 0.
