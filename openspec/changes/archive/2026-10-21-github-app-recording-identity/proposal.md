## Why

`approve-from-the-review-page` records decisions, and lands changes, as a recording identity whose token sits in
`GH_TOKEN`. In practice that means a machine account per store owner. contexture is heading for 10 to 20 stores
run by owners the maintainer does not control. With a machine account, each owner creates and secures an extra
GitHub account, often pays a seat for it, and rotates its token at least yearly. The usual failure is a missed
rotation, after which approvals and landings silently stop. A GitHub App owned by each store owner has none of
that recurring work: its private key does not expire, its one-hour installation tokens are minted on demand, it
takes no seat, and its permissions are scoped to the repositories it is installed on. contexture cannot use one
today, because the forge client only knows `GH_TOKEN`, and the startup check calls `GET /user`, which App tokens
cannot call.

## What Changes

- The recording identity may be a **GitHub App owned by the store's own owner**. Its App ID and private key come
  from the environment only: `CONTEXTURE_GITHUB_APP_ID`, plus `CONTEXTURE_GITHUB_APP_PRIVATE_KEY_FILE` (a path)
  or `CONTEXTURE_GITHUB_APP_PRIVATE_KEY` (the PEM text). Nothing about it is written to `contexture.yaml` except
  `recording_login`, which is then `<app-slug>[bot]`.
- With those variables set, `ctxr serve`, `ctxr land` and `ctxr review list` authenticate as the App. They find
  the App's installation on the store's repository, mint an installation token from a short-lived signed
  assertion, cache it, and mint a new one before it expires, so a long-running `ctxr serve` keeps working.
  Without them, behaviour is unchanged: `gh` uses `GH_TOKEN` or its own credential file.
- The startup identity check compares `recording_login` with `<slug>[bot]` from the App's own record
  (`GET /app`), instead of calling `GET /user`.
- In App mode, `ctxr land` also fetches and pushes as the App, so a scheduled runner needs no other git
  credential. It passes the token to git only for that one command, and never writes it into a remote URL or a
  git config file.
- Each command's envelope says which kind of credential it used, and never what the credential is.
- The token comes through **one credential-source seam** with a closed set of kinds: `gh` (today's behaviour) and
  `github-app` (the App's own key), both implemented, plus `broker`, which is reserved and not built. A future
  hosted contexture App would plug in there, so that decision records, `ctxr review list`, `ctxr serve` and
  `ctxr land` need no change when it does.
- The docs give the exact App settings (no webhook, no user authorization, repository permissions Contents,
  Pull requests and Issues read and write), a manifest for owners who prefer the manifest flow, and the
  branch-protection note that applies to Apps as much as to accounts.
- The docs state the rule for sharing an App: **one App per party that holds its key**. One operator running
  several stores, even under different GitHub owners, uses one App: it is set to be installable on any account
  and installed on each owner with only that store's repository selected. Today the maintainer runs every store
  (pkm under `ayxuerui`, readyrun-brain under `ReadyRun-AI`), so one App serves all of them. A store run by
  someone else uses that someone's own App.
- The docs state where the key may live: **only in the environments of `ctxr serve` and the scheduled
  `ctxr land --pending` runner**, never in one an agent can reach. Why: agents run shell commands, and with one
  App across stores, an agent that can read the key can act on every store's repository.

## Non-goals

- **A hosted contexture App for stores the maintainer does not run.** Installation tokens are minted with the
  App's private key, so sharing one App with other operators means either giving them the key (then any of them
  can act on every other operator's repositories) or running a hosted token broker that keeps the key and hands
  each store a token for its own repository only. The broker is a security-critical, always-on service. It is
  deferred until outside owners adopt contexture and setup friction is what stops them. This change reserves its
  place (the `broker` credential kind) and builds nothing for it.
- **GitHub Enterprise Server and other forges.** The App endpoints are github.com's. A store on another host
  keeps the `GH_TOKEN` path.
- **Automating App creation.** The manifest flow needs a redirect endpoint to receive GitHub's code. The docs
  describe it, but no `ctxr` command drives it, because creating an App once per owner does not justify a new
  command surface.
- **Rotating the private key.** The key does not expire. Revoking a leaked key is a one-click action in GitHub,
  which the docs name.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `change-approval`: adds that the recording identity may be a GitHub App with environment-only credentials,
  installation discovery, token minting and refresh, and an App-aware identity check.
- `write-lifecycle`: adds that in App mode `ctxr land`'s git transport authenticates as the App, with the token
  scoped to the git command.

## Impact

- New `src/core/forge/credentials.ts`: credential resolution from `RunEnv.env`, App assertion signing (RS256 with
  `node:crypto`), installation discovery and token exchange over `fetch`, and a refreshing cache.
- `src/core/forge/github.ts`: the client takes a credential provider. Each `gh api` call runs with the current
  installation token as `GH_TOKEN`. `login()` comes from the provider.
- `src/core/git/exec.ts`: `GitRunOptions` gains an optional per-call environment, so `land` can hand git a
  credential helper that reads the token from that environment.
- `src/commands/land.ts`, `serve.ts`, `review-list.ts`: use the provider, and report the credential kind.
- README: a "Recording identity" section with both paths and the App settings. A manifest file under
  `templates/approve/`.
- Depends on `approve-from-the-review-page`, which is not yet merged. Land that first.
- contexture-images (follow-up, outside this change): mount the key file and set the two variables for serve and
  the scheduled runner.
