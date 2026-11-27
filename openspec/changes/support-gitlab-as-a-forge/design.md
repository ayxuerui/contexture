## Context

See proposal.md for why. What the approach builds on:

- **There is already one seam.** `src/core/forge/github.ts` exports a `ForgeClient` interface (pulls, reviews,
  comments, merge, `fileAt`) and one implementation, `createGhForgeClient`, the only module that spawns `gh`.
  Every consumer takes a `ForgeClient`; seven call sites construct the `gh` one directly.
- **Credentials are resolved per repository.** `credentialsFor(env, cwd, url?)` returns a `ForgeCredentials`
  (`gh`, `github-app`, `owner-token`) for the repository at `cwd` or `url`. `storeForges` already resolves one
  per store root, so a mount's client can differ from the home store's.
- **git's transport follows the credential.** `runRemoteGit` installs a one-command credential helper that
  answers with the credential's token from the process environment.
- **A decision is a review body.** `approval/decision.ts` writes a `ctxr-decision` marker into a pull-request
  review by the recording login. Landing's own records are issue comments by the same login with a `ctxr-land`
  marker. Readers ignore a decision marker anywhere but a review by the recording login.
- **Slugs are `owner/repo`.** `forgeSlugOf` takes the last two path segments of any remote URL, and the marker
  grammar (`SLUG`, `PART` in `decision.ts`) admits exactly one `/`.
- **What GitLab offers** (confirmed against its API reference in task 1.1):
  merge requests with notes, a merge call that takes the expected head `sha` and a `squash` flag, approvals that
  carry no body, `GET /user` for the token's user, https git with the token as the password and any username,
  and webhooks that send the configured secret verbatim in `X-Gitlab-Token`.

## Goals / Non-Goals

**Goals:**
- A store hosted on gitlab.com or on one self-managed GitLab host runs the whole write lifecycle: sessions,
  mounts, approval, landing, the webhook, and the MCP surface that sits on them.
- A GitHub store behaves exactly as before, byte for byte in its envelopes.
- No GitLab secret is stored in `contexture.yaml`, a remote URL, or a command line.

**Non-Goals:**
- Two GitLab hosts in one deployment. One token would otherwise be offered to two hosts (D2).
- A GitLab instance served under a URL subpath (`https://host/gitlab/`).
- GitLab's approval rules as the decision record (D5). An approval is mirrored to GitLab, never read from it.
- Per-namespace token files, the analogue of `CONTEXTURE_GITHUB_OWNER_TOKENS_DIR`. A GitLab token is not bound
  to one namespace the way a GitHub fine-grained token is bound to one owner, so one token reaches every
  repository its user can.
- A session with parts on two forges (D7).
- Gitea, Forgejo, Bitbucket. D1 leaves room; nothing here adds them.

## Decisions

### D1. The forge is recognized from the remote URL, per repository

`github.com` is GitHub. The GitLab host is GitLab. Any other URL is treated as it is today (the `gh` client,
which is what mirrors, proxies and tests rely on, with `CONTEXTURE_GITHUB_REPOSITORY` and
`CONTEXTURE_GITHUB_API_URL`). The resolver returns the forge kind, the host and the slug, and one factory
returns the `ForgeClient` and `ForgeCredentials` for it.

*The case for declaring it in `contexture.yaml` (`git.forge: gitlab`):* it is a fact about the store, it would
travel with the clone, and it needs no environment at all on gitlab.com. Rejected because a mount is resolved
before it is cloned, when only its URL is known; because a store moved between forges would carry a stale
declaration that disagrees with its `origin`; and because the URL already answers the question for the two
public hosts. A new optional key with no default would also have to be explained to every GitHub store.

*The case for probing the host (`GET /api/v4/version`):* zero configuration for self-managed hosts. Rejected: it
sends a request, possibly with a token, to a host nobody named.

### D2. One GitLab host, named by the environment

`CONTEXTURE_GITLAB_HOST` names the GitLab host (`gitlab.example.com`, optionally with a port); unset, it is
`gitlab.com`. The token is sent to that host only, over https only.

*The case for a list of hosts:* a company with gitlab.com and an internal instance. Rejected for now: a token
per host needs a second naming scheme, and one token offered to every listed host is a leak. A list can be added
later without changing the single-host variable.

