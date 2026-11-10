## 1. Owner tokens in the credential resolver

- [x] 1.1 In `src/core/forge/credentials.ts`, add `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` and the `owner-token` credential kind; resolve a credential from a repository URL as well as from a clone's `origin`; outside App mode, read the owner's file (case-insensitive name, trimmed text) and return a credential whose `env()` sets `GH_TOKEN` and whose `gitToken()` returns the token; leave App mode untouched (design.md D1-D3, D6)
- [x] 1.2 Refuse with `ForgeCredentialsError` (setup/usage exit) an unreadable directory (naming the variable), an unreadable or empty owner file (naming its path), and two names differing only by case (naming both); never put the token in a message (D5)
- [x] 1.3 Report the owner beside the kind wherever a forge client's `credential` reaches an envelope (`review list`, `land`, `session submit`, `sync`)
- [x] 1.4 Unit tests: unset variable reads nothing and yields `gh`; a file for the owner yields `owner-token` for both `gh` env and git; a missing file yields `gh`; case-insensitive match; each refusal; App mode with the directory set never reads it; no token in any error text
- [x] 1.5 Run `npx vitest run test/unit -t "credential"` and confirm it exits 0

## 2. Every remote git call through the forge credential

- [x] 2.1 Move `ctxr shared-stores sync`'s clone and fetch onto `runRemoteGit`, resolving the clone's credential from the declared URL (D4)
- [x] 2.2 Move `ctxr session start`'s fetch (`fetchOrigin` in `src/core/git/worktree.ts`) and `ctxr update`'s `ls-remote` onto `runRemoteGit` with the repository's credential
- [x] 2.3 Confirm `storeForges` resolves a mount's credential from the mount clone's origin, so `review list`, `land` and `session submit` in a mount pick up the owner's token; grep `src` for `git.run([` with `fetch|push|ls-remote|clone` and confirm none remains outside `runRemoteGit`
- [x] 2.4 Integration tests with the fake forge: a fake remote that accepts only token A for owner `ctx-a-owner` and only token B for `ctx-b-org`; sync clones and fetches `ctx-b`, a session started in `shared/ctx-b` fetches and submits, `ctxr land --session` lands both parts, each with its own token; with the variable unset every existing test passes unchanged
- [x] 2.5 Test that after those runs the mount's `origin` URL, `.git/config`, working tree and `--json` output contain no part of either token
- [x] 2.6 Run `npx vitest run test/integration -t "shared-stores|session|land"` and confirm it exits 0

## 3. Reporting

- [x] 3.1 `ctxr shared-stores status`: report each mount's resolved credential (`owner-token` and owner, `gh`, `github-app`) without a network call; add it to the JSON and human output
- [x] 3.2 `ctxr shared-stores sync`: when a clone or fetch fails with HTTP 401/403 or GitHub's "Repository not found", name the owner, the credential kind used, and `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` in the cause (D7)
- [x] 3.3 Tests for both, including a status run that changes no file and spawns no network git command
- [x] 3.4 Run `npx vitest run -t "shared-stores"` and confirm it exits 0

## 4. Documentation and checks

- [x] 4.1 Document `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` in the README beside the GitHub App variables: one file per owner, mode 0600, fine-grained token with Contents and Pull requests read/write and Metadata read on the mounted repositories
- [x] 4.2 Confirm no shipped skill or `templates/*.md` prose needs a change; record in design.md if one does
- [x] 4.3 Run `npm run typecheck && npm test` and confirm both exit 0
- [x] 4.4 Run `openspec validate reach-each-owner-with-its-own-token --strict` and confirm it reports the change valid

## Workflow follow-up

- contexture-images: workspace-init writes each extra owner's token from a host secret to a 0600 file in a
  directory under `/home/agent`, and the image sets `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR` to it. Optionally add a
  git credential helper scoped to `https://github.com/<owner>` that reads the same file, for git run outside ctxr.
- Provision a fine-grained token for the organization owning the mounted store, then run
  `ctxr shared-stores status` and `ctxr shared-stores sync` in the mounting store and confirm the mount clones.
- Archive the change after release.
