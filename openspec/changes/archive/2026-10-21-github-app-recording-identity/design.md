## Context

The motivation is in proposal.md. The current state, after `approve-from-the-review-page`:

- `createGhForgeClient(cwd, env)` runs `gh api` with the environment it is given. `login()` calls `GET /user`.
- `ctxr serve` refuses to start unless `login()` equals `change_approval.recording_login`. `ctxr land` posts
  records only when `login()` equals it.
- `ctxr land` runs `git fetch` and `git push` with whatever credential git has on the host.
- GitHub App facts this design rests on: a JWT signed RS256 with the App's private key (`iss` = App ID, at most
  10 minutes) authenticates as the App. `GET /repos/{owner}/{repo}/installation` finds the installation.
  `POST /app/installations/{id}/access_tokens` returns a token that lasts one hour. `GET /app` returns the slug.
  Installation tokens cannot call `GET /user`, and the App's reviews and comments are authored by
  `<slug>[bot]`. git accepts an installation token as the password for user `x-access-token`.

## Goals / Non-Goals

**Goals:**
- Each store owner can use their own App with no recurring maintenance.
- One credential, the App, is enough for serve and the land runner. No second git or `gh` credential is needed.
- The `GH_TOKEN` path keeps working, unchanged.

**Non-Goals:** see proposal.md.

## Decisions

### D1. Credentials come from `CONTEXTURE_GITHUB_APP_*` variables, read through `RunEnv`

`CONTEXTURE_GITHUB_APP_ID`, plus one of `_PRIVATE_KEY_FILE` or `_PRIVATE_KEY`. They are read from `RunEnv.env`
(the single-source guard forbids reading `process.env` elsewhere). The `CONTEXTURE_` prefix follows the
project's naming for environmental settings. The file form is for Docker secrets and mounted volumes; the inline
form is for platforms that only offer variables. Setting both is refused rather than ordered, because a guessed
precedence would be a silent fallback the fail-loud contract forbids.

*Alternative: keys under `change_approval` in `contexture.yaml`.* Rejected: the config is committed, and even a
path is a fact about one deployment rather than the store.

### D2. App endpoints over `fetch`; everything else stays on `gh`

The three App-authenticated calls (find the installation, mint a token, read the App) use `fetch` against
`https://api.github.com`. They need `Authorization: Bearer <jwt>`. `gh` sends its own authorization header, and
whether `-H` reliably replaces it is not something to depend on. All other calls keep going through `gh api`,
with `GH_TOKEN` set to the installation token for that call. So the review, comment and merge code paths, and
the fake `gh` the tests use, stay exactly as they are.

`owner/repo` for the installation lookup is parsed from the `origin` remote URL (https or ssh, `github.com`
only), read with `git remote get-url`. A URL that is not github.com is refused in App mode with the usage code,
naming the URL, unless `CONTEXTURE_GITHUB_REPOSITORY=owner/repo` names the repository explicitly, for an origin
that is a mirror or a proxy. `CONTEXTURE_GITHUB_API_URL` replaces `https://api.github.com` for a
GitHub-compatible test server; the integration tests use both. Neither variable makes GitHub Enterprise Server a
supported target. `CONTEXTURE_GITHUB_APP_ID` accepts the numeric App ID or the App's client ID, since GitHub
accepts either as the assertion's issuer.

### D3. One credential-source seam, with a refreshing cache for the App

Every forge-using command gets its credential from one place: `resolveForgeCredentials(env)`, which returns a
`ForgeCredentials` of kind `gh` or `github-app`. The kind is a closed union that also names `broker`, reserved
for a hosted contexture App that would hold the key centrally and hand each store a token for its own
repository. Resolving to `broker` is impossible today, because no variable selects it. Adding it later means one
new provider behind the same two methods. Decision records, the review state, the approval routes and
`ctxr land` only ever see `env()` and `login()`, so none of them changes.