### D3. GitLab is called over HTTP directly, not through `glab`

The GitLab client uses `fetch` against `https://<host>/api/v4`, addressing the project by its URL-encoded path.

*The case for `glab api`, mirroring `gh api`:* symmetry, `glab`'s own stored login as a zero-setup credential,
and pagination helpers. Rejected: it adds a binary to every host and to the image; `credentials.ts` already
calls GitHub's App endpoints with `fetch`, so the pattern is in the codebase; and `glab`'s stored login would
become the recording identity without anyone naming it. The `gh` client is not rewritten to match.

### D4. One credential kind: a token from the environment

`gitlab-token`: `CONTEXTURE_GITLAB_TOKEN_FILE` (a path) or `CONTEXTURE_GITLAB_TOKEN` (the text). Both set is
refused, as the webhook secret and the App key are. Neither set, a command that needs the GitLab API or a
credentialed git transport exits with the setup/usage code naming both variables; a plain `git` fetch of a
public or ssh remote still works because `runRemoteGit` then leaves git alone.

`login()` is `GET /user`. `gitToken()` is the same token; GitLab accepts any non-empty username with it, so the
existing credential helper serves unchanged.
`derivedSecret()` derives from the token with HKDF, so MCP sign-in survives a restart and rotates with the
token, as it does with an App key.

What kind of token it is stays the operator's choice. For `serve` it should be a project or group access token
(a bot user that exists only for that scope) or a dedicated account's token; the start-time check against
`recording_login` is what makes the choice explicit. For an agent it is the member's own token.

*The case for honoring `GITLAB_TOKEN`:* it is the conventional variable and many environments already set it.
Rejected: an ambient token would silently become a store's recording identity. A `CONTEXTURE_`-prefixed variable
has to be set on purpose.

*The case for a GitLab application (OAuth) as the App analogue:* short-lived tokens. Rejected: GitLab has no
installation-token exchange for a headless service; group and project access tokens are its answer, and they
expire within a year at most, which the tasks document.

### D5. A decision is a merge-request note by the recording identity

On GitLab the decision marker goes in a note. Readers take, as the decision, the latest non-system note by
`recording_login` that carries a well-formed `ctxr-decision` marker. In code this needs no second reader: the
GitLab client returns the merge request's notes from `reviews()` and posts a note from `createReview()`, so
`resolveReviewState` filters them by author and marker exactly as it filters GitHub's reviews. Landing records stay notes with the
`ctxr-land` marker, so both record types are notes, told apart by marker. On GitHub nothing changes: a decision
marker in a comment is still ignored there.

The integrity argument is unchanged. What makes a decision count is who posted it, and only the token's holder
can post as `recording_login`. An agent's token posts as a different user.

*The case for GitLab approvals (`POST …/approve` with `sha`):* the merge request shows as approved in GitLab's
own UI, GitLab binds the approval to a head, and a project's approval rule could then gate the merge button.
Rejected as the record: an approval has no body, so the decider's email, the session parts and the decision id
have nowhere to live; one user can hold only one approval, so a second decider's decision would overwrite
nothing visible; requesting changes with a comment has no free-tier equivalent; and whether a push resets
approvals is a project setting contexture does not control.

Accepted as a mirror (decided 2026-11-25). After the note is written, an approval also calls GitLab's approve
endpoint for the approved head, and a request for changes withdraws the recording identity's approval if it
holds one. The merge request then reads as approved in GitLab's own interface, and a project rule that requires
an approval from the recording identity can be met. The note is written first and stays the only thing readers
consult. A mirror call that fails does not undo the decision: the response and the server's log say the
decision is recorded and the approval was not mirrored, with the forge's reason. If the project requires that
approval, the merge call then fails and `ctxr land` reports `blocked`, as for any refused merge.

*The case against mirroring:* a second write that can fail after the first succeeded, and two places that can
disagree after a push if the project resets approvals. Accepted anyway because the disagreement is one-way
harmless (readers never consult the approval), and without it a store on a project with a required-approval
rule could never land.

### D6. Merging maps to `sha` plus `squash`

