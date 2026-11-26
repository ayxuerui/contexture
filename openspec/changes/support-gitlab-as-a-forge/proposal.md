## Why

A contexture store can only live on GitHub. Every forge call goes through `gh api` against GitHub's REST shapes,
the recording identity is a GitHub App or `gh`'s own credential, repositories are recognized by a `github.com`
URL, and the webhook speaks GitHub's signature scheme. A group whose repositories are on gitlab.com or on a
GitLab instance it runs itself cannot open a session pull request, sync a mount with a scoped credential, approve
a change, land it, or keep `ctxr serve` current from a push.

## What Changes

- A repository's forge is read from its remote URL: `github.com` is GitHub, and the one GitLab host the
  environment names (`gitlab.com` when it names none) is GitLab. Nothing about the forge is declared in
  `contexture.yaml`.
- GitLab is reached over its HTTP API with a token from the environment (`CONTEXTURE_GITLAB_TOKEN` or
  `CONTEXTURE_GITLAB_TOKEN_FILE`). The same token authenticates git's transport to that host. No new CLI is
  required on the host or in the image.
- `ctxr session submit`, `session list --review`, `session discard --close-pull-request`, and the MCP tools that
  run them open, update, read and close merge requests on a GitLab store.
- `ctxr shared-stores sync` and every other remote git operation reach a GitLab repository with the GitLab token.
- Change approval works on a GitLab store. The recording identity is the user the token belongs to. A decision is
  a merge-request note by that user carrying the existing decision marker, because GitLab has no review that
  carries a body. `ctxr review list`, `ctxr land` and the approval routes read decisions from those notes. An
  approval is also mirrored as a GitLab approval by that user, so GitLab's own interface and approval rules see
  it; it is never read back as a decision.
- `ctxr land` merges a GitLab merge request only at the approved head. `merge_method: rebase` is refused on a
  GitLab store, where the request cannot choose it.
- `ctxr serve` accepts GitLab push and merge-request deliveries at `POST /hooks/gitlab`, verified by GitLab's
  `X-Gitlab-Token` header against the existing webhook secret. A server exposes only the webhook route of its
  store's forge.
- A session's forge slug may have more than two segments, so a project in a GitLab subgroup
  (`group/subgroup/project`) is addressable in session and decision markers.
- A session that would span two forges is refused when it is joined.
- The land skill reads a pull request's state through `ctxr session list --review` instead of `gh pr view`, so
  it works on either forge.

Nothing changes for a store on GitHub: the same credentials are resolved, the same calls are made, and the
envelopes read the same.

## Capabilities

### New Capabilities
- `forge-access`: how a repository's forge is recognized, which credential reaches it, and what a command
  reports about that credential. The GitHub rules stay where they are today (change-approval, shared-stores,
  write-lifecycle); this capability holds the recognition rule and the GitLab side.

### Modified Capabilities
- `change-approval`: on a GitLab store, the recording identity is the token's user and a decision is a
  merge-request note by it.
- `write-lifecycle`: session commands and landing work against merge requests; a session's slug may have more
  than two segments; a session joined across forges is refused.
- `context-browsing`: the webhook route follows the store's forge, and a GitLab delivery is verified by its
  token header.
- `harness-portability`: the land skill names no forge CLI.

## Impact

- **Code**: `src/core/forge/` gains a forge resolver and a GitLab client behind the existing `ForgeClient`
  interface; `credentials.ts` gains the `gitlab-token` kind. Every `createGhForgeClient` call site
  (`session-submit`, `session-list`, `session-discard`, `review-list`, `land`, `serve`, `store-forges`) asks the
  resolver instead. `approval/decision.ts` readers take decisions from notes on GitLab.
  `approval/session-marker.ts` and `decision.ts` accept longer slugs. `browse/webhook.ts` gains the GitLab route.
  `session/commit.ts` builds the fallback committer address per forge. `errors.ts` stops naming `gh` when the
  forge is GitLab.
- **Templates**: `templates/skills/ctxr-land.md`.
- **Environment**: new `CONTEXTURE_GITLAB_HOST`, `CONTEXTURE_GITLAB_TOKEN`, `CONTEXTURE_GITLAB_TOKEN_FILE`.
- **contexture-images** (separate pull request): `runtime/compose.yaml` passes the three variables, with the
  token as a secret file for `serve`, and a member's own token for the agents container.
- **Existing stores**: none are on GitLab; no migration.
- **Not covered**: two GitLab hosts in one deployment, a GitLab instance under a URL subpath, reading
  GitLab's own approvals as decisions, and per-namespace token files. design.md says why.
