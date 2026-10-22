## 1. Protocol and transport

- [x] 1.1 Add `src/core/mcp/jsonrpc.ts`: parse a JSON-RPC 2.0 request or notification, dispatch `initialize` / `ping` / `tools/list` / `tools/call`, answer `-32601` for anything else, `-32700` / `-32600` for malformed input, and negotiate the protocol version per design.md D2
- [x] 1.2 Add `src/core/mcp/http.ts`: the `node:http` handler for `POST /mcp` (JSON response, 202 for notifications), 405 for `GET`/`DELETE`, the `Origin` check, and a bounded request body
- [x] 1.3 Unit tests for 1.1–1.2 run green under `npx vitest run test/unit/mcp-protocol.test.ts`

## 2. Retire the standalone checkpoint build

- [x] 2.1 Remove `src/commands/mcp-serve.ts`, `src/commands/mcp-member.ts`, `src/core/mcp/state.ts`, `src/core/mcp/pages.ts`, `src/core/mcp/server.ts`, `templates/mcp/authorize.html`, the `mcp` command group in `src/run.ts`, and their tests (`mcp-member`, the access-code parts of `mcp-oauth`, `test/integration/mcp-serve.test.ts`); `npm run typecheck` exits zero

## 3. Configuration, identity and authorisation

- [x] 3.1 Add the optional `mcp` block (`readers`, `capturers`; entries as `change_approval.deciders`) to `src/config/schema.ts` with no `SHIPPED_DEFAULTS` entry and a validation refusing it without `change_approval`, naming both; tests in `test/unit/config-schema.test.ts`
- [x] 3.2 Add membership resolution (verified email → scopes) sharing the decider matching rule, so `@domain` entries admit that domain only
- [x] 3.3 Rework `src/core/mcp/oauth.ts` per design.md D4–D5: `/authorize` verifies the `change_approval.identity` assertion with the existing verifier (401 / 403), renders a consent page (`templates/mcp/consent.html`) naming client, redirect host, store, email and scopes, and issues a code only on a `POST` whose `Origin` is the origin of `serve.base_url`; codes carry the email; tokens carry email and scopes; the signing key is derived by HKDF from the App private key, or random per process with one stderr notice under `gh`'s credential; access codes, the throttle and the members registry removed
- [x] 3.4 Bearer verification narrows a token's scopes to what its email holds in the loaded configuration on every request; `tools/list` filtered by scope; a call to an unreached tool refused as `mcp.insufficient_scope`
- [x] 3.5 Tests with a fake identity key set: registration → authorize (consent `GET`, confirm `POST`) → token → `tools/list`; no assertion 401; non-member 403; foreign-origin confirm refused; plain PKCE, wrong redirect URI and wrong resource refused; code replay (sequential and concurrent) refused; scope widening narrowed; removal from the configuration refuses the next call; expiry; green under `npx vitest run test/unit/mcp-oauth.test.ts`

## 4. The read view, `find`, and the serve integration

