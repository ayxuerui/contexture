## 1. `ctxr sync`

- [ ] 1.1 Add `src/commands/sync.ts`: take landing's repository lock, fetch the default branch through landing's authenticated fetch, apply `fastForwardIfSafe`, report the outcome as `canonical_sync`; exit with the setup/usage code when the fetch fails
- [ ] 1.2 Register `ctxr sync` in `src/run.ts`
- [ ] 1.3 Integration tests against a local bare origin: behind clone fast-forwarded; dirty, wrong-branch and diverged clones left alone with the success code; unreachable origin exits with the setup/usage code; nothing under `shared/` touched
- [ ] 1.4 Add `--every <minutes>`: loop until stopped, each round the canonical sync then `shared-stores sync`; report a failed round on stderr and keep going
- [ ] 1.5 Tests: rounds fast-forward the clone and a mount; a failed round does not stop the loop
- [ ] 1.6 Run `npx vitest run -t "ctxr sync"` and confirm it exits 0

## 2. `serve.sync_minutes`

- [x] 2.1 Add `sync_minutes` (positive integer) to the `serve` block of `StoreConfigSchema`; absent resolves to 5 from a constant in `config/defaults.ts`
- [x] 2.2 Unit tests: absent means 5; 0, negative and fractional values are refused naming the key
- [x] 2.3 Run `npx vitest run test/unit/config-schema.test.ts` and confirm it exits 0

## 3. The store-update runner

- [ ] 3.1 Generalize `core/approval/lander.ts` into a store-update runner that runs `land --pending` when the loaded configuration turns landing on and `sync` otherwise, with the interval from `serve.sync_minutes`, never two at once, output prefixed by the run
- [ ] 3.2 Make `serve` always start the runner and re-read the run kind and interval when the configuration reloads
- [ ] 3.3 Integration tests: a store without `change_approval` serves a change merged on the origin after one interval; a store with approval runs only landing; a failing run leaves routes unchanged
- [ ] 3.4 Run `npx vitest run -t "serve"` and confirm it exits 0

## 4. Pull request previews

- [ ] 4.1 Add `/preview/pull/<number>/` to `serve`: read the pull request's head from the forge (reusing it for at most 15 seconds), fetch it into a private ref namespace when missing, and serve only published pages from that commit; redirect a merged pull request's page to its `/publish/` address; `404` for a pull request closed without merging or unknown
- [ ] 4.2 Have `ctxr session submit` and the approval pages report the `/preview/pull/<number>/` address for a store with `serve.base_url`
- [ ] 4.3 Integration tests against the fake forge: a page from a branch pushed elsewhere previews byte-identical to `/publish/`; a new push shows after the reuse window; a merged pull request redirects to `/publish/`; one closed unmerged is `404`; notes stay unaddressable
- [ ] 4.4 Run `npx vitest run -t "preview"` and confirm it exits 0

## 5. The webhook

- [ ] 5.1 Add `POST /hooks/github`: present only with `CONTEXTURE_WEBHOOK_SECRET` or `CONTEXTURE_WEBHOOK_SECRET_FILE`; verify `X-Hub-Signature-256` in constant time; `401` otherwise; a push to the default branch triggers the store-update runner, any other push fetches that branch
- [ ] 5.2 Update the read-only-methods guard to admit that `POST` only with a secret
- [ ] 5.3 Integration tests: signed default-branch push starts a run; signed branch push prefetches; unsigned and wrongly signed deliveries do nothing; without a secret the route is `405`
- [ ] 5.4 Run `npx vitest run -t "webhook"` and confirm it exits 0

## 6. Fetch failures and git hardening

- [ ] 6.1 Make the shared canonical sync check its fetch's exit status first, and report a failed fetch as not synced with git's first error line, in `land` and `sync`
- [ ] 6.2 Run every git command of `land`, `sync` and the runner with `core.hooksPath` set to an empty directory, `core.fsmonitor=false`, and each repository-declared `filter.*`, `diff.*.command`/`textconv` and `merge.*.driver` blanked
- [ ] 6.3 Tests: a failed fetch with a stale `origin/main` equal to HEAD reports not synced; a planted `post-merge` hook and a declared filter driver do not run during a landing fast-forward
- [ ] 6.4 Run `npx vitest run -t "land|ctxr sync"` and confirm it exits 0

## 7. Docs and end to end

- [ ] 7.1 README: `ctxr sync` in the command reference; the serving section covers the timer, pull request previews, and the webhook with its repository setting, its secret, and the exact Access bypass
- [ ] 7.2 Run `npm run build && npx vitest run` and confirm both exit 0
- [ ] 7.3 Run `openspec validate serve-keeps-its-clone-current --strict` and confirm it reports the change valid
