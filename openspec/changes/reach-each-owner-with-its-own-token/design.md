## Context

See proposal.md for why. What the approach builds on:

- **One credential source per command.** `src/core/forge/credentials.ts` resolves a command's forge credential:
  `gh` (whatever `gh` holds, `GH_TOKEN` or its credential file) or `github-app` (installation tokens minted from a
  key in the environment). `broker` is reserved. `createGhForgeClient` runs every `gh api` call with the
  environment the credential hands it. In App mode that environment carries `GH_TOKEN`.
- **git's side follows the credential only in App mode.** `runRemoteGit` clears git's credential helpers for one
  command and installs one that answers with the token from that process's environment (`CTXR_GIT_TOKEN`). In `gh`
  mode it runs git unchanged, and git asks whatever helper the host configured. On the harness image that is
  `gh auth git-credential`, which answers with the same single token `gh` holds for github.com.
- **Mounts are addressed through their own clone.** `storeForges` resolves a credential per store root, so a
  mount's forge client and git transport already differ from the home store's. In App mode the mount's
  installation is found from the mount clone's `origin`.
- **Not every remote git call goes through `runRemoteGit`.** `ctxr shared-stores sync` clones and fetches with
  plain git. `ctxr session start` fetches the default branch with plain git and, when that fails, quietly cuts the
  session from the local branch. `ctxr update`'s `ls-remote` is plain too.
- **What GitHub allows.** A fine-grained personal access token has one resource owner, a user or an
  organization, and a list of repositories under it. `gh` keys its stored accounts by host and login, so it cannot
  hold two tokens for the same login on github.com. GitHub accepts a personal access token as the password of an
  https git request with any username.
- **What git allows.** `credential.<url>.helper` matches by URL prefix, path segments included (verified with
  git 2.43: `credential.https://github.com/acme.helper` answers for `https://github.com/acme/repo.git` without
  `useHttpPath`). The path match is case-sensitive, and GitHub owners are not.

## Goals / Non-Goals

**Goals:**
- An agent reaches a mounted store owned by another GitHub owner with a token scoped to that owner only.
- `gh` and git use the same token for the same repository, by construction.
- A store with one owner, or a machine with no extra tokens, behaves exactly as today.
- No token is ever printed, logged, written into a store, a remote URL or a git configuration file.
- `serve` in App mode is unaffected.

**Non-Goals:** see the proposal's Non-goals.

## Decisions

### D1. Tokens live in a directory named by one environment variable, one file per owner

`CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` names a directory. A regular file in it whose name is a GitHub owner, compared
without regard to case, holds that owner's token: the file's text with surrounding whitespace removed. The variable
has no default; unset, ctxr reads no directory.

**Case for a git path-scoped credential helper as the single source** (`credential.https://github.com/<owner>.helper`
in the global git config, with ctxr asking `git credential fill` for each repository and handing the answer to
`gh` as `GH_TOKEN`): it is git's own mechanism, it needs no new variable, and a bare `git fetch` the agent types in
a mount authenticates too. Nothing new for the operator to learn if they know git.
**Why not:**
- To keep `gh` and git aligned, ctxr would have to run `git credential fill` for every repository, including
  single-owner stores. That changes today's default: `gh` would stop using its own credential and start using
  whatever git's helper chain answers, which on a desktop can be a different account. On some hosts it opens a
  GUI prompt that `GIT_TERMINAL_PROMPT=0` does not stop (a credential manager or keychain helper).
- ctxr cannot tell a scoped answer from the default one. It cannot report which credential it used, and the
  fallthrough on a miss is silent.
- The path match is case-sensitive. A mount declared as `github.com/readyrun-ai/...` would silently fall through
  to the person's token when the helper is written for `ReadyRun-AI`, and fail with a 403 that names nothing.
- The token ends up in a shell snippet or a `store` file referenced from `~/.gitconfig`, which provisioning must
  edit and which other tools also write.

