## 1. Credential provider

- [x] 1.1 Add `src/core/forge/credentials.ts` as the one credential-source seam (D3): a `ForgeCredentials` interface (`kind`, `env()`, `login()`) whose kind union is `'gh' | 'github-app' | 'broker'`, with `broker` reserved and unreachable; resolve the kind from `RunEnv.env` (D1), with usage errors for a partial credential, two key sources, an unreadable key file and a key that is not an RSA private key; unit tests for each refusal and for "no variables, gh mode"
- [x] 1.2 Add App assertion signing (RS256, `iat` −60 s, `exp` +9 min), `origin` parsing for github.com https and ssh URLs (refusing other hosts in App mode), installation lookup, token exchange and `GET /app` over an injectable `fetch`; unit tests against a fake `fetch` that verifies the assertion's signature with the public key
- [x] 1.3 Add the refreshing cache (reuse while ≥5 minutes remain, refresh below, one refresh in flight at a time); unit tests with an injected clock covering reuse, refresh and concurrent callers
- [x] 1.4 `npm test -- credentials` passes

## 2. Forge client and commands

- [x] 2.1 Make `createGhForgeClient` take a credential provider: each `gh api` call runs with `env()`; `login()` delegates to the provider; keep the existing tests green against the gh provider
- [x] 2.2 Use the provider in `serve` (startup check), `review list` and `land` (`canRecord`), and add `credential: 'github-app' | 'gh'` to each envelope's data; integration test that a `--json` run in App mode contains no key, assertion or token text
- [x] 2.3 Integration test for serve's startup check in App mode: matching `<slug>[bot]` starts, a mismatch exits before binding naming both (fake `fetch` endpoint served locally, fake `gh` for the rest)
- [x] 2.4 `npm test -- forge serve-approve review-list` passes

## 3. Git transport for land

- [x] 3.1 Add an optional per-call `env` to `GitRunOptions` and pass it through in `createExecFileGitRunner`
- [x] 3.2 In App mode, run `land`'s fetches and pushes with the cleared-then-set credential helper and `CTXR_GIT_TOKEN` in that process's environment only (D4)
- [x] 3.3 Integration test: an origin served over HTTP behind a basic-auth check that accepts only `x-access-token` and the minted token; `ctxr land` with only the App credential fetches, pushes a carried-over rebase and merges; afterwards `git remote get-url origin`, `.git/config` and the output contain no token
- [x] 3.4 `npm test -- land` passes

## 4. Docs and close-out

- [x] 4.1 Add `templates/approve/github-app-manifest.json` (no webhook, no user authorization, Contents, Pull requests and Issues read and write, metadata read, `public: false` by default) and a README "Recording identity" section covering both paths, the App settings, the variables, `recording_login: <slug>[bot]`, one App per key holder (set it installable on any account to serve one operator's stores under several owners, selecting only each store's repository), the key-placement rule (only serve and the land runner, never an agent-reachable environment), revoking a key, the Free-plan note and the branch-protection note
- [x] 4.2 `npm run build && npm test && openspec validate github-app-recording-identity --strict` all exit 0
