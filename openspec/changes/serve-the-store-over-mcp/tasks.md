## 1. Protocol and transport

- [ ] 1.1 Add `src/core/mcp/jsonrpc.ts`: parse a JSON-RPC 2.0 request or notification, dispatch `initialize` / `ping` / `tools/list` / `tools/call`, answer `-32601` for anything else, `-32700` / `-32600` for malformed input, and negotiate the protocol version per design.md D2
- [ ] 1.2 Add `src/core/mcp/http.ts`: the `node:http` handler for `POST /mcp` (JSON response, 202 for notifications), 405 for `GET`/`DELETE`, the `Origin` check of D10, and a bounded request body
- [ ] 1.3 Unit tests for 1.1–1.2 run green under `npx vitest run test/unit/mcp-protocol.test.ts`

## 2. State, membership and authorisation

- [ ] 2.1 Add `src/core/mcp/state.ts`: resolve the state directory (default, `--state-dir`, refusal inside the store root), the 0600 atomic `members.json` written only by the member CLI and reloaded by the server on mtime change, and `signing.key` created with an exclusive create
- [ ] 2.2 Add Crockford-base32 access-code generation, SHA-256 hashing, and random member ids
- [ ] 2.3 Add `src/commands/mcp-member.ts` (`add <name> --scope <list> [--email]`, `remove <name>`, `list`) and register the `mcp member` group in `src/run.ts`
- [ ] 2.4 Add `src/core/mcp/oauth.ts` per design.md D3: metadata endpoints, stateless dynamic registration (signed client id over redirect URIs), `/authorize` GET form and POST code check with per-address throttling, `/token` for `authorization_code` only (PKCE S256, exact redirect URI, `resource` check, signed ten-minute codes with a nonce made single use by an in-memory spent set and a per-process signing nonce), signed 30-day access tokens; nothing persisted; the throttle keyed on the socket peer, or on `X-Forwarded-For` only under `--trust-proxy` with a loopback peer
- [ ] 2.5 Bearer verification for `/mcp`: 401 with the `resource_metadata` challenge, scope narrowing at grant, membership and scope re-checked on every `tools/call`, `tools/list` filtered by scope
- [ ] 2.6 Add `templates/mcp/authorize.html`, read at render time with `__UPPER_SNAKE__` placeholders
- [ ] 2.7 Tests: `member add` returns a code once, `list` never shows a code or hash, a state dir inside the store is refused; a full registration → authorize → token → `tools/list` flow; plain-PKCE refusal, wrong redirect URI, wrong code, scope widening, refusal after removal, no revival after re-adding the same name, code replay (sequential and concurrent) refused, and the throttle keyed both with and without `--trust-proxy`; green under `npx vitest run test/unit/mcp-member.test.ts test/unit/mcp-oauth.test.ts`

## 3. `find` and the serve command

- [ ] 3.1 Add `src/core/mcp/sync.ts`: startup checks (default branch, clean worktree outside derived paths), throttled fetch of the default branch and `capture/*` refs plus `merge --ff-only`, graph rebuild when `HEAD` moves or the graph is absent, reset-and-rebuild on a rebuild failure and `mcp.store_unavailable` when even that fails, pending refs defined by ancestry, the reader-writer lock of design.md D8, and `store: {head, sync_error}` on every tool result
- [ ] 3.2 Add `src/core/mcp/tools/find.ts`: literal case-insensitive matching over `listNotes`, plus captures in `listCaptures` and inbox files on pending `capture/*` refs into `unfiled` (with `pending_merge` and branch), up to three clipped lines per hit, path order, `max` with the omitted count, catalog map when no text, `serve.base_url` links
- [ ] 3.3 Add `templates/mcp/server-instructions.md` and `templates/mcp/find.md`
- [ ] 3.4 Add `src/commands/mcp-serve.ts` with `--host`, `--port`, `--public-url`, `--state-dir`, `--pull-interval`, `--gather-max-bytes`, `--trust-proxy`, `--no-auth`; usage errors for a wide bind without `--public-url` and for `--no-auth` off loopback; one envelope once listening; register it in `src/run.ts`
- [ ] 3.5 Register a stub `capture` tool (not marked read-only, reached by the `capture` scope) that validates its input and writes nothing, so the checkpoint exercises a write tool
- [ ] 3.6 Tests: exclusion honoured, path order, unfiled apart from notes, a pending-branch capture marked pending, map mode, a call in flight not split by a sync, a graph-rebuild failure after a fast-forward restoring both or refusing calls, a merged `capture/` branch no longer pending, and an over-HTTP end-to-end `find` after the OAuth flow; green under `npx vitest run test/unit/mcp-find.test.ts test/integration/mcp-serve.test.ts`