`merge_method: squash` (the default) merges with `squash=true` and `merge` with `squash=false`, both always with
the approved head as `sha`, so GitLab refuses a head that moved. `rebase` is refused before any forge
write, with the setup/usage code, because GitLab chooses fast-forward at the project level and a request cannot
ask for it. A project whose settings forbid the requested squash behavior makes the merge call fail, which
`ctxr land` already reports as `blocked` with the forge's reason.

`mergeable: null` maps to GitLab's still-checking merge statuses; the merged commit is the merge commit when
there is one, else the squash commit (a fast-forward project).

### D7. Slugs may have more than two segments; a session stays on one forge

A GitLab project's slug is its full path (`group/subgroup/project`). The marker grammar accepts two or more
segments. `forgeSlugOf` keeps taking the last two segments for a URL on no known forge.

A joined session carries its home slug in its worktree directory name with `--` between segments, and the last
element is the home branch. GitLab forbids consecutive special characters in a group or project path (confirmed
in task 1.2), so on GitLab every `--` is a separator and the name splits back exactly. On GitHub, where a
repository name may hold `--`, the name is split as before: owner, then everything up to the last `--`. A
worktree whose name ctxr did not give falls back to its branch, which still reads a two-segment home only.

`ctxr session start --joins` refuses when either store is on GitLab and the two are not on the same forge
and host. One `recording_login` cannot name a user on two forges, and a slug carries no host, so two hosts could
collide. Reading a mount on another forge (`shared-stores sync`, retrieval) is unaffected.

*The case for flattening nested paths to two segments:* no grammar change. Rejected: `a/b/c` and `a/c` would
collide, and the slug is what a decision names.

### D8. A server exposes only its own forge's webhook route

With a webhook secret, a GitLab store's server has `POST /hooks/gitlab` and no `/hooks/github`, and the reverse
for GitHub. GitLab sends the secret verbatim; it is compared in constant time, and only the event name and
branch are read, as today.

*The case for both routes always:* one less branch, and a mount on the other forge could deliver hints.
Rejected: a route that accepts a plain shared secret should not exist where nothing is meant to call it.

### D9. The land skill stops naming `gh`

`templates/skills/ctxr-land.md` step 2 runs `gh pr view`. It becomes `ctxr session list --review`, which
reports each session's open pull request on either forge and, unlike `ctxr review list`, works on a store that
declares no change approval. A target with no session worktree in the checkout has no row; `ctxr land` reads
that pull request's state itself. The sentence forbidding `gh pr merge` now forbids merging by any forge tool. The submit skill's sentence about `gh`'s credential file stays:
it is true on a GitHub store and harmless on a GitLab one, and rewording it is a separate change to a
requirement another active change touches.

## Risks / Trade-offs

- **API details** were confirmed against GitLab's reference in task 1.1, except three the pages did not state:
  the full list of `detailed_merge_status` values, the status of withdrawing an approval never given (treated
  as success on `404`), and the private commit email form (the fallback committer address is
  `<login>@users.noreply.<host>`). Nothing has been run against a real GitLab project yet (task 9.2).
- **A token in the environment is longer-lived than an installation token** → documented expiry and rotation;
  the token is only sent to the one configured host; envelopes report the kind and never the token.
- **Notes can be edited by their author** → the same is true of a GitHub review body; the author is the
  recording identity in both cases.
- **Project and group access tokens need Premium or Ultimate on gitlab.com** (any license on self-managed) → a
  dedicated account's personal token works everywhere; the README names both.
- **GitLab disables a webhook that keeps failing** (four consecutive failures, then backing off) → the handler
  answers `202` before it does any work, as it does for GitHub, and the timer remains the fallback.
- **`ForgeClient` is GitHub-shaped** (`reviews()` versus `comments()`) → the GitLab client returns no reviews,
  and the decision readers ask one function for "decision records", so the difference lives in one place.
- **Two changes on the same specs** → reach-each-owner-with-its-own-token is merged but not synced, so this
  change adds requirements rather than modifying the ones that change modified, except the two context-browsing
  webhook requirements, which no active change touches.

## Migration Plan

None for existing stores. Rollback is the previous release: a GitLab store then fails as it does today, and no
GitHub behavior was changed.

## Open Questions

- Is a host list (D2) needed for the twenty-person target, or does every group use one GitLab host?
