# Tasks

## 1. The scope and the store's list

- [ ] 1.1 Add `second-opinion` to `MCP_SCOPES` and the optional `second_opinion` list to `McpSchema` in `src/config/schema.ts` (person entries, no default, no `SHIPPED_DEFAULTS` entry), and count it in the block's "at least one entry" rule; verify a unit test loads a block holding only `second_opinion` and that `ctxr init` writes no such key.
- [ ] 1.2 Extend `scopesFor` in `src/core/mcp/members.ts` per design.md D1: the list when present, readers when absent, nobody for an empty list; verify unit tests for the three cases.
- [ ] 1.3 Confirm sign-in, the consent page and the per-request narrowing in `oauth.ts` pick the scope up with no change beyond the scope list, and that the consent page names it; verify the sign-in scenario for a person on `second_opinion` alone.
- [ ] 1.4 Run `npx vitest run test/unit/config-schema.test.ts test/unit/mcp-oauth.test.ts test/unit/single-source-literals.test.ts && npm run typecheck` and confirm both exit 0.

## 2. The four tools

- [ ] 2.1 Extend `alignmentProblems` in `src/core/mcp/tool-map.ts` with the text-field rule of design.md D2 (a field `<x>` for an option `<x>_file`); verify a unit test for an allowed field and for the `notes` scenario of the remote-access delta.
- [ ] 2.2 Register `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll` and `second_opinion_result` as `command` tools, and remove the four commands from `CTXR_READ_COMMANDS`; verify the alignment test passes against the CLI's command registry.
- [ ] 2.3 Move `secondOpinionTool` out of `src/core/mcp/tools/cli.ts` into a module of its own that takes only the CLI entry, the environment, the lineup source and the bounds, and builds the argument vector from typed fields (design.md D2); add the four input schemas and `templates/mcp/second_opinion_*.md`; verify the scenarios of *A second opinion runs through four tools of its own*.
- [ ] 2.4 Remove `input` and the second-opinion branch from the `ctxr` tool, and refuse a `second-opinion` argument vector with the tool's name from `routeForCommand` (design.md D3); update `templates/mcp/ctxr.md`; verify both scenarios of the runner requirement.
- [ ] 2.5 Port the existing server tests (time bound, busy refusal, run ownership, confinement, served lineup, OpenRouter key and route) from `ctxr` calls to the new tools, keeping each scenario; run `npx vitest run test/unit/mcp-second-opinion.test.ts test/unit/mcp-cli.test.ts test/unit/mcp-tool-alignment.test.ts && npm run typecheck` and confirm both exit 0.

## 3. What a member without `read` sees

- [ ] 3.1 Build the `initialize` instructions per principal in `src/core/mcp/surface.ts`: the store section only with `read`, else the store's name, the version and the second-opinion paragraph from a new template under `templates/mcp/`; verify the scenario with a layer named `work`.
- [ ] 3.2 Verify `tools/list` for a member holding only `second-opinion` is the four tools, and that `Read`, `find` and `ctxr` are refused as insufficient scope.
- [ ] 3.3 Run `npx vitest run test/unit/mcp-protocol.test.ts test/integration/mcp-serve.test.ts` and confirm it exits 0.

## 4. The second plugin

- [ ] 4.1 Turn the `contexture` plugin's constants in `src/core/plugin/build.ts` and `commands.ts` into a declared list of plugin definitions (name, display name, skills, command map, vendored skills), and add `second-opinion` with the one skill and the `ask` command; verify the plugin-build test for each scenario of the new harness-portability requirement, including the byte-identical skill.
- [ ] 4.2 Make `ctxr plugin build` write both Claude plugins, add the second entry to `.claude-plugin/marketplace.json`, and add the plugin's README template under `templates/plugin/`, which says to install it only without `contexture`; verify `ctxr plugin build --out <tmp>` writes both directories and both archives.
- [ ] 4.3 Extend the committed-plugin test to `plugins/second-opinion/`; run `npm run plugin` and commit the generated directory.
- [ ] 4.4 Let `buildChatgptPlugin` take a plugin definition, and make the connect page in `src/core/plugin/routes.ts` choose the plugin and archive by the member's scopes (design.md D4); verify both connect-page scenarios.
- [ ] 4.5 Run `npx vitest run test/unit/plugin-build.test.ts test/unit/plugin-committed.test.ts test/integration/mcp-serve.test.ts` and confirm it exits 0.