## 4. Checkpoint: real clients (operator)

- [ ] 4.1 Expose a test store at a public HTTPS URL, add it as a custom connector in claude.ai and in ChatGPT developer mode, sign in with a member code, and confirm in the server log that each client completed `tools/list`, one `find` and one call of the stub `capture`. If ChatGPT refuses or gates a write tool, reconsider the `capture` scope for that vendor before group 6. A failure in the transport reopens design.md D2 (switch to the SDK), and a failure in authorisation reopens D3, before groups 5–6 are built

## 5. `gather`

- [ ] 5.1 Add `src/core/mcp/tools/gather.ts`: refuse seeds under the capture root (`mcp.capture_not_filed`), run the existing pass, attach bodies to a prefix within the byte budget, clip and mark an oversized first note
- [ ] 5.2 Add `templates/mcp/gather.md`
- [ ] 5.3 Tests: body prefix and clip, the pass's order kept, capture seed refused, a note pushed to the remote returned after the next sync; green under `npx vitest run test/unit/mcp-gather.test.ts`

## 6. `capture` and the merge gate

- [ ] 6.1 Add `src/core/mcp/tools/capture.ts`: the source check over default-branch identity records plus pending `capture/*` inbox files, the required-section precheck, branch and filename sharing one random id per design.md D5, a worktree under the state dir, a commit with the `Captured-by:` trailer, pushing the branch through `GitRunner`, removing the worktree, all under a capture mutex that re-fetches after acquiring; never touching the default branch; replacing the stub from 3.5
- [ ] 6.2 Add `templates/mcp/capture.md`, a tool description carrying the capture rules in short form
- [ ] 6.3 Add `src/commands/mcp-check-branch.ts` (`--base <ref>`): configuration read from `<ref>`; one finding per non-add change, path outside the inbox, non-markdown file, missing identity fields, ingest-assigned fields present, or missing required section; register it in `src/run.ts`
- [ ] 6.4 Tests against a temporary bare remote: a capture lands on `capture/…` with one new inbox file and the trailer while the remote default branch is unchanged; a duplicate source id (on the default branch, and on a pending branch) and a missing required section are refused with no branch; two simultaneous captures of one source id produce one branch; a deleted rejected branch no longer blocks a recapture; `check-branch` passes the server's own branch and fails an edited note, a pre-stamped capture, and a branch that moves the inbox path in `contexture.yaml`; green under `npx vitest run test/unit/mcp-capture.test.ts`

## 7. Documentation and full suite

- [ ] 7.1 README section: hosting (a dedicated clone, a git identity, a bot credential limited to `capture/**` **without the workflows permission**, branch protection on the default branch, Tailscale Funnel or a reverse proxy), adding the connector in Claude and ChatGPT, issuing member codes, `--trust-proxy` behind Funnel or a proxy, and the sample workflow that runs `ctxr mcp check-branch`, merges with `--match-head-commit`, and deletes the `capture/` branch when the gate fails or its pull request closes, with its GitHub-specific precondition stated
- [ ] 7.2 `npm run typecheck`, `npm run build` and `npm test` all exit zero, and `openspec validate serve-the-store-over-mcp --strict` passes

## 8. Final verification against real clients (operator)

- [ ] 8.1 Repeat 4.1 with `gather` and `capture`: confirm one call of each from claude.ai and from ChatGPT in the server log, and that the store's CI merged the resulting `capture/` branch
