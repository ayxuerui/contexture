## 1. Config and forge access

- [x] 1.1 Add the optional `ChangeApprovalSchema` (`identity.{header,issuer,audience,jwks_url}`, `deciders`, `recording_login`, optional `resolver` argv, optional `merge_method`) to `src/config/schema.ts` as `.optional()` with no SHIPPED_DEFAULTS entry, plus a superRefine that rejects it without `serve.base_url`; unit tests for the accept, reject and absent cases, including that `ctxr init` writes no `change_approval` key
- [x] 1.2 Add `src/core/forge/github.ts`: one `gh api` exec runner (D10) with pull-by-head-branch, reviews list, review create, comment create, merge, and authenticated login; `test/` stubs `gh` with a script on `PATH`
- [x] 1.3 Add the decision and landing marker format (write and parse, `ctxr-decision v1` and `ctxr-land v1`) and the decision-state resolver (latest review by the recording login, `carried-from` chain, `blocked` from landing comments); table-driven unit tests covering each state, including a marker by another login being ignored
- [x] 1.4 `npm test -- forge decision config` passes

## 2. `ctxr review list`

- [x] 2.1 Implement `src/commands/review-list.ts` over `listSessionWorktreeDirs` + forge reads, with text and `--json` envelope output, and the setup/usage exit when the forge is unreachable; register it in `src/run.ts`
- [x] 2.2 Integration test against a temporary repository with session worktrees and a stubbed `gh`: awaiting, approved, changes-requested (with comment), needs-reapproval, blocked
- [x] 2.3 `npm test -- review-list` passes

## 3. `ctxr land`

- [x] 3.1 Add patch-identity comparison of two commit ranges (`git patch-id --stable`) to `src/core/git/`, with unit tests for an equal and an unequal rebase
- [x] 3.2 Implement `src/commands/land.ts`: state read, refusals (default-branch head, not open), consent (recorded approval or `--confirm`; `--pending` rejects `--confirm`), catch-up rebase in the session worktree or a temporary one, carry-over check and leased push, merge with `merge_method`, read-back confirmation, canonical-clone fast-forward without forcing, worktree and branch reclaim, landing record in a derived cache path written atomically, and posting records only when the credential is the recording login
- [x] 3.3 Conflict path: abort the rebase; with no resolver record `blocked: conflict`; with a resolver run it in the worktree with the playbook prompt and `CTXR_LAND_PR`/`CTXR_LAND_BASE`, check acceptance (no rebase in progress, clean, contains base, `ctxr doctor` passes), leased push, needs-re-approval comment, never merge
- [x] 3.4 Implement `--pending` as a sequential pass over the `approved` pull requests that re-reads each decision immediately before its merge
- [x] 3.5 Integration tests against a real temporary origin + clone and a stubbed `gh`, covering every write-lifecycle scenario in this change (approved lands; no consent no side effect; default branch refused; merge read-back; `--pending` selection; clean carry-over; changed patch; lease refusal; resolver success → needs-reapproval; no resolver → blocked; resolver result failing doctor not pushed)
- [x] 3.6 Register `land` in `src/run.ts`; `npm test -- land` passes

## 4. Identity verification on serve

- [x] 4.1 Add assertion verification (`src/core/browse/identity.ts`): JWT signature against the JWKS (keys cached by `kid`, re-fetch on unknown `kid`, fail closed on fetch failure), issuer, audience, expiry, email claim; decider matching with exact email and `@domain` suffix (no substring match)
- [x] 4.2 Unit tests with a locally generated key pair served from a local JWKS: missing header, wrong key, wrong audience, expired, non-decider, `a@example.com.evil.test` against `@example.com`
- [x] 4.3 `npm test -- identity` passes

## 5. Approval routes

- [x] 5.1 In `src/commands/serve.ts`, at startup with `change_approval` present, check the `gh` login against `recording_login` and exit non-zero naming both before binding
- [x] 5.2 Admit `POST` only for `/approve/<worktree>/decision` when `change_approval` is declared, and keep `405` for every other method and path combination; extend the existing method tests
- [x] 5.3 `GET /approve/` index and `GET /approve/<worktree>` page: reuse the review renderer for the delta facts, add a per-file line diff of committed base→head under the store root (cache paths excluded), the pull request number, full head and decision state, the author's account (title, body rendered as markdown with raw HTML escaped, every commit message in the range) in its own labelled section, the Pages list from the publish-urls report with preview and published links, the landed state from the landing record for a reclaimed worktree, and the `404` behavior when the block is absent; copy and markup in `templates/serve/` (no prose in TypeScript literals)
- [x] 5.4 Decision route: Origin check against `serve.base_url`, head binding against the forge's current head, the request-changes comment requirement, review creation with the marker, read-back, and the moved-head notice page
- [x] 5.5 Integration tests for every change-approval and context-browsing scenario in this change, including the author's account being labelled and separate, a `<script>` in the body arriving escaped, a changed page linking its preview, scripting disabled (assert plain `<form method="post">` and no required script) and an unchanged `git status --porcelain` after rendering
- [x] 5.6 `npm test -- serve` passes

## 6. Skills

- [x] 6.1 Rewrite `templates/skills/ctxr-land.md` over `ctxr land` (target named explicitly, `gh pr view` + `ctxr review list` before acting, gate unless `approved`, `--confirm` only after a go, the conflict playbook then re-run, no `gh pr merge`)
- [x] 6.2 `ctxr-submit.md` hand-off names the approval page address when change approval is declared; `ctxr-session-lifecycle.md` Start runs `ctxr review list` and handles `changes-requested` and `blocked`; check the prose against the banned tier words and flag-attribution rule
- [x] 6.3 Update `test/unit/skills.test.ts` assertions for the three skills, including the new scenarios
- [x] 6.4 `npm test -- skills` passes

## 7. Close-out

- [x] 7.1 Update `openspec/specs/context-browsing/spec.md`'s Purpose so it no longer says the server has no requester concept at all: reads stay requester-free and the `/approve/` routes belong to `change-approval`
- [x] 7.2 Add a README section on enabling change approval (recording identity, config block, scheduled `ctxr land --pending`, branch protection); file the contexture-images follow-up (serve token, scheduled runner, resolver CLI)
- [x] 7.3 `npm run build && npm test && openspec validate approve-from-the-review-page --strict` all exit 0