*Why reserve a kind nobody can select:* naming it in the union makes the seam's purpose part of the code, and
a future provider has an obvious slot. Building any of it now would be designing a service with no user.

`ForgeCredentials` has two methods. `env()` returns the environment for the next `gh` call. `login()` returns
`<slug>[bot]` in App mode, or `GET /user` through `gh` otherwise. The App provider holds one token and its
expiry. It mints a new one when less than 5 minutes remain, and serializes concurrent refreshes so parallel
calls do not mint twice. The JWT uses `iat` = now − 60 s (for clock skew) and `exp` = now + 9 min. Signing uses
`node:crypto`, which the identity verifier already depends on.

### D4. git gets the token per command, through a credential helper on the command line

`GitRunOptions` gains an optional `env`. In App mode `ctxr land` runs fetch and push as:

```
git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$CTXR_GIT_TOKEN"; }; f' push …
```

with `CTXR_GIT_TOKEN` in that process's environment only. The empty `credential.helper=` first clears the
host's helpers for this one command, so a stale stored credential cannot answer instead. Nothing is written to
the remote URL or any config file, which keeps the store rule "never rewrite the origin URL; it can hold a
credential".

*Alternative: `http.extraHeader` with a basic-auth header.* Rejected: it puts the encoded token on the command
line, where `ps` can read it.

### D5. One App per key holder

A GitHub App is a trust boundary drawn around its private key: whoever holds the key can mint a token for every
installation. So the rule is one App per party that holds the key, not one per store. One operator running
several stores uses one App, made installable on any account and installed on each owner with only that store's
repository selected. "Installable on any account" exposes nothing, because an account's owner must install it
themselves. The installation lookup in D2 is already per repository, so one App with several installations
needs no code. Today the maintainer runs every store, so one App serves pkm (`ayxuerui`) and readyrun-brain
(`ReadyRun-AI`).

*The case for an App per store even for one operator:* a leak, or an agent that reads the key, then reaches only
one store. That case is real, and D6 answers it with placement instead. An operator who cannot meet D6 for some
store should give that store its own App.

### D6. The key lives only where serve and the land runner run

The key file is mounted only into the `ctxr serve` container and the scheduled `ctxr land --pending` runner, and
never into an environment an agent can reach, such as the harness gateway. Agents run shell commands, and with
one App across stores, a readable key gives any agent every store. This is the rule the images README already
applies to `GH_TOKEN`. contexture cannot enforce where a deployment mounts a file, so this is a documented
deployment rule, not a requirement. The mechanism that holds it is the contexture-images compose files.

### D7. Branch protection and the App

GitHub Free cannot protect a private repository owned by a personal account (pkm is one), so on such a store
there is no required review, and `ctxr land`'s consent check is the gate. That is already the design's
enforcement point. Where protection exists, the existing note still applies: leave "require approval of the
most recent reviewable push" off, because the runner pushes a rebase and then approves it as the same identity.

## Risks / Trade-offs

- [The private key never expires, so a leak stays live, and with one App it reaches every store] → The key is
  placed only where D6 allows. The docs name revocation (delete the key on the App's page), which cuts off every
  store at once, and recommend a key file readable only by the container user. Each installation is limited to
  its store's repository and three permissions.
- [Clock skew makes GitHub reject the JWT] → `iat` is backdated 60 s, as GitHub recommends. A rejection is
  reported with GitHub's message.
- [A long `ctxr land` run outlives a token] → Every call goes through `env()`, which refreshes. A push in the
  middle of a run uses whatever token `env()` returns at that moment.
- [Another network client in core] → Like the JWKS fetch, it is used only by the commands that already need
  the forge. The offline commands (`doctor`, `init`) never construct it.

## Migration Plan

This is additive. A store on `GH_TOKEN` changes nothing. To move one store to an App: create the App (README),
install it on the store repository, set `recording_login: <slug>[bot]`, give serve and the runner the two
variables, and remove the old token. To roll back, unset the variables and put the token back.
