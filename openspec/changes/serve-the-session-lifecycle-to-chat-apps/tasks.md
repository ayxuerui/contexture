## 1. Sessions and ownership

- [ ] 1.1 Ownership record under `.contexture/cache/mcp/sessions.json` (atomic write under the write mutex), draft adoption by label, per-member cap; unit tests
- [ ] 1.2 `session_start`, `session_list` (with review state), `session_status`; `npx vitest run test/unit/mcp-sessions.test.ts` passes

## 2. File tools over session roots

- [ ] 2.1 Session-root path resolution in `files.ts`; widened readable set (templates, conventions, log, skills); `Read`/`Grep`/`Glob` read a session's working tree
- [ ] 2.2 Rewrite `Edit`/`Write` to change the working tree only; add `Move` and `Delete`; refuse configuration, `.githooks/`, `.git*`, derived, worktrees and managed skills paths; remove the draft code path
- [ ] 2.3 `npx vitest run test/unit/mcp-files.test.ts test/unit/mcp-edit.test.ts` passes, including the hook-write refusal and the uncommitted-rest scenarios

## 3. Submit, rebase, discard

- [ ] 3.1 `submit`: stage, `ctxr doctor` gate, commit as member, branch rename, push (with lease after rewrite), open or update the pull request, idempotent retry
- [ ] 3.2 `session_rebase` (start, continue, abort, conflicting paths with both sides) and `session_discard`
- [ ] 3.3 `npx vitest run test/unit/mcp-submit.test.ts` passes against the fake `gh`

## 4. CLI command tools

- [ ] 4.1 `ctxr` and `ctxr_write`: allowlists in one module, argv spawn of the server's own CLI, root-option and path-escape refusal, stripped environment, `@input`, time and output bounds
- [ ] 4.2 Measure `ctxr doctor` and `ctxr lint` on a pkm-sized fixture to set the time bound; `npx vitest run test/unit/mcp-cli.test.ts` passes

## 5. Annotations and instructions

- [ ] 5.1 Per-tool annotations in the tool definitions; update `templates/mcp/server-instructions.md` and per-tool prose for sessions
- [ ] 5.2 `npx vitest run test/unit/mcp-protocol.test.ts` asserts every tool carries all hints

## 6. Skill rendering for the MCP surface

- [ ] 6.1 Extract the When, anti-trigger and Routes partials from `ctxr-submit` and `ctxr-session-lifecycle`; CLI render byte-identical (`npx vitest run test/unit/skills.test.ts`)
- [ ] 6.2 `templates/skills/mcp/_preamble.md`, `ctxr-session-lifecycle.md`, `ctxr-submit.md`; `renderSkills(config, 'mcp')` with the included subset
- [ ] 6.3 Drift check over the MCP render (tools, allowlists, git/gh mapping) fails on a seeded bad skill and passes on the shipped set

## 7. Plugin build and download page

- [ ] 7.1 `templates/plugin/` manifests and readme; `ctxr plugin build` writing both directories and archives; manifest-shape test; `npx vitest run test/unit/plugin-build.test.ts`
- [ ] 7.2 `/plugin/` page and archive routes in `serve` behind the identity check; `npx vitest run test/integration/mcp-serve.test.ts`

## 8. Whole suite

- [ ] 8.1 `npm run build && npm test && npm run lint` exit 0; README "Connecting chat apps" updated for the plugin

## 9. Real clients (operator checkpoint)

- [ ] 9.1 Deploy to pkm; time `ctxr doctor` through `ctxr` on pkm and confirm it is under the bound
- [ ] 9.2 Install the downloaded plugin in claude.ai and in ChatGPT; in each, start a session, edit, submit with a written description, see it on the approval page, request changes, answer them, and approve; confirm each call in `serve`'s log (carries 2026-10-23-serve-the-store-over-mcp task 11.1)