## 5. The skill

- [ ] 5.1 Update `templates/skills/ctxr-second-opinion.md` and `templates/skills/_surfaces.md` per design.md D10, in controlled English with a `Why:` sentence on each changed step, and state the rule for `mcp.second_opinion` (absent means readers, present means the list) in the lineup section; verify the rendered-skill test asserts each statement of the new skill requirement and that the banned-wording test passes.
- [ ] 5.2 Run the drift check over the plugin render and confirm it reports no finding for the second-opinion skill; run `npm run plugin`, then `npx vitest run test/unit/skills.test.ts test/unit/plugin-committed.test.ts` and confirm it exits 0.

## 6. The server with no store

- [ ] 6.1 Add the file's strict schema beside the store schema, built from its parts (design.md D8), and a loader that reports an unknown key by name; verify the three scenarios of the file requirement in the cli-contract delta.
- [ ] 6.2 Split `McpSurface` into the part every surface needs and the part a store adds (design.md D7), with no behaviour change for `ctxr serve`; verify the existing surface and OAuth tests pass unchanged.
- [ ] 6.3 Add the signing-key file under the state directory (design.md D9): created `0600` on first start, refused when readable by another user; verify the restart scenario and the readable-key scenario.
- [ ] 6.4 Add `ctxr second-opinion serve` in `src/commands/second-opinion.ts` and `src/run.ts`, with `store: 'none'`, `--config`, `--port`, `--host` and `--state-dir`, the routes of design.md D7 and the file-following check of D8; verify the scenarios of *A server can offer a second opinion and nothing else* and of the cli-contract command requirement.
- [ ] 6.5 Hand the file's lineup to each run without a store, as a run record carries it, and add `--require-confinement`; verify the file's-lineup scenario with a stub endpoint and the removed-member and broken-file scenarios.
- [ ] 6.6 Verify the server starts and runs a preflight with the App key variables naming unreadable files and with no `git` or `gh` on `PATH`, and add the state directory to the confinement test.
- [ ] 6.7 Add the connect page for this server (the `second-opinion` plugin, the connector address, the ChatGPT archive); verify both scenarios of its requirement.
- [ ] 6.8 Run `npx vitest run test/unit/second-opinion-serve.test.ts test/unit/mcp-protocol.test.ts test/unit/mcp-oauth.test.ts test/integration/mcp-serve.test.ts && npm run typecheck` (the first file is new) and confirm both exit 0.

## 7. Documentation and integration

- [ ] 7.1 Update the README: the `mcp.second_opinion` list and its rule, the four tools, the second plugin, and a section for `ctxr second-opinion serve` with the file, the state directory and what the access proxy in front must protect.
- [ ] 7.2 Run `npm test` and `npm run typecheck`; confirm both exit 0.
- [ ] 7.3 Run `openspec validate offer-the-second-opinion-on-its-own --strict` and confirm it reports the change valid.
- [ ] 7.4 With a real key on a host, start `ctxr second-opinion serve` with a file that routes all three entries through OpenRouter, sign in through the access proxy from one chat app, install the `second-opinion` plugin, and run one critique of a three-step plan; confirm the answers arrive and that `tools/list` shows four tools.

## Workflow follow-up

- Sync `serve-the-second-opinion-to-chat-apps`, `second-opinion-lineup-in-store-config`, `second-opinion-start-and-fetch` and `second-opinion-through-openrouter` into the main specs before this change, in that order, since this change modifies requirements they added.
- Open a contexture-images change that adds a program and a compose service for `ctxr second-opinion serve`, with its own home and the OpenRouter variables.
- The release note says the `ctxr` runner no longer runs a second opinion, names the four tools, and says to update `ctxr` on every host before a store writes `mcp.second_opinion`.
