## 1. Sessions and ownership

- [ ] 1.1 Ownership record under `.contexture/cache/mcp/sessions.json` (atomic write under the write mutex), draft adoption by label, per-member cap; unit tests
- [ ] 1.2 `session_start`, `session_list`, `session_status` over `src/core/session/` (from `bring-the-session-lifecycle-into-the-cli`); `npx vitest run test/unit/mcp-sessions.test.ts` passes

## 2. File tools over session roots

- [ ] 2.1 Session-root path resolution in `files.ts`; widened readable set (templates, conventions, log, skills); `Read`/`Grep`/`Glob` read a session's working tree
- [ ] 2.2 Rewrite `Edit`/`Write` to change the working tree only; add `Move` and `Delete`; refuse configuration, `.githooks/`, `.git*`, derived, worktrees and managed skills paths; remove the draft code path
- [ ] 2.3 `npx vitest run test/unit/mcp-files.test.ts test/unit/mcp-edit.test.ts` passes, including the hook-write refusal and the uncommitted-rest scenarios

## 3. Submit, rebase, discard

- [ ] 3.1 `session_submit` over the core submit with the member as author
- [ ] 3.2 `session_rebase` and `session_discard` over the core, confined to owned sessions
- [ ] 3.3 Port `capture` onto the `session_start` and `session_submit` core with an ownership record; its sessions are listed by `session_list` and count against the cap; delete the draft helpers in `src/core/mcp/sessions.ts` once nothing calls them
- [ ] 3.4 `npx vitest run test/unit/mcp-submit.test.ts test/unit/mcp-capture.test.ts` passes against the fake `gh`

## 4. CLI command tools

- [ ] 4.1 The command-to-tool mapping module (session tools, `ctxr`, `ctxr_write`) as the one source for tools, preamble and checks; `ctxr` and `ctxr_write` over it, argv spawn of the server's own CLI, root-option and path-escape refusal, stripped environment, `@input`, time and output bounds
- [ ] 4.2 Measure `ctxr doctor` and `ctxr lint` on a pkm-sized fixture to set the time bound; `npx vitest run test/unit/mcp-cli.test.ts` passes

## 5. Annotations and instructions

- [ ] 5.1 Per-tool annotations in the tool definitions; update `templates/mcp/server-instructions.md` and per-tool prose for sessions
- [ ] 5.2 `npx vitest run test/unit/mcp-protocol.test.ts` asserts every tool carries all hints
- [ ] 5.3 Tool/command alignment check (D9) over the tool and command registries and the mapping module, with `session` as the one permitted extra field; fails on a seeded unmatched tool and passes on the shipped set

## 6. Skill rendering for the MCP surface

- [ ] 6.1 `renderSkills(config, 'mcp')`: the included subset from the CLI templates; CLI render byte-identical (`npx vitest run test/unit/skills.test.ts`)
- [ ] 6.2 `templates/skills/mcp/_preamble.md` with the command-to-tool and git-verb mapping tables
- [ ] 6.3 Drift check over the MCP render (tools, allowlists, git/gh mapping) fails on a seeded bad skill and passes on the shipped set

## 7. Plugin build and download page

- [ ] 7.1 `templates/plugin/` manifests and readme; `ctxr plugin build` writing both directories and archives; manifest-shape test; `npx vitest run test/unit/plugin-build.test.ts`
- [ ] 7.2 `/plugin/` page and archive routes in `serve` behind the identity check; `npx vitest run test/integration/mcp-serve.test.ts`

## 8. Whole suite

- [ ] 8.1 `npm run build && npm test && npm run lint` exit 0; README "Connecting chat apps" updated for the plugin

## 9. Real clients (operator checkpoint)

- [ ] 9.1 Deploy to pkm; time `ctxr doctor` through `ctxr` on pkm and confirm it is under the bound
- [ ] 9.2 Install the downloaded plugin in claude.ai and in ChatGPT; in each, start a session, edit, submit with a written description, see it on the approval page, request changes, answer them, and approve; confirm each call in `serve`'s log (carries 2026-10-23-serve-the-store-over-mcp task 11.1)