- [x] 4.1 Rework `src/core/mcp/sync.ts` per design.md D6: a detached worktree at `<derived cache path>/mcp/view` created on first use (and recreated when missing), fetch of the default branch through the forge credential's git token, forced detached checkout at most once per interval, the view's own graph rebuilt when its commit moves or the graph is absent, restore-and-rebuild on a rebuild failure and `mcp.store_unavailable` when even that fails, the forge's open pull requests read once per sync so pending captures are the inbox files of session branches with an open pull request, the reader-writer lock, `store: {head, sync_error}` on every result; the started checkout never touched
- [x] 4.2 Rework `src/core/mcp/tools/find.ts` to read the view (notes, captures and configuration at the view's commit), with `serve.base_url` note links from the loaded configuration
- [x] 4.3 Keep the stub `capture` (not read-only, reached by the `capture` scope, writes nothing) and the checkpoint notes in the instructions and the capture description
- [x] 4.4 Wire the surface into `src/commands/serve.ts` and `src/core/browse/serving-state.ts`: MCP paths routed ahead of the browsing routes, the method gate extended per the `context-browsing` delta, 404 without the block, 503 when it cannot be built, rebuilt on configuration reload, one stderr line per MCP request (email, method, tool)
- [x] 4.5 Tests: the view follows a pushed note after the interval; the started checkout is untouched while dirty and behind; a call in flight is not split by a sync; a rebuild failure restores the view or refuses; exclusion, path order, unfiled apart from notes, a pending session capture marked pending, map mode; `serve` answers `404`/`405` without the block, a full sign-in and `find` over HTTP with it, and `404` again after the block is removed; green under `npx vitest run test/unit/mcp-find.test.ts test/integration/mcp-serve.test.ts`

## 5. Checkpoint: real clients (operator)

- [x] 5.1 (claude.ai passed; ChatGPT deferred to 11.1; Gemini signed in but called no tool, design.md Checkpoint results) On a store with `change_approval` (pkm): declare `mcp`, exempt `/mcp`, `/token`, `/register` and the `/.well-known/` documents from the access proxy while keeping `/authorize` behind it, add the connector in claude.ai and in ChatGPT developer mode, sign in, and confirm in `serve`'s log that each client completed `tools/list`, one `find` and one call of the stub `capture`. A failure in the transport reopens design.md D2; a failure in sign-in reopens D4; a client that refuses or gates the write tool is decided on before group 7

## 6. `gather`

- [x] 6.1 Add `src/core/mcp/tools/gather.ts`: refuse seeds under the capture root (`mcp.capture_not_filed`), run the pass against the view's notes and graph, attach bodies to a prefix within the byte budget, clip and mark an oversized first note
- [x] 6.2 Add `templates/mcp/gather.md`
- [x] 6.3 Tests: body prefix and clip, the pass's order kept, capture seed refused, a note pushed to the remote returned after the next sync; green under `npx vitest run test/unit/mcp-gather.test.ts`

## 7. `capture` through the approval page

- [x] 7.1 Add `createPull` to `ForgeClient` (`src/core/forge/github.ts`) and to the test fakes
- [x] 7.2 Replace the stub in `src/core/mcp/tools/capture.ts` per design.md D9: under a mutex, force a sync; source check over the view's identity records plus pending session inbox files; required-section precheck; a session worktree started as `ctxr session start` does with label `capture-<slug>`; the inbox file; a commit authored by the member's verified email with a `Captured-by:` trailer; a push through the forge credential's git token; a pull request opened with `createPull`; return the number, the address and the approval page address; a content-derived source id when none is given; resume a capture session that has no open pull request (push if missing, find an open pull request for its head before opening one); remove capture sessions whose pull request closed unmerged
- [x] 7.3 Remove the checkpoint notes from the instructions and the capture description
- [x] 7.4 Tests against a temporary bare remote and a fake forge: a capture yields a session worktree adding one inbox file, authored by the member, with an open pull request the approval index lists as awaiting, and an unchanged remote default branch; a duplicate source id (at the served commit, and on a pending session branch) and a missing required section are refused with nothing created; two simultaneous captures of one source produce one pull request; a push failure, a pull-request failure and a lost pull-request response each resume on retry into exactly one pull request; a capture whose pull request closed unmerged is removed and can be captured again; green under `npx vitest run test/unit/mcp-capture.test.ts`

## 8. Drafts and the file-shaped read tools

- [x] 8.1 Add `editors` to the `mcp` block and the `edit` scope to `members.ts`; consent text for `edit`; schema and scope tests
- [x] 8.2 Add `src/core/mcp/drafts.ts`: the draft locator (the member's `mcp-draft-<email slug>` session worktree, its branch, whether its pull request is open, closed unmerged or merged) and reading a file at the draft's committed tip, used by `Read` and by group 9
- [x] 8.3 Add `src/core/mcp/ripgrep.ts`, the one module that spawns `rg`: Claude Code's Grep parameters mapped to ripgrep flags, `--` before the pattern, `--sort path`, hidden-path exclusions as `--glob '!…'`, a five-second limit and a bounded output; `Glob` via `rg --files --glob`; allow it in the single-source guard
- [x] 8.4 Add `src/core/mcp/tools/files.ts` per design.md D12: `Read` (admitted notes, captures marked, the entry document; `cat -n` numbering, offset/limit, 2,000-line default, long lines truncated; the member's draft version at its committed tip), `Grep` (ripgrep output plus matching pending captures listed apart), `Glob`
- [x] 8.5 Add `templates/mcp/Read.md`, `templates/mcp/Grep.md`, `templates/mcp/Glob.md`
- [x] 8.6 Tests: a range read with numbering; configuration, derived and escaping paths refused; a capture read and marked; a member's draft returned to them only; Grep in each output mode, with context lines and glob filters, path-ordered, exclusions honoured, a pending capture listed apart; Glob path-ordered with exclusions honoured; green under `npx vitest run test/unit/mcp-files.test.ts`

## 9. Draft edits

- [x] 9.1 Add `src/core/mcp/tools/edit.ts` per design.md D13: under the shared mutex, locate or start the member's draft (removing one whose pull request closed unmerged), publish anything unpublished, answer a retry whose effect is already in the draft without a second commit, apply `Edit` (exact match, unique unless `replace_all`, differs) or `Write` (new editable path only, never overwrite), refuse a result that does not parse as a note, rebuild the catalog in the draft, commit authored by the member with an `Edited-by:` trailer, on a hook refusal restore the draft and return the hook's output, push through the forge credential's git token, open a pull request when none is open for the branch, and return the pull request and the approval page address
- [x] 9.2 Add `templates/mcp/Edit.md` and `templates/mcp/Write.md`
- [x] 9.3 Tests against a temporary bare remote and the fake forge: the first edit opens one pull request the approval index lists; Write → Edit → Read of a new note on one pull request; an ambiguous or missing `old_string` and an existing `Write` path change nothing; a push failure and a pull-request failure each resume on retry with exactly one commit; a hook refusal leaves the draft unchanged; configuration, capture-tier and derived paths refused; a reader refused; a draft whose pull request closed is replaced; green under `npx vitest run test/unit/mcp-draft.test.ts`

## 10. Documentation and full suite

- [x] 10.1 README section: the `mcp` block and its dependence on `change_approval`; the exact paths to exempt from the access proxy and the one (`/authorize`) to keep behind it; adding the connector in Claude and ChatGPT; what a member sees (consent page, captures awaiting approval); that rotating the App key signs everyone out
- [x] 10.2 `npm run typecheck`, `npm run build` and `npm test` all exit zero, and `openspec validate serve-the-store-over-mcp --strict` passes

## 11. Final verification against real clients (operator)

- [ ] 11.1 Repeat 5.1 with `gather`, `capture`, `Read`, `Grep`, `Glob`, `Edit` and `Write`, and run ChatGPT developer mode (deferred from 5.1): confirm one call of each from claude.ai and from ChatGPT in `serve`'s log, that the capture appeared on the approval page, and that approving it landed it
