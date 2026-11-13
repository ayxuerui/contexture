## Why

A member working in claude.ai or ChatGPT cannot make a page from the store. The `contexture` plugin leaves out `ctxr-publish`. The code gives only "the surface does not offer its steps" as the reason (`MCP_SKILL_FILES` in `src/core/skills.ts`).

Most of those steps are already offered. The `ctxr` tool runs `publish gather`, `publish check` and `publish urls`. `Write` can create a page's files in a session. `session_submit` opens the pull request, whose approval page shows the page's pull request preview. Adding the skill to the plugin's list and running the drift check finds three missing pieces:
- `publish new` and `publish stamp`, which no runner allows;
- `ctxr serve`, which the skill starts locally so the agent can look at the page;
- the page's files. `Read` hides them, because the default published-pages location (`.contexture/publish/`) is inside the default retrieval exclusion `.contexture/`.

Each piece is small. Without them a chat member has two options: hand-write a page that skips the lifespan, filing and stamp rules, or not publish at all.

## What Changes

- **`ctxr-publish` ships in the plugin.**
  - It joins the shared skills, so it is one text that opens with the shared "Which store, and where" section, the same in a store and in the plugin.
  - It gets a typed command, `/contexture:publish`.
  - The ChatGPT plugin carries it too, because both plugins carry the same shared set.
- **`ctxr_write` runs `publish new` and `publish stamp`** inside the member's own session, as in a shell. Both write only under the published-pages location, which the file tools may already change.
- **`Read`, `Grep` and `Glob` reach the published-pages location.**
  - It joins the set that stays readable despite a retrieval exclusion, with the templates, catalog, conventions, log and skills, so an agent can read a page and its sibling stylesheet before editing them.
  - Retrieval (`find`, `gather`) still leaves pages out, as `ctxr-publish` step 7 requires.
- **The two shell-only steps say how they go through the server**, as the shared skills' rule for shell-only steps requires:
  - **Looking at the page** (`ctxr serve` locally). Through the server, the agent gives the person the session's preview address that `publish new` and `publish check` report. If it cannot open that address itself, it says the page has not been checked visually. The reviewer sees the pull request preview on the approval page before anything lands.
  - **Writing a send copy** (`.pdf`, `.docx`, `.xlsx`, `.pptx`). The file tools write text only, so send copies are not made through the server.
- **`ctxr serve` is marked unavailable over MCP**, beside `sync` and `shared-stores sync`, so the drift check accepts the skill's step that names it.
- **The plugin carries `frontend-design` and `eli5`**, the two craft skills step 5 delegates to and every store gets by default (`DEFAULT_VENDORED_SKILLS`).
  - They are the same packaged copies `ctxr init` and `ctxr update` write into a store, from `templates/vendor/<name>/`, unchanged, each with its `LICENSE.txt`.
  - The plugin also carries `THIRD_PARTY_NOTICES.md` for them.
  - In the app they appear as `contexture:frontend-design` and `contexture:eli5`, so they cannot clash with a skill of the same name from another plugin.
  - Step 5 keeps the store's choice: a store that declares a different design or explanation skill has the agent `Read` that one from the store's skills path. Otherwise the agent loads the plugin's copy (design.md D3).

## Non-goals

- **Other vendored skills.** Only the two step 5 names by default ship in the plugin. A store that declares extra vendored skills keeps them in its own skills path, where chat sessions can already `Read` them.
- **Send copies through the server.** That needs a binary-capable write tool, which is its own change with its own size and type limits. Until then a member makes a send copy in a checkout.
- **A screenshot or render tool on the server.** It would let the agent check the page itself, but it means running a browser on the server for every member. The pull request preview on the approval page already puts the page in front of a person before it lands.
- **The `ctxr-derived-artifacts` and `ctxr-organize-audit` skills.** They rebuild generated files or run store-wide audits from a shell. Whether they belong in the plugin is a separate question.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `harness-portability`:
  - The shared skills include `ctxr-publish`.
  - The plugin opens it by `/contexture:publish`.
  - The publish skill's lifespan step is its first numbered step after the shared opening section.
  - The plugin carries the default craft skills, `frontend-design` and `eli5`, with their licenses.
- `remote-access`:
  - `Read`, `Grep` and `Glob` read the published-pages location.
  - `ctxr_write` runs `publish new` and `publish stamp`.

## Impact

- `src/core/skills.ts`: `PUBLISH` joins `MCP_SKILL_FILES`, and the comment above it changes to match.
- `src/core/mcp/tool-map.ts`: `publish new` and `publish stamp` join `CTXR_WRITE_COMMANDS`, and `serve` joins `UNAVAILABLE_COMMANDS`.
- `src/core/mcp/paths.ts`: `publish.path` joins `widenedReadablePrefixes`.
- `src/core/plugin/commands.ts`: `publish` maps to `ctxr-publish`.
- `src/core/plugin/build.ts`: both plugins (Claude and ChatGPT) copy `templates/vendor/<name>/` for each of `DEFAULT_VENDORED_SKILLS` into `skills/<name>/`, without `provenance.json`, and add `THIRD_PARTY_NOTICES.md`.
- `templates/skills/ctxr-publish.md`:
  - step 5 says, through the server, to load the plugin's copy unless the store declares another skill;
  - step 6 says how looking at the page goes through the server;
  - step 8 says send copies are not made through the server.
- `templates/mcp/server-instructions.md`, if it lists what the server cannot do.
- `plugins/contexture/`: regenerated with `ctxr plugin build`, adding `skills/ctxr-publish/SKILL.md`, `skills/frontend-design/`, `skills/eli5/`, `THIRD_PARTY_NOTICES.md` and `commands/publish.md`.
- Tests:
  - `test/unit/skills.test.ts`: the shared-set list, the drift check, and the lifespan-step test, which now has to skip the shared section;
  - `test/unit/mcp-files.test.ts` and `test/unit/mcp-cli.test.ts`: reading a page, and `publish new` in a session.
- Stores pick it up from the next release. A server running an older ctxr refuses `publish new`, and the shared section's older-server rule already tells the agent to say so and skip the step.
- **Sync order.** This change modifies *The shared skills are one text on both surfaces*, which `publish-one-contexture-plugin` adds and `serve-the-second-opinion-to-chat-apps` modifies. Archive it after both.
