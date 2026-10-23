## 1. Shared core

- [ ] 1.1 `src/core/session/` with `status`, `submit`, `rebase`, `discard` and the richer list, taking an optional author override; move the MCP surface's idempotent push, publish and remove into it and point `src/core/mcp/sessions.ts` at the core
- [ ] 1.2 `npx vitest run test/unit/session-core.test.ts` passes against a bare origin and the fake `gh`, including retry-after-lost-response, a previously staged derived file, and the discard guards; `npx vitest run test/unit/mcp-capture.test.ts test/unit/mcp-draft.test.ts` still passes on the moved code

## 2. Commands

- [ ] 2.1 `ctxr session status|submit|rebase|discard` and the extended `session list`, with `--json` and the D3 exit codes
- [ ] 2.2 `npx vitest run test/integration/session-commands.test.ts` passes

## 3. Skills

- [ ] 3.1 Reword `templates/skills/ctxr-submit.md` and `ctxr-session-lifecycle.md` around the commands, keeping every judgment section
- [ ] 3.2 `npx vitest run test/unit/skills.test.ts test/unit/skill-affordances.test.ts` passes, with the reworded skills' options resolved against the registered commands

## 4. Whole suite

- [ ] 4.1 `npm run build && npm test && npm run lint` exit 0
- [ ] 4.2 In a scratch store with a bare origin and the fake `gh`, `ctxr session start`, an edit, `ctxr session submit`, then `ctxr session list --json` shows the open pull request; exit codes 0
