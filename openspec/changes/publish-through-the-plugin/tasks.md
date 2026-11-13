# Tasks

## 1. The server runs and reads what publishing needs

- [x] 1.1 Add `publish new` and `publish stamp` to `CTXR_WRITE_COMMANDS` in `src/core/mcp/tool-map.ts`, and `serve` to `UNAVAILABLE_COMMANDS` with its reason in the comment (D2, D4).
- [x] 1.2 Add `config.publish.path` to `widenedReadablePrefixes` in `src/core/mcp/paths.ts` (D3).
- [x] 1.3 Tests in `test/unit/mcp-files.test.ts`:
  - `Read` of a page's `index.html` and `Glob` of the published-pages location succeed under the default `.contexture/` exclusion;
  - `find` and `gather` still return no published page.
- [x] 1.4 Tests in `test/unit/mcp-cli.test.ts`:
  - `ctxr_write ["publish", "new", "--disposable", "weekly-review"]` in a session creates the dated folder and README and returns its preview address;
  - the same call with no session is refused;
  - `publish stamp` followed by `ctxr ["publish", "check", …]` reports no `represented-note-hash` failure.
- [x] 1.5 Run `npx vitest run test/unit/mcp-files.test.ts test/unit/mcp-cli.test.ts test/unit/mcp-tool-alignment.test.ts` and confirm exit code 0.

## 2. The skill reaches the plugin

- [x] 2.1 Add `PUBLISH` to `MCP_SKILL_FILES` in `src/core/skills.ts`, and update the comment above it so it no longer lists publish among the skills left out (D1).
- [x] 2.2 In `templates/skills/ctxr-publish.md`:
  - step 5 says, through the store's server, to load the plugin's `frontend-design` and `eli5` unless the store declares a different skill, which is then read from the store's skills path;
  - step 6 says how a page is looked at through the store's server;
  - step 8 says send copies are not made through it (D4).
  - Check the wording against the shipped-skills banned words before saving.
- [x] 2.3 In `src/core/plugin/build.ts`, copy `SKILL.md` and `LICENSE.txt` from `templates/vendor/<name>/` for each of `DEFAULT_VENDORED_SKILLS` into `skills/<name>/` of both plugins, and write `THIRD_PARTY_NOTICES.md` at each plugin's root. Extend `test/unit/plugin-build.test.ts` and `test/unit/plugin-committed.test.ts` to compare the copies with the packaged ones (D3).
- [x] 2.4 Map `publish` to `ctxr-publish` in `src/core/plugin/commands.ts` (D5).
- [x] 2.5 In `test/unit/skills.test.ts`:
  - the shared-set list includes `ctxr-publish`;
  - the lifespan-step test checks the slice after the shared section (D6);
  - new assertions cover the two step-level sentences.
- [x] 2.6 Run `npx vitest run test/unit/skills.test.ts test/unit/plugin-build.test.ts` and confirm exit code 0 with no drift finding.

## 3. Regenerate and check the committed plugin

- [x] 3.1 Run `ctxr plugin build` (from `dist/bin.js` after `npm run build`) and commit the regenerated `plugins/contexture/`, which gains `skills/ctxr-publish/SKILL.md`, `skills/frontend-design/`, `skills/eli5/`, `THIRD_PARTY_NOTICES.md` and `commands/publish.md`.
- [x] 3.2 Run `npx vitest run test/unit/plugin-committed.test.ts` and confirm exit code 0.
- [x] 3.3 Run `grep -n "publish\|serve" templates/mcp/server-instructions.md`. If the instructions list what the server cannot do, update the list; otherwise leave the file as it is.
- [x] 3.4 Run `npm test` and `npm run lint` (or the repository's equivalents) and confirm exit code 0.

## 4. After the release

- [ ] 4.1 From claude.ai, connected to a store's server running the release, run `/contexture:publish` for a disposable page. Record whether the agent loads `contexture:frontend-design`, and whether it reaches a pull request whose approval page shows the page's preview. Check with `gh pr view <n> --json files` that the files sit under `disposable/<date>-<name>/`.
- [ ] 4.2 Archive after `publish-one-contexture-plugin` and `serve-the-second-opinion-to-chat-apps`, which add and modify *The shared skills are one text on both surfaces*. Check the synced requirement both ways with `grep -n "publish skill SHALL be one of them\|second-opinion skill SHALL be one of them" openspec/specs/harness-portability/spec.md`: both sentences must be present.
