## Why

A store can mount stores that belong to someone else: a person's own store, owned by their GitHub account, mounts
a company store owned by an organization. The agent working in that person's store calls both forges through one
`gh` credential, and `gh` holds one token per host. GitHub's fine-grained tokens cover one resource owner each, so
the person's token gets HTTP 403 from the organization's repository on every call, down to `git ls-remote`.
`ctxr shared-stores sync` cannot clone the mount, and `ctxr session submit`, `ctxr review list` and `ctxr land`
cannot reach its forge.

The only fix today is a classic token, which reaches every repository the person can reach. An agent that reads
captured material can be prompt-injected, so that token would let it push to all of them. The person should
instead be able to hand the agent a second fine-grained token, scoped to the organization, and have ctxr use it
for that organization's repositories and nothing else.

## What Changes

- **A directory of tokens, one per forge owner.** When the environment sets
  `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR`, a file in that directory named after a GitHub owner holds the token ctxr
  uses for that owner's repositories. The owner is read from the repository's URL: `origin` for a clone, the
  declared URL for a mount not yet cloned.
- **One token for both sides of the forge.** For such a repository, ctxr passes the owner's token to `gh` for that
  one call, and to git for each fetch, push, `ls-remote` and clone it runs, through the command-line credential
  helper that App-mode landing already uses. The token is never written to a remote URL, a git configuration file,
  the store, or any output.
- **Every remote git call ctxr makes goes through the forge credential.** `ctxr shared-stores sync` (clone and
  fetch) and `ctxr session start` (its fetch of the default branch) run plain git today. They join the calls that
  already use the forge credential.
- **Nothing changes without a token file for the owner.** With the variable unset, or no file for a repository's
  owner, ctxr uses `gh`'s own credential and whatever git already has, exactly as today. In GitHub App mode
  (`serve`), the directory is not read.
- **ctxr says which credential it used, never the credential.** Envelopes that report the credential kind report
  `owner-token` and the owner for such a repository. `ctxr shared-stores status` reports, without a network call,
  which credential each mount's owner resolves to. A clone or fetch refused for authorization names the owner and
  the variable.

## Non-goals

- **A classic token, or any token that spans owners.** That is the over-broad credential this change exists to
  avoid.
- **Putting a GitHub App key in the agents' container.** An App key mints a token for every repository the App is
  installed on, and the approvals App's key stays in `serve`'s container (serve-lands-approved-changes D5).
- **Credentials in `contexture.yaml`.** Everyone who clones a store reads all of it. A token, a token path or an
  owner-to-token map is a property of one machine, so it lives in the environment.
- **Configuring git for the agent's own git commands.** ctxr runs every remote git operation of the write path
  itself. An operator who also wants a bare `git fetch` in a mount to authenticate can add a git credential helper
  that reads the same file; ctxr does not write one into git configuration.
- **A `ctxr doctor` check that the forge is reachable.** `doctor` runs offline from the pre-commit hook and checks
  the store, not the machine. `shared-stores sync` is the network check, and it already fails naming the mount.
- **Forges other than github.com.** Owners are read from github.com URLs only. Any other remote keeps today's
  behaviour.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `shared-stores`: a repository whose owner has a token file is reached with that token; sync clones and fetches
  through the forge credential and names the owner when it is refused; status reports each mount's credential.
- `change-approval`: in `gh` mode, the commands that read or record decisions use an owner's token for that
  owner's repositories, and the envelope reports it.
- `write-lifecycle`: every remote git operation ctxr runs (session start's fetch, submit's push, landing, syncing)
  authenticates with the repository's forge credential, so an owner's token reaches git as well as `gh`.

## Impact

- `src/core/forge/credentials.ts`: owner tokens in the `gh` path, a new `owner-token` credential kind, resolution
  from a repository URL as well as from `origin`.
- `src/core/approval/store-forges.ts`: mounts resolve to their owner's token.
- `src/commands/shared-stores-sync.ts`, `src/commands/shared-stores-status.ts`, `src/commands/session-start.ts`
  (and `src/core/git/worktree.ts`'s `fetchOrigin`), `src/commands/update.ts`'s `ls-remote`: remote git through
  `runRemoteGit`.
- `serve` is unaffected in App mode. The approvals App is installed per repository, and its installation already
  covers each mounted store it must read.
- **Follow-up in contexture-images (not edited by this change):** workspace-init persists the agent's `gh`
  credential under `/home/agent`. It gains a step that writes each extra owner's fine-grained token to a file,
  mode 0600, in a directory under `/home/agent`, and the image sets `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` to that
  directory. The token comes from a host secret, as the `gh` token does. The organization's token needs Contents
  and Pull requests read/write and Metadata read on the mounted repository, and nothing else.
- No configuration key is added. One environment variable is added.