**Case for a map in one variable** (`CONTEXTURE_GITHUB_OWNER_TOKEN_FILES=acme=/run/secrets/acme,...`): every path
is explicit, and token files can sit anywhere, such as separate secret mounts. **Why not:** a list in a variable
needs its own syntax, escaping and error messages, and adding an owner means editing the image's environment
rather than dropping a file. A directory is the shape provisioning already uses for secrets. A secret mounted
elsewhere can be linked into the directory.

**Case for a default directory under the home** (no variable at all): nothing to set on the image. **Why not:**
contexture keeps no user-level directory today, and an opt-in behaviour carries no default. A file appearing in
a well-known place would change which credential a command uses with nothing in the environment saying so.

### D2. The owner comes from the repository's URL

The owner is the first path segment of a github.com URL, https or ssh, as `githubRepositoryOf` already parses it.
For a clone, the URL is its `origin`. For a mount that `shared-stores sync` has not cloned yet, it is the URL the
store declares. A repository whose URL is not a github.com URL has no owner, and keeps today's credential.

**Case for keying by repository** (`owner/repo` files): a token can be narrowed to single repositories. **Why
not:** a fine-grained token is already narrowed to repositories on GitHub's side. Keying ctxr by repository too
would mean one file per mount with the same token in each. The owner is the boundary GitHub enforces, so it is
the key.

### D3. One token reaches both `gh` and git, through the existing command-line helper

For a repository whose owner has a file, the credential kind is `owner-token`. Each `gh` call gets `GH_TOKEN` set
to the token in that call's environment only. Each remote git call goes through `runRemoteGit`, which clears the
host's helpers for that one command and answers with the token from that process's environment, as App mode
does. `GIT_TERMINAL_PROMPT=0` is set, so a refused token fails instead of prompting. With an ssh remote, the token
reaches `gh` only, and git authenticates with ssh as before.

**Case for leaving git alone and relying on the host's helper:** less code. **Why not:** the host's helper is
`gh auth git-credential`, which answers with `gh`'s stored token, not the one ctxr passed. git and `gh` would
disagree for exactly the repositories this change is about.

### D4. Every remote git operation ctxr runs goes through the forge credential

`shared-stores sync` (clone and fetch), `session start` (its fetch), and `update`'s `ls-remote` move onto
`runRemoteGit`, with the credential resolved for the repository they address. A clone has no `origin` yet, so
its credential is resolved from the declared URL (D2).

Without this, the bug moves rather than goes away: sync could not clone the mount, and a session started in the
mount would quietly branch from a stale local default branch, because `session start` treats a failed fetch as an
empty remote.

### D5. Absence is today's behaviour; a broken setup fails loudly

- Variable unset, or no file for a repository's owner: kind `gh`, exactly as today.
- Variable set to a path that is not a readable directory: the command exits with the setup/usage code, naming
  the variable, before any forge call.
- A file for the owner that cannot be read, or is empty after trimming: the same exit, naming the file's path and
  never its content.
- Two files whose names differ only by case: the same exit, naming both, rather than choosing one.

A missing file is not an error, because one owner's token or `gh`'s own credential may well cover the
repository. A file that is present but unusable is a provisioning mistake, and guessing past it would send the
wrong token to GitHub.

### D6. App mode does not read the directory

When the App variables select App mode, the directory is not consulted for any repository. The App is the
recording identity, and its installation tokens are already scoped per repository. The approvals App is installed
on each store a person's sessions touch (approve-sessions-across-stores), so `serve` reaches mounts without owner
tokens. The two modes answer different questions, and `serve`'s container is not given the directory.

**Case for refusing when both are set**, as App mode refuses partial App variables: no guessed precedence.
**Why not:** this is not two answers to one question. A developer's shell can carry both, and App mode is
fully determined by its own variables. The envelope reports `github-app`, so which one applied is visible.

### D7. Reporting names the credential, never the token

Envelopes that report the credential kind report `owner-token` and the owner. `shared-stores status` reports, for
each mount, the credential its owner resolves to: `owner-token` with the owner, `gh`, or `github-app`. It still
makes no network call. When sync's clone or fetch fails and git reports an authorization failure (HTTP 401, 403,
or a repository not found on github.com), the failure reason names the owner, the credential that was used, and
`CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` as the place an owner's token goes.

### D8. No `doctor` check for forge reach

**Case for one:** `doctor` is where an operator looks first, and a mount whose forge the agent cannot reach is a
real problem to catch before a session needs it. **Why not:** `doctor` runs from the pre-commit hook on every
commit, offline, and checks invariants of the store. Reachability is a property of the machine and the network.
A network probe there would make every commit wait on GitHub, and fail commits in a container that is correctly
set up but offline. Whether a credential covers a repository cannot be known without asking the forge. `sync`
already makes the network call, fails non-zero naming the mount, and now names the owner (D7). `status` reports
the credential offline.

## Risks / Trade-offs

- **[A token file readable by other local users]** → The directory and files are provisioned 0700/0600, as the
  `gh` credential is. ctxr does not enforce modes: a container's mounted secrets often carry modes ctxr cannot
  change, and refusing would block a working setup.
- **[The agent can read the token file]** It can read `gh`'s credential today as well. → The gain here is scope:
  a leaked organization token reaches the repositories its owner granted, not everything the person can reach.
- **[A bare `git fetch` in a mount, outside ctxr, still uses the host's helper]** It fails with a 403. → The
  write path never needs it (D4). An operator who wants it can add a path-scoped helper that reads the same file
  (contexture-images follow-up).
- **[Known gap: `gh` run by a skill, outside ctxr, uses `gh`'s own token]** The `ctxr-land` skill reads its
  target with `gh pr view` before landing. → A session is landed from its home store
  (approve-sessions-across-stores D6), so that target is the home store's pull request, which `gh`'s own token
  reaches. Mounted parts are read and merged by `ctxr land`, which uses the owner's token. Pointing the skill at a
  mounted pull request directly would fail with a 403. Moving that read onto `ctxr review list` is a separate
  skill change (harness-portability), not needed for the case this change fixes.
- **[A token expires]** Fine-grained tokens carry an expiry. → The failure is the 401 that sync reports naming
  the owner (D7). Rotation is replacing the file; nothing caches the token across commands.

## Migration Plan

None required. Without the variable nothing changes. On the harness image, contexture-images sets the variable
and writes the files (proposal Impact). Rolling back ctxr leaves the files unread, and the mount returns to
failing with a 403 as today.

## Open Questions

None.

## Implementation notes

Recorded while implementing; none changes a decision.

- **`origin` is read as configured (D2).** The owner comes from `git config --get remote.origin.url`, not
  `git remote get-url origin`, which applies `url.<base>.insteadOf` rewriting. The configured URL is the one the
  store declared, and its owner is the one GitHub enforces; a host that rewrites github.com https URLs to ssh still
  resolves the owner, and git then authenticates with ssh as D3 says. App mode keeps reading `get-url`, as before.
- **Where the owner is reported (D7).** Each envelope that reported `credential` gains `credential_owner` beside it
  (`review list`, `land`, `session list --review`, `sync`, `serve`), and `session submit` now reports both.
  `review list` and `land` also report `store_credentials`, one entry per store reached (the home store, then each
  mount), because their top-level `credential` is the home store's only and the spec's scenario asks for the
  mount's.
- **`shared-stores sync` in App mode.** Moving its clone and fetch onto `runRemoteGit` (D4) means that in App mode a
  mount is now cloned and fetched with the App's installation token for the mount's repository, found from the
  declared URL before a clone. This is the write-lifecycle requirement as written, and the approvals App is
  installed on each mounted store (D6). A token the App cannot mint (not installed there) fails that mount with the
  reason, like a refused fetch, rather than the whole run.
- **Refusals come first.** `shared-stores sync` resolves every mount's credential before it runs any git command, so
  an unusable setup (D5) exits with the setup/usage code having changed nothing.
- **Skill prose (task 4.2).** No shipped skill or `templates/*.md` text needed a change: the skills already route
  every remote operation through `ctxr` commands, which now carry the owner's token.
